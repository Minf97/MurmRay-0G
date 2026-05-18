import {
  DEFAULT_OPENROUTER_APP_TITLE,
  DEFAULT_OPENROUTER_EMBED_MODEL,
  DEFAULT_OPENROUTER_HTTP_REFERER,
  OPENROUTER_API_BASE_URL,
} from './config.js';
import type { ServerEnv } from './insforge.js';

export interface OpenRouterEmbeddingConfig {
  apiBaseUrl: string;
  model: string;
  apiKey: string;
  httpReferer: string;
  appTitle: string;
}

// 读取密钥
export function readOpenRouterEmbeddingApiKey(env: ServerEnv): string {
  const apiKey = env.OPENROUTER_EMBEDDING_API_KEY || env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('Missing OPENROUTER_API_KEY or OPENROUTER_EMBEDDING_API_KEY');
  }
  return apiKey;
}

// 嵌入配置
export function resolveOpenRouterEmbeddingConfig(env: ServerEnv): OpenRouterEmbeddingConfig {
  return {
    apiBaseUrl: env.OPENROUTER_API_BASE_URL || OPENROUTER_API_BASE_URL,
    model: env.OPENROUTER_EMBED_MODEL || DEFAULT_OPENROUTER_EMBED_MODEL,
    apiKey: readOpenRouterEmbeddingApiKey(env),
    httpReferer: env.OPENROUTER_HTTP_REFERER || DEFAULT_OPENROUTER_HTTP_REFERER,
    appTitle: env.OPENROUTER_APP_TITLE || DEFAULT_OPENROUTER_APP_TITLE,
  };
}

// 向量文本
export function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}
