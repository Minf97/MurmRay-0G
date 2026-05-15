import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createEmbeddingWorker } from './services/embeddings/service';
import { createAnalysisService } from './services/opportunity/service';

const DEFAULT_PORT = 8789;
const HOST = '127.0.0.1';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// 读取环境
function loadEnvFiles(): void {
  for (const relativePath of ['.env.local', '.env']) {
    const filePath = resolve(process.cwd(), relativePath);
    if (!existsSync(filePath)) continue;

    const content = readFileSync(filePath, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const separatorIndex = line.indexOf('=');
      if (separatorIndex <= 0) continue;

      const key = line.slice(0, separatorIndex).trim();
      const rawValue = line.slice(separatorIndex + 1).trim();
      const value = rawValue.replace(/^['"]|['"]$/g, '');

      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

// 叠加头部
function applyCors(response: Response): Response {
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

// 发 JSON
function jsonResponse(c: { json: (payload: unknown, status: number) => Response }, status: number, payload: unknown): Response {
  return applyCors(c.json(payload, status));
}

// 判定状态
function normalizeErrorStatus(error: unknown): number {
  const message = error instanceof Error ? error.message : String(error || '');
  if (
    message.includes('Invalid page context')
    || message.includes('Unsupported action')
    || message.includes('Summary is empty')
  ) {
    return 400;
  }

  return 500;
}

loadEnvFiles();

const service = createAnalysisService();
const embeddingWorker = createEmbeddingWorker();
const port = Number(process.env.MURMRAY_BACKEND_PORT || DEFAULT_PORT);
const app = new Hono();

// 处理路由
app.use('*', async (c, next) => {
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Headers', 'content-type');
  c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (c.req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  await next();
});

app.get('/health', (c) => jsonResponse(c, 200, { ok: true }));

app.post('/api/polymarket-opportunity', async (c) => {
  try {
    const body = await c.req.json();
    const result = await service.analyze(body);
    return jsonResponse(c, 200, result);
  } catch (error) {
    const status = normalizeErrorStatus(error);
    const message = error instanceof Error ? error.message : String(error || '分析失败');
    console.error('[murmray-backend] request failed:', error);
    return jsonResponse(c, status, { error: message });
  }
});

app.post('/api/polymarket-embeddings', async (c) => {
  try {
    const body = await c.req.json();
    const result = await embeddingWorker.run(body);
    return jsonResponse(c, 200, result);
  } catch (error) {
    const status = normalizeErrorStatus(error);
    const message = error instanceof Error ? error.message : String(error || 'Embedding worker failed');
    console.error('[murmray-backend] embedding worker failed:', error);
    return jsonResponse(c, status, { error: message });
  }
});

const server = serve(
  {
    fetch: app.fetch,
    port,
    hostname: HOST,
  },
  (info) => {
    console.log(`[murmray-backend] listening on http://${HOST}:${info.port}`);
  },
);

// 平滑退出
function shutdown(): void {
  server.close(() => {
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
