import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { createZeroGProofService } from './service.js';
import { assertSignalHash } from './validation.js';
import { renderZeroGProofPage } from './page.js';
import { ProofHttpError } from './types.js';

interface AppOptions {
  env?: Record<string, string | undefined>;
  proofKey?: string;
  service?: ReturnType<typeof createZeroGProofService>;
}

// 校验密钥
function requireProofAuth(expectedKey: string, request: Request): void {
  const bearer = request.headers.get('authorization');
  const headerKey = request.headers.get('x-murmray-proof-key');
  const supplied = bearer?.startsWith('Bearer ') ? bearer.slice(7).trim() : headerKey?.trim();

  if (supplied !== expectedKey) {
    throw new ProofHttpError(401, 'Unauthorized proof request.');
  }
}

// 读错误码
function readErrorStatus(error: unknown): number {
  if (error instanceof ProofHttpError) return error.status;
  return 500;
}

// 读错误文
function readErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Internal Server Error';
}

// 创建应用
export function createZeroGProofApp(options: AppOptions = {}) {
  const env = options.env ?? process.env;
  const service = options.service ?? createZeroGProofService({ env });
  const app = new Hono();

  app.use('*', async (c, next) => {
    c.header('Access-Control-Allow-Origin', '*');
    c.header('Access-Control-Allow-Headers', 'content-type, authorization, x-murmray-proof-key');
    c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    if (c.req.method === 'OPTIONS') {
      return c.body(null, 204);
    }

    await next();
  });

  app.onError((error, c) => {
    const status = readErrorStatus(error);
    return c.json({ error: readErrorMessage(error) }, status as ContentfulStatusCode);
  });

  app.get('/health', (c) => c.json({ ok: true, service: 'zero-g-proof' }));
  app.get('/0g-proof', (c) => c.html(renderZeroGProofPage()));

  app.post('/api/0g/signals', async (c) => {
    const expectedKey = options.proofKey ?? env.MURMRAY_PROOF_API_KEY?.trim();
    if (!expectedKey) {
      throw new ProofHttpError(500, 'Missing MURMRAY_PROOF_API_KEY.');
    }
    requireProofAuth(expectedKey, c.req.raw);
    const body = await c.req.json();
    const proof = await service.publishSignal(body);
    return c.json({ proof }, 201);
  });

  app.get('/api/0g/proofs', async (c) => {
    const proofs = await service.listProofs(c.req.query('limit'));
    return c.json({ proofs });
  });

  app.get('/api/0g/proofs/:signalHash', async (c) => {
    const proof = await service.findProof(assertSignalHash(c.req.param('signalHash')));
    if (!proof) {
      throw new ProofHttpError(404, 'Proof not found.');
    }
    return c.json({ proof });
  });

  return app;
}
