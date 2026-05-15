import { clampInt, sleep } from '../shared/config';
import {
  DEFAULT_FULL_MAX_PAGES,
  DEFAULT_FULL_PAGE_LIMIT,
  DEFAULT_INCREMENTAL_MAX_PAGES,
  DEFAULT_INCREMENTAL_PAGE_LIMIT,
  DEFAULT_NO_CHANGE_STOP_PAGES,
  DEFAULT_OVERLAP_SECONDS,
  MAX_FULL_MAX_PAGES,
  MAX_FULL_PAGE_LIMIT,
  MAX_INCREMENTAL_MAX_PAGES,
  MAX_MARKET_PAGE_LIMIT,
  MAX_NO_CHANGE_STOP_PAGES,
  MAX_OVERLAP_SECONDS,
} from './config';
import {
  cleanupStoppedMarkets,
  createSyncInsforgeClient,
  fetchExistingMarkets,
  getWatermark,
  marketRowsDifferent,
  setWatermark,
  upsertMarketsAndJobs,
} from './db';
import { fetchGammaEventsPage, fetchGammaMarketsPage, mapGammaMarket } from './gamma';
import type { CreateSyncServiceOptions, SyncInsforgeClient, SyncMarketRow, SyncRequest } from './types';

// 时间戳毫秒
function timestampMs(input: string | null): number {
  if (!input) return 0;
  const parsed = Date.parse(input);
  return Number.isNaN(parsed) ? 0 : parsed;
}

// 最大时间
function maxTimestamp(left: string | null, right: string | null): string | null {
  if (!left) return right;
  if (!right) return left;
  return Date.parse(left) >= Date.parse(right) ? left : right;
}

// 回退时间
function subtractSeconds(iso: string, seconds: number): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) throw new Error('Invalid cutoff timestamp');
  return new Date(parsed - seconds * 1000).toISOString();
}

