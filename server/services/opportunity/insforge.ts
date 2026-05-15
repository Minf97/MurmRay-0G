import { mapInsforgeMarket } from './market';
import { createInsforgeClient as createSharedInsforgeClient } from '../shared/insforge';
import type { InsforgeClient, ServerEnv, VectorCandidate } from './types';

// 建客户端
export function createInsforgeClient(env: ServerEnv): InsforgeClient {
  return createSharedInsforgeClient<InsforgeClient>(env);
}

// 取向量候选
async function fetchTopEmbeddingCandidates(
  client: InsforgeClient,
  embedding: number[],
  topK: number,
  prefetchCount: number,
): Promise<VectorCandidate[]> {
  const vectorStr = `[${embedding.join(',')}]`;
  const { data, error } = await client.database.rpc('match_polymarket_market_embeddings', {
    query_embedding: vectorStr,
    match_count: topK,
    prefetch_count: prefetchCount,
  });

  if (error) {
    throw new Error(`Vector search failed: ${error.message}`);
  }

  if (!Array.isArray(data)) {
    throw new Error('Vector search returned invalid rows');
  }

  return data.map(mapInsforgeMarket);
}

// 合并候选
export function mergeCandidateLists(candidateLists: VectorCandidate[][], topK: number): VectorCandidate[] {
  const merged = new Map<number, VectorCandidate>();

  for (const list of candidateLists) {
    for (const item of list) {
      if (!Number.isFinite(item.distance)) {
        throw new Error('Invalid market distance');
      }

      const marketId = item.id;
      const existing = merged.get(marketId);
      if (!existing || item.distance < existing.distance) {
        merged.set(marketId, {
          ...item,
        });
      }
    }
  }

  return Array.from(merged.values())
    .sort((left, right) => left.distance - right.distance)
    .slice(0, topK);
}

// 统计开盘
export async function countOpenMarkets(client: InsforgeClient, nowIso: string): Promise<number> {
  const { count, error } = await client.database
    .from('polymarket_markets_active')
    .select('id', { count: 'exact', head: true })
    .eq('acceptingorders', true)
    .gt('enddate', nowIso);

  if (error) {
    throw new Error(`Count open markets failed: ${error.message}`);
  }

  const normalizedCount = Number(count);
  if (!Number.isFinite(normalizedCount)) {
    throw new Error('Count open markets returned invalid count');
  }

  return normalizedCount;
}

// 查询候选
export async function fetchVectorCandidates(
  client: InsforgeClient,
  queryEmbeddings: number[][],
  topK: number,
  prefetchCount: number,
): Promise<VectorCandidate[]> {
  const candidateLists = await Promise.all(
    queryEmbeddings
      .filter((embedding) => Array.isArray(embedding) && embedding.length > 0)
      .map((embedding) => fetchTopEmbeddingCandidates(client, embedding, topK, prefetchCount)),
  );

  return mergeCandidateLists(candidateLists, topK);
}
