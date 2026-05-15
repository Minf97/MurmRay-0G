import {
  EMBEDDING_RETRIES,
  sleep,
} from './config';
import { resolveOpenRouterEmbeddingConfig, toVectorLiteral } from '../shared/openrouter';
import type { EmbeddingOptions, FetchImpl, ServerEnv } from './types';

// 解析配置
export function resolveEmbeddingOptions(env: ServerEnv, expectedDimensions: number): EmbeddingOptions {
  return {
    ...resolveOpenRouterEmbeddingConfig(env),
    expectedDimensions,
  };
}

export { toVectorLiteral };

// 读向量
function readEmbeddingVector(data: unknown, expectedDimensions: number): number[] {
  const json = data as { data?: { embedding?: unknown }[] };
  const rows = Array.isArray(json?.data) ? json.data : [];
  if (rows.length !== 1) {
    throw new Error(`Embedding response size mismatch: expected 1, got ${rows.length}`);
  }

  if (!Array.isArray(rows[0]?.embedding)) {
    throw new Error('Empty embedding vector');
  }

  const vector = rows[0].embedding.map((value) => Number(value));
  if (vector.length === 0 || vector.some((value) => !Number.isFinite(value))) {
    throw new Error('Invalid embedding vector');
  }

  if (vector.length !== expectedDimensions) {
    throw new Error(`Embedding dimension mismatch: expected ${expectedDimensions}, got ${vector.length}`);
  }

  return vector;
}

// 单次请求
async function requestEmbedding(text: string, options: EmbeddingOptions & { fetchImpl: FetchImpl }): Promise<number[]> {
  const response = await options.fetchImpl(`${options.apiBaseUrl.replace(/\/+$/, '')}/embeddings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'HTTP-Referer': options.httpReferer,
      'X-Title': options.appTitle,
    },
    body: JSON.stringify({
      model: options.model,
      input: text,
      encoding_format: 'float',
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HTTP ${response.status}: ${body.slice(0, 400)}`);
  }

  return readEmbeddingVector(await response.json(), options.expectedDimensions);
}

// 请求向量
export async function callEmbeddingSingle(text: string, options: EmbeddingOptions & {
  fetchImpl: FetchImpl;
  sleepImpl?: (ms: number) => Promise<void>;
}): Promise<{ vector: number[]; attemptsUsed: number }> {
  const sleepImpl = options.sleepImpl || sleep;
  let lastError = '';

  for (let attempt = 1; attempt <= EMBEDDING_RETRIES; attempt += 1) {
    try {
      const vector = await requestEmbedding(text, options);
      return { vector, attemptsUsed: attempt };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt >= EMBEDDING_RETRIES) {
        const finalError = new Error(`Embedding request failed: ${lastError}`);
        (finalError as Error & { attemptsUsed?: number }).attemptsUsed = attempt;
        throw finalError;
      }
      await sleepImpl(300 * attempt);
    }
  }

  throw new Error('Embedding request failed');
}
