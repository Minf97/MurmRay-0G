import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { createEmbeddingWorker } from './services/embeddings/service.js';
import { createAnalysisService } from './services/opportunity/service.js';
import { createSyncService } from './services/sync/service.js';
import { createZeroGProofApp } from './services/zero-g/app.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization, x-murmray-proof-key',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

interface BackendAppOptions {
  env?: Record<string, string | undefined>;
  analysisService?: ReturnType<typeof createAnalysisService>;
  embeddingWorker?: ReturnType<typeof createEmbeddingWorker>;
  syncService?: ReturnType<typeof createSyncService>;
  zeroGApp?: ReturnType<typeof createZeroGProofApp>;
}

// 叠加头部
function applyCors(response: Response): Response {
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

// 发 JSON
function jsonResponse(c: { json: (payload: unknown, status: ContentfulStatusCode) => Response }, status: number, payload: unknown): Response {
  return applyCors(c.json(payload, status as ContentfulStatusCode));
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

// 创建应用
export function createBackendApp(options: BackendAppOptions = {}) {
  const env = options.env ?? process.env;
  const service = options.analysisService ?? createAnalysisService({ env });
  const embeddingWorker = options.embeddingWorker ?? createEmbeddingWorker({ env });
  const syncService = options.syncService ?? createSyncService({ env });
  const zeroGApp = options.zeroGApp ?? createZeroGProofApp({ env });
  const app = new Hono();

  // 处理跨域
  app.use('*', async (c, next) => {
    c.header('Access-Control-Allow-Origin', '*');
    c.header('Access-Control-Allow-Headers', 'content-type, authorization, x-murmray-proof-key');
    c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    if (c.req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    await next();
  });

  app.get('/health', (c) => jsonResponse(c, 200, { ok: true, service: 'murmray-backend' }));

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

  app.post('/api/polymarket-sync', async (c) => {
    try {
      const body = await c.req.json();
      const result = await syncService.run(body);
      return jsonResponse(c, 200, result);
    } catch (error) {
      const status = normalizeErrorStatus(error);
      const message = error instanceof Error ? error.message : String(error || 'Sync failed');
      console.error('[murmray-backend] sync failed:', error);
      return jsonResponse(c, status, { error: message });
    }
  });

  app.route('/', zeroGApp);

  return app;
}
