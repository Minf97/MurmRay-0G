import { chunkArray } from '../shared/config.js';
import { createInsforgeClient as createSharedInsforgeClient } from '../shared/insforge.js';
import { EXISTING_FETCH_CHUNK, UPSERT_CHUNK_SIZE, WATERMARK_STATE_KEY } from './config.js';
import type { ExistingMarketRow, ServerEnv, SyncInsforgeClient, SyncMarketRow } from './types.js';

// 建客户端
export function createSyncInsforgeClient(env: ServerEnv): SyncInsforgeClient {
  return createSharedInsforgeClient<SyncInsforgeClient>(env);
}

// 嵌入文本
export function buildEmbedText(question: string, tags: string | null): string {
  const normalizedQuestion = question.slice(0, 500).trim();
  const normalizedTags = String(tags || '').slice(0, 300).trim();
  if (!normalizedTags) return normalizedQuestion;
  return `${normalizedQuestion}\n标签: ${normalizedTags}`;
}

// 比较字段
function stringifyComparable(input: unknown): string {
  if (input === null || input === undefined) return '';
  if (typeof input === 'number') return Number.isFinite(input) ? String(input) : '';
  if (typeof input === 'boolean') return input ? 'true' : 'false';
  if (typeof input === 'string') return input;
  return JSON.stringify(input);
}

// 映射现有行
function mapExistingMarket(raw: unknown): ExistingMarketRow {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid existing market row');
  const row = raw as ExistingMarketRow;
  if (!Number.isFinite(row.id)) throw new Error('Invalid existing market id');
  return row;
}

// 市场是否变化
export function marketRowsDifferent(existing: ExistingMarketRow | undefined, incoming: SyncMarketRow): boolean {
  const keys: Array<keyof SyncMarketRow> = [
    'question',
    'url',
    'slug',
    'conditionid',
    'enddate',
    'volumenum',
    'liquiditynum',
    'tags',
    'tag_slugs',
    'categories',
    'acceptingorders',
    'enableorderbook',
    'updatedat',
  ];

  for (const key of keys) {
    if (stringifyComparable(existing?.[key]) !== stringifyComparable(incoming[key])) return true;
  }
  return false;
}

// 读现有市场
export async function fetchExistingMarkets(client: SyncInsforgeClient, ids: number[]): Promise<Map<number, ExistingMarketRow>> {
  const map = new Map<number, ExistingMarketRow>();
  if (ids.length === 0) return map;

  for (const chunk of chunkArray(ids, EXISTING_FETCH_CHUNK)) {
    const { data, error } = await client.database
      .from('polymarket_markets_active')
      .select('id,question,url,slug,conditionid,enddate,volumenum,liquiditynum,tags,tag_slugs,categories,acceptingorders,enableorderbook,updatedat,embed_text')
      .in('id', chunk);

    if (error) throw new Error(`Failed to fetch existing markets: ${error.message}`);
    if (!Array.isArray(data)) throw new Error('Existing markets returned invalid rows');

    for (const row of data) {
      const mapped = mapExistingMarket(row);
      map.set(mapped.id, mapped);
    }
  }

  return map;
}

// 写市场和任务
export async function upsertMarketsAndJobs(
  client: SyncInsforgeClient,
  markets: SyncMarketRow[],
  nowIso: string,
): Promise<{ upserted: number; jobsCreated: number }> {
  if (markets.length === 0) return { upserted: 0, jobsCreated: 0 };

  let totalUpserted = 0;
  let totalJobsCreated = 0;

  for (const chunk of chunkArray(markets, UPSERT_CHUNK_SIZE)) {
    const payload = chunk.map((market) => ({
      ...market,
      embed_text: buildEmbedText(market.question, market.tags),
      synced_at: nowIso,
    }));

    const { error: upsertError } = await client.database
      .from('polymarket_markets_active')
      .upsert(payload, { onConflict: 'id' });
    if (upsertError) throw new Error(`Failed to upsert markets: ${upsertError.message}`);
    totalUpserted += payload.length;

    const jobsPayload = payload.map((market) => ({
      market_id: market.id,
      embed_text: market.embed_text,
      source_updated_at: market.updatedat,
      status: 'pending',
      attempts: 0,
      updated_at: nowIso,
    }));

    const { error: jobsError } = await client.database
      .from('polymarket_embedding_jobs')
      .upsert(jobsPayload, { onConflict: 'market_id' });
    if (jobsError) throw new Error(`Failed to enqueue embedding jobs: ${jobsError.message}`);
    totalJobsCreated += jobsPayload.length;
  }

  return { upserted: totalUpserted, jobsCreated: totalJobsCreated };
}

// 清理停盘
export async function cleanupStoppedMarkets(client: SyncInsforgeClient): Promise<boolean> {
  const { error } = await client.database.rpc('cleanup_stopped_markets', {});
  if (error) throw new Error(`cleanup_stopped_markets failed: ${error.message}`);
  return true;
}

// 读水位
export async function getWatermark(client: SyncInsforgeClient): Promise<string | null> {
  const { data, error } = await client.database
    .from('polymarket_sync_runtime')
    .select('value_json')
    .eq('key', WATERMARK_STATE_KEY)
    .limit(1);
  if (error) throw new Error(`Failed to read watermark: ${error.message}`);
  if (!Array.isArray(data) || data.length === 0) return null;

  const value = (data[0] as { value_json?: { watermarkUpdatedAt?: unknown } }).value_json;
  if (typeof value?.watermarkUpdatedAt !== 'string') return null;
  const parsed = Date.parse(value.watermarkUpdatedAt);
  if (Number.isNaN(parsed)) throw new Error('Invalid watermark timestamp');
  return new Date(parsed).toISOString();
}

// 写水位
export async function setWatermark(
  client: SyncInsforgeClient,
  watermark: string,
  stats: Record<string, unknown>,
  nowIso: string,
): Promise<void> {
  const { error } = await client.database
    .from('polymarket_sync_runtime')
    .upsert([{
      key: WATERMARK_STATE_KEY,
      value_json: {
        watermarkUpdatedAt: watermark,
        lastRunAt: nowIso,
        lastStats: stats,
      },
      updated_at: nowIso,
    }], { onConflict: 'key' });
  if (error) throw new Error(`Failed to persist watermark: ${error.message}`);
}
