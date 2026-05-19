interface SocketAddress {
  hostname: string;
  port: number;
}

interface SocketLike {
  opened?: Promise<unknown>;
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  close?: () => Promise<void>;
}

type SocketConnect = (address: SocketAddress, options?: { secureTransport?: 'off' | 'on' | 'starttls' }) => SocketLike;

interface SocketModule {
  connect: SocketConnect;
}

interface SocketFetchInit {
  body?: BodyInit | null;
  headers?: HeadersInit;
  method?: string;
}

const HEADER_END = new Uint8Array([13, 10, 13, 10]);
const LINE_END = new Uint8Array([13, 10]);
const SOCKET_HTTP_TIMEOUT_MS = 12_000;
let socketConnectPromise: Promise<SocketConnect> | null = null;

// 预览响应
function previewBytes(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes.slice(0, 120)).replace(/[^\x20-\x7e\r\n]/g, '.');
}

// 查找字节
function findBytes(bytes: Uint8Array, needle: Uint8Array, offset = 0): number {
  for (let index = offset; index <= bytes.length - needle.length; index += 1) {
    let matched = true;
    for (let inner = 0; inner < needle.length; inner += 1) {
      if (bytes[index + inner] !== needle[inner]) {
        matched = false;
        break;
      }
    }
    if (matched) return index;
  }
  return -1;
}

// 拼接字节
function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

// 读取行尾
function readLineEnd(bytes: Uint8Array, offset: number): number {
  const lineEnd = findBytes(bytes, LINE_END, offset);
  if (lineEnd < 0) throw new Error('Invalid chunked HTTP response.');
  return lineEnd;
}

// 解分块体
function decodeChunkedBody(bytes: Uint8Array): Uint8Array {
  const chunks: Uint8Array[] = [];
  let offset = 0;

  while (offset < bytes.length) {
    const lineEnd = readLineEnd(bytes, offset);
    const sizeLine = new TextDecoder().decode(bytes.slice(offset, lineEnd)).split(';')[0].trim();
    const size = Number.parseInt(sizeLine, 16);
    if (!Number.isFinite(size)) throw new Error('Invalid chunked HTTP response.');

    offset = lineEnd + LINE_END.length;
    if (size === 0) return concatBytes(chunks);

    const chunkEnd = offset + size;
    if (chunkEnd + LINE_END.length > bytes.length) throw new Error('Invalid chunked HTTP response.');
    chunks.push(bytes.slice(offset, chunkEnd));
    offset = chunkEnd + LINE_END.length;
  }

  throw new Error('Invalid chunked HTTP response.');
}

// 解析响应
export function parseRawHttpResponse(bytes: Uint8Array): Response {
  const headerEnd = findBytes(bytes, HEADER_END);
  if (headerEnd < 0) throw new Error(`Invalid HTTP response: ${bytes.byteLength} bytes ${previewBytes(bytes)}`);

  const headerText = new TextDecoder().decode(bytes.slice(0, headerEnd));
  const [statusLine, ...headerLines] = headerText.split('\r\n');
  const statusMatch = /^HTTP\/\d(?:\.\d)?\s+(\d{3})(?:\s+(.*))?$/.exec(statusLine);
  if (!statusMatch) throw new Error('Invalid HTTP response.');

  const headers = new Headers();
  for (const line of headerLines) {
    const separator = line.indexOf(':');
    if (separator <= 0) continue;
    headers.append(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
  }

  const rawBody = bytes.slice(headerEnd + HEADER_END.length);
  const body = headers.get('transfer-encoding')?.toLowerCase().includes('chunked')
    ? decodeChunkedBody(rawBody)
    : rawBody.slice(0, Number(headers.get('content-length') || rawBody.length));

  return new Response(body, {
    headers,
    status: Number(statusMatch[1]),
    statusText: statusMatch[2] || '',
  });
}

// 读取正文
async function readBodyBytes(body: BodyInit | null | undefined): Promise<Uint8Array> {
  if (!body) return new Uint8Array();
  return new Uint8Array(await new Response(body).arrayBuffer());
}

// 读取连接
async function readSocketConnect(): Promise<SocketConnect> {
  if (!socketConnectPromise) {
    socketConnectPromise = import('cloudflare:sockets')
      .then((module) => (module as SocketModule).connect);
  }
  return socketConnectPromise;
}

// 等待超时
export async function withSocketTimeout<T>(
  promise: Promise<T>,
  label: string,
  timeoutMs = SOCKET_HTTP_TIMEOUT_MS,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Socket HTTP ${label} timed out.`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

// 判断直连
export function shouldUseSocketHttp(rawUrl: string): boolean {
  const url = new URL(rawUrl);
  return url.protocol === 'http:' && Boolean(url.port) && url.port !== '80';
}

// 构造请求
export async function buildSocketHttpRequest(rawUrl: string, init: SocketFetchInit): Promise<Uint8Array> {
  const url = new URL(rawUrl);
  const method = (init.method || 'GET').toUpperCase();
  const body = await readBodyBytes(init.body);
  const headers = new Headers(init.headers);
  const path = `${url.pathname || '/'}${url.search}`;

  headers.set('host', url.host);
  headers.set('connection', 'close');
  headers.set('accept-encoding', 'identity');
  headers.set('content-length', String(body.byteLength));

  const headerLines = [`${method} ${path} HTTP/1.1`];
  headers.forEach((value, key) => {
    headerLines.push(`${key}: ${value}`);
  });

  return concatBytes([
    new TextEncoder().encode(`${headerLines.join('\r\n')}\r\n\r\n`),
    body,
  ]);
}

// 发送直连
export async function fetchSocketHttp(rawUrl: string, init: SocketFetchInit): Promise<Response> {
  const url = new URL(rawUrl);
  const connect = await readSocketConnect();
  const socket = connect({ hostname: url.hostname, port: Number(url.port || 80) }, { secureTransport: 'off' });
  const writer = socket.writable.getWriter();
  const reader = socket.readable.getReader();
  const chunks: Uint8Array[] = [];

  try {
    await withSocketTimeout(Promise.resolve(socket.opened), 'open');
    await withSocketTimeout(writer.write(await buildSocketHttpRequest(rawUrl, init)), 'write');
    writer.releaseLock();

    while (true) {
      const { done, value } = await withSocketTimeout(reader.read(), 'read');
      if (done) break;
      if (value) chunks.push(value);
    }
  } finally {
    reader.releaseLock();
    await socket.close?.();
  }

  return parseRawHttpResponse(concatBytes(chunks));
}