// 创建服务
export function createSyncService(options: CreateSyncServiceOptions = {}) {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => Date.now());
  const sleepImpl = options.sleepImpl ?? sleep;

  // 取客户端
  function getClient(): SyncInsforgeClient {
    return options.insforgeClient ?? createSyncInsforgeClient(env);
  }

  // 写入变化
  async function persistChangedRows(
    client: SyncInsforgeClient,
    rows: SyncMarketRow[],
    dryRun: boolean,
  ): Promise<{ upserted: number; jobsCreated: number }> {
    if (dryRun || rows.length === 0) return { upserted: 0, jobsCreated: 0 };
    return upsertMarketsAndJobs(client, rows, new Date(now()).toISOString());
  }

  // 增量同步
  async function syncIncremental(client: SyncInsforgeClient, body: SyncRequest) {
    const startedAt = now();
    const pageLimit = clampInt(body.pageLimit, DEFAULT_INCREMENTAL_PAGE_LIMIT, 50, MAX_MARKET_PAGE_LIMIT);
    const maxPages = clampInt(body.maxPages, DEFAULT_INCREMENTAL_MAX_PAGES, 1, MAX_INCREMENTAL_MAX_PAGES);
    const overlapSeconds = clampInt(body.overlapSeconds, DEFAULT_OVERLAP_SECONDS, 0, MAX_OVERLAP_SECONDS);
    const noChangeStopPages = clampInt(body.noChangeStopPages, DEFAULT_NO_CHANGE_STOP_PAGES, 1, MAX_NO_CHANGE_STOP_PAGES);
    const forceFull = Boolean(body.forceFull);
    const dryRun = Boolean(body.dryRun);
    const previousWatermark = forceFull ? null : await getWatermark(client);
    const effectiveCutoff = previousWatermark ? subtractSeconds(previousWatermark, overlapSeconds) : null;

    let offset = 0;
    let pagesProcessed = 0;
    let finished = false;
    let stoppedByWatermark = false;
    let stoppedByNoImpact = false;
    let noImpactPages = 0;
    let observedNewestUpdatedAt: string | null = null;
    const totals = {
      fetchedFromPolymarket: 0,
      mappedValidMarkets: 0,
      newMarkets: 0,
      changedMarkets: 0,
      unchangedMarkets: 0,
      marketsUpserted: 0,
      jobsQueued: 0,
    };

    while (pagesProcessed < maxPages) {
      const markets = await fetchGammaMarketsPage(fetchImpl, offset, pageLimit);
      pagesProcessed += 1;
      totals.fetchedFromPolymarket += markets.length;
      const mapped = markets.map((market) => mapGammaMarket(market)).filter((row): row is SyncMarketRow => Boolean(row));
      totals.mappedValidMarkets += mapped.length;
      for (const row of mapped) observedNewestUpdatedAt = maxTimestamp(observedNewestUpdatedAt, row.updatedat);

      const scoped = effectiveCutoff
        ? mapped.filter((row) => !row.updatedat || timestampMs(row.updatedat) > timestampMs(effectiveCutoff))
        : mapped;
      if (effectiveCutoff && scoped.length === 0) {
        stoppedByWatermark = true;
        finished = true;
        break;
      }

      const existingMap = await fetchExistingMarkets(client, scoped.map((row) => row.id));
      const changedRows: SyncMarketRow[] = [];
      for (const row of scoped) {
        const existing = existingMap.get(row.id);
        if (!existing) {
          totals.newMarkets += 1;
          changedRows.push(row);
        } else if (marketRowsDifferent(existing, row)) {
          totals.changedMarkets += 1;
          changedRows.push(row);
        } else {
          totals.unchangedMarkets += 1;
        }
      }

      const result = await persistChangedRows(client, changedRows, dryRun);
      totals.marketsUpserted += result.upserted;
      totals.jobsQueued += result.jobsCreated;
      noImpactPages = changedRows.length === 0 ? noImpactPages + 1 : 0;
      if (noImpactPages >= noChangeStopPages) {
        stoppedByNoImpact = true;
        finished = true;
        break;
      }

      offset += markets.length;
      if (markets.length < pageLimit) {
        finished = true;
        break;
      }
      if (!dryRun) await sleepImpl(100);
    }

    if (!dryRun && finished && observedNewestUpdatedAt) {
      await setWatermark(client, observedNewestUpdatedAt, totals, new Date(now()).toISOString());
    }

    const cleanupSuccess = !dryRun && body.cleanup !== false ? await cleanupStoppedMarkets(client) : null;
    return {
      action: 'sync_incremental',
      dryRun,
      forceFull,
      finished,
      stoppedByWatermark,
      stoppedByNoImpact,
      pageLimit,
      maxPages,
      noChangeStopPages,
      pagesProcessed,
      nextOffset: offset,
      previousWatermark,
      effectiveCutoff,
      newWatermarkCandidate: observedNewestUpdatedAt,
      cleanupSuccess,
      totals,
      timingMs: { totalMs: now() - startedAt },
    };
  }

  // 全量同步
  async function syncFull(client: SyncInsforgeClient, body: SyncRequest) {
    const startedAt = now();
    const pageLimit = clampInt(body.pageLimit, DEFAULT_FULL_PAGE_LIMIT, 10, MAX_FULL_PAGE_LIMIT);
    const maxPages = clampInt(body.maxPages, DEFAULT_FULL_MAX_PAGES, 1, MAX_FULL_MAX_PAGES);
    const startOffset = clampInt(body.startOffset, 0, 0, Number.MAX_SAFE_INTEGER);
    const dryRun = Boolean(body.dryRun);
    const marketMap = new Map<number, SyncMarketRow>();
    let eventOffset = startOffset;
    let pagesProcessed = 0;
    let finished = false;
    let totalEvents = 0;
    let totalMarketsRaw = 0;
    let observedNewestUpdatedAt: string | null = null;

    while (pagesProcessed < maxPages && !finished) {
      const events = await fetchGammaEventsPage(fetchImpl, eventOffset, pageLimit);
      pagesProcessed += 1;
      totalEvents += events.length;
      for (const event of events) {
        const markets = event && typeof event === 'object' && Array.isArray((event as { markets?: unknown }).markets)
          ? (event as { markets: unknown[] }).markets
          : [];
        totalMarketsRaw += markets.length;
        for (const market of markets) {
          const mapped = mapGammaMarket(market, event);
          if (!mapped) continue;
          const existing = marketMap.get(mapped.id);
          if (!existing || timestampMs(mapped.updatedat) > timestampMs(existing.updatedat)) marketMap.set(mapped.id, mapped);
          observedNewestUpdatedAt = maxTimestamp(observedNewestUpdatedAt, mapped.updatedat);
        }
      }
      eventOffset += events.length;
      if (events.length < pageLimit) finished = true;
      if (!dryRun && !finished) await sleepImpl(100);
    }

    const allMarkets = Array.from(marketMap.values());
    const existingMap = await fetchExistingMarkets(client, allMarkets.map((row) => row.id));
    const changedRows = allMarkets.filter((row) => !existingMap.get(row.id) || marketRowsDifferent(existingMap.get(row.id), row));
    const result = await persistChangedRows(client, changedRows, dryRun);
    const totals = {
      eventsFetched: totalEvents,
      marketsRawFetched: totalMarketsRaw,
      uniqueMarkets: allMarkets.length,
      existingMatched: existingMap.size,
      newMarkets: changedRows.filter((row) => !existingMap.get(row.id)).length,
      changedMarkets: changedRows.filter((row) => existingMap.get(row.id)).length,
      unchangedMarkets: allMarkets.length - changedRows.length,
      marketsUpserted: result.upserted,
      jobsQueued: result.jobsCreated,
    };

    if (!dryRun && finished && observedNewestUpdatedAt) {
      await setWatermark(client, observedNewestUpdatedAt, totals, new Date(now()).toISOString());
    }
    const cleanupSuccess = !dryRun && body.cleanup !== false && finished ? await cleanupStoppedMarkets(client) : null;
    return {
      action: 'sync_full',
      dryRun,
      finished,
      pageLimit,
      maxPages,
      startOffset,
      pagesProcessed,
      nextOffset: eventOffset,
      cleanupSuccess,
      newWatermarkCandidate: observedNewestUpdatedAt,
      totals,
      timingMs: { totalMs: now() - startedAt },
    };
  }

  // 执行动作
  async function run(body: SyncRequest = {}) {
    const action = typeof body.action === 'string' && body.action.trim() ? body.action.trim() : 'sync_incremental';
    const client = getClient();
    if (action === 'sync_incremental' || action === 'run_daily_sync') return syncIncremental(client, body);
    if (action === 'sync_full') return syncFull(client, body);
    if (action === 'cleanup_stopped' || action === 'cleanup_stopped_markets') {
      return { action: 'cleanup_stopped', success: await cleanupStoppedMarkets(client) };
    }
    throw new Error('Unsupported action. Use action=sync_incremental, action=sync_full, action=run_daily_sync, or action=cleanup_stopped');
  }

  return { run };
}
