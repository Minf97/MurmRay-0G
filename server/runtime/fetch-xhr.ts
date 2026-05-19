type XhrHandler = ((event: Event) => void) | null;

import { fetchSocketHttp, shouldUseSocketHttp } from './socket-http.js';
import { readRuntimeFetch } from './fetch.js';

interface FetchXhrGlobal {
  XMLHttpRequest?: typeof XMLHttpRequest;
}

const DONE = 4;

// 事件对象
function createXhrEvent(type: string): Event {
  return new Event(type);
}

// 响应文本
async function readResponse(response: Response, responseType: XMLHttpRequestResponseType): Promise<{ text: string; value: unknown }> {
  const buffer = await response.arrayBuffer();
  if (responseType === 'arraybuffer') return { text: '', value: buffer };
  if (responseType === 'blob') return { text: '', value: new Blob([buffer]) };

  const text = new TextDecoder().decode(buffer);
  return { text, value: responseType === 'json' && text ? JSON.parse(text) : text };
}

// 发送请求
function requestWithRuntimeFetch(url: string, init: RequestInit): Promise<Response> {
  if (shouldUseSocketHttp(url)) return fetchSocketHttp(url, init);
  return readRuntimeFetch()(url, init);
}

// Fetch 适配
class FetchXMLHttpRequest {
  static readonly UNSENT = 0;
  static readonly OPENED = 1;
  static readonly HEADERS_RECEIVED = 2;
  static readonly LOADING = 3;
  static readonly DONE = DONE;

  readonly UNSENT = 0;
  readonly OPENED = 1;
  readonly HEADERS_RECEIVED = 2;
  readonly LOADING = 3;
  readonly DONE = DONE;
  readonly upload = {
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };

  readyState = 0;
  response: unknown = null;
  responseText = '';
  responseType: XMLHttpRequestResponseType = '';
  responseURL = '';
  status = 0;
  statusText = '';
  timeout = 0;
  withCredentials = false;
  onabort: XhrHandler = null;
  onerror: XhrHandler = null;
  onloadend: XhrHandler = null;
  onreadystatechange: XhrHandler = null;
  ontimeout: XhrHandler = null;

  private controller: AbortController | null = null;
  private headers = new Headers();
  private listeners = new Map<string, Set<(event: Event) => void>>();
  private method = 'GET';
  private responseHeaders = new Headers();
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private timedOut = false;
  private url = '';

  // 打开请求
  open(method: string, url: string): void {
    this.method = method.toUpperCase();
    this.url = url;
    this.readyState = this.OPENED;
    this.dispatch('readystatechange');
  }

  // 设置头部
  setRequestHeader(name: string, value: string): void {
    if (value !== undefined) this.headers.append(name, String(value));
  }

  // 全部头部
  getAllResponseHeaders(): string {
    return Array.from(this.responseHeaders.entries())
      .map(([key, value]) => `${key}: ${value}`)
      .join('\r\n');
  }

  // 单个头部
  getResponseHeader(name: string): string | null {
    return this.responseHeaders.get(name);
  }

  // 兼容空实现
  overrideMimeType(): void {}

  // 监听事件
  addEventListener(type: string, listener: (event: Event) => void): void {
    const listeners = this.listeners.get(type) ?? new Set<(event: Event) => void>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  // 移除监听
  removeEventListener(type: string, listener: (event: Event) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  // 发送请求
  send(body: BodyInit | null = null): void {
    this.controller = new AbortController();
    this.timedOut = false;
    this.sendWithFetch(body).catch((error) => {
      this.finishError(error);
    });
  }

  // 中断请求
  abort(): void {
    this.controller?.abort();
    this.status = 0;
    this.readyState = DONE;
    this.dispatch('abort');
    this.dispatch('loadend');
  }

  // 发起 Fetch
  private async sendWithFetch(body: BodyInit | null): Promise<void> {
    if (this.timeout > 0) {
      this.timeoutId = setTimeout(() => {
        this.timedOut = true;
        this.controller?.abort();
      }, this.timeout);
    }

    const response = await requestWithRuntimeFetch(this.url, {
      body: this.method === 'GET' || this.method === 'HEAD' ? undefined : body,
      headers: this.headers,
      method: this.method,
      signal: this.controller.signal,
    });
    this.clearTimeout();

    this.status = response.status;
    this.statusText = response.statusText;
    this.responseURL = response.url;
    this.responseHeaders = response.headers;
    this.readyState = this.HEADERS_RECEIVED;
    this.dispatch('readystatechange');

    const result = await readResponse(response, this.responseType);
    this.responseText = result.text;
    this.response = result.value;
    this.readyState = DONE;
    this.dispatch('readystatechange');
    this.dispatch('loadend');
  }

  // 结束错误
  private finishError(error: unknown): void {
    this.clearTimeout();
    this.status = 0;
    this.readyState = DONE;
    if (this.timedOut) {
      this.dispatch('timeout');
      this.dispatch('loadend');
      return;
    }
    if (error instanceof DOMException && error.name === 'AbortError') {
      this.dispatch('abort');
      this.dispatch('loadend');
      return;
    }
    console.error('[murmray-backend] xhr request failed:', error);
    this.dispatch('error');
    this.dispatch('loadend');
  }

  // 清理定时
  private clearTimeout(): void {
    if (this.timeoutId) clearTimeout(this.timeoutId);
    this.timeoutId = null;
  }

  // 派发事件
  private dispatch(type: string): void {
    const event = createXhrEvent(type);
    this.listeners.get(type)?.forEach((listener) => listener(event));
    const handler = this[`on${type}` as keyof FetchXMLHttpRequest] as XhrHandler;
    if (handler) handler(event);
  }
}

// 安装适配
export function installFetchXMLHttpRequest(): void {
  (globalThis as FetchXhrGlobal).XMLHttpRequest = FetchXMLHttpRequest as unknown as typeof XMLHttpRequest;
}
