import { APPLY_CHUNK_SIZE, MARK_CHUNK_SIZE, chunkArray } from './config.js';
import { createInsforgeClient as createSharedInsforgeClient } from '../shared/insforge.js';
import type {
  EmbeddingApplyRow,
  EmbeddingInsforgeClient,
  EmbeddingJob,
  FailedEmbeddingJob,
} from './types.js';
import type { ServerEnv } from '../shared/insforge.js';

// 建客户端
export function createEmbeddingInsforgeClient(env: ServerEnv): EmbeddingInsforgeClient {
  return createSharedInsforgeClient<EmbeddingInsforgeClient>(env);
}

// 读数字
function readRpcNumber(data: unknown, label: string): number {
  const value = Number(data);
  if (!Number.isFinite(value)) {
    throw new Error(`${label} returned invalid count`);
  }
  return value;
}

// 映射任务
function mapEmbeddingJob(raw: unknown): EmbeddingJob {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid embedding job');
  const row = raw as EmbeddingJob;
  if (!Number.isFinite(row.market_id)) throw new Error('Invalid embedding job market_id');
  if (typeof row.embed_text !== 'string' || !row.embed_text.trim()) {
    throw new Error('Invalid embedding job text');
  }
  return {
    market_id: row.market_id,
    embed_text: row.embed_text,
    source_updated_at: row.source_updated_at,
  };
}

// 补任务
export async function enqueueMissingActiveMarkets(client: EmbeddingInsforgeClient, limit: number): Promise<number> {
  if (limit <= 0) return 0;

  const { data, error } = await client.database.rpc('enqueue_missing_polymarket_embedding_jobs', {
    job_limit: limit,
  });
  if (error) throw new Error(`Failed to enqueue missing embedding jobs: ${error.message}`);
  return readRpcNumber(data, 'enqueue_missing_polymarket_embedding_jobs');
}

// 认领任务
export async function claimEmbeddingJobs(
  client: EmbeddingInsforgeClient,
  limit: number,
  staleLockSeconds: number,
): Promise<EmbeddingJob[]> {
  const { data, error } = await client.database.rpc('claim_polymarket_embedding_jobs', {
    job_limit: limit,
    stale_seconds: staleLockSeconds,
  });
  if (error) throw new Error(`Failed to claim embedding jobs: ${error.message}`);
  if (!Array.isArray(data)) throw new Error('Claim embedding jobs returned invalid rows');
  return data.map(mapEmbeddingJob);
}

// 写入向量
export async function applyEmbeddingResults(
  client: EmbeddingInsforgeClient,
  rows: EmbeddingApplyRow[],
): Promise<number> {
  if (rows.length === 0) return 0;

  let total = 0;
  for (const chunk of chunkArray(rows, APPLY_CHUNK_SIZE)) {
    const { data, error } = await client.database.rpc('apply_polymarket_embedding_results', {
      payload: chunk,
    });
    if (error) throw new Error(`Failed to apply embedding results: ${error.message}`);
    total += readRpcNumber(data, 'apply_polymarket_embedding_results');
  }
  return total;
}

// 标记完成
export async function markJobsDone(client: EmbeddingInsforgeClient, marketIds: number[]): Promise<number> {
  if (marketIds.length === 0) return 0;

  let total = 0;
  for (const chunk of chunkArray(marketIds, MARK_CHUNK_SIZE)) {
    const { data, error } = await client.database.rpc('finish_polymarket_embedding_jobs_done', {
      job_ids: chunk,
    });
    if (error) throw new Error(`Failed to mark jobs done: ${error.message}`);
    total += readRpcNumber(data, 'finish_polymarket_embedding_jobs_done');
  }
  return total;
}

// 标记失败
export async function markJobsFailed(
  client: EmbeddingInsforgeClient,
  failedRows: FailedEmbeddingJob[],
): Promise<number> {
  if (failedRows.length === 0) return 0;

  let total = 0;
  for (const row of failedRows) {
    const { data, error } = await client.database.rpc('finish_polymarket_embedding_jobs_failed', {
      job_ids: [row.market_id],
      error_text: row.error.slice(0, 600),
    });
    if (error) throw new Error(`Failed to mark jobs failed: ${error.message}`);
    total += readRpcNumber(data, 'finish_polymarket_embedding_jobs_failed');
  }
  return total;
}
