export type FetchImpl = typeof fetch;
export type { ServerEnv } from '../shared/insforge';

export interface EmbeddingWorkerRequest {
  action?: unknown;
  concurrency?: unknown;
  workerConcurrency?: unknown;
  reconcileLimit?: unknown;
  staleLockSeconds?: unknown;
  maxDurationMs?: unknown;
  expectedDimensions?: unknown;
  dimensions?: unknown;
}

export interface EmbeddingJob {
  market_id: number;
  embed_text: string;
  source_updated_at: string | null;
}

export interface EmbeddingApplyRow {
  market_id: number;
  embed_text: string;
  embedding_text: string;
  source_updated_at: string | null;
  synced_at: string;
}

export interface FailedEmbeddingJob {
  market_id: number;
  error: string;
}

export type RpcResult = Promise<{
  data?: unknown;
  error?: { message?: string } | null;
}>;

export interface EmbeddingInsforgeClient {
  database: {
    rpc: (fn: string, args?: Record<string, unknown>) => RpcResult;
  };
}

export interface EmbeddingOptions {
  apiBaseUrl: string;
  model: string;
  apiKey: string;
  httpReferer: string;
  appTitle: string;
  expectedDimensions: number;
}

export interface CreateEmbeddingWorkerOptions {
  env?: ServerEnv;
  fetchImpl?: FetchImpl;
  now?: () => number;
  sleepImpl?: (ms: number) => Promise<void>;
  insforgeClient?: EmbeddingInsforgeClient;
}
