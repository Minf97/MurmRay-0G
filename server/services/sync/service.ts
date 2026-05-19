import { clampInt, sleep } from '../shared/config.js';
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
} from './config.js';
import {
  cleanupStoppedMarkets,
  createSyncInsforgeClient,
  getWatermark,
  setWatermark,
} from './db.js';
import { fetch1024ActiveMarkets, fetch1024MarketsPage, map1024Market } from './ex1024.js';
import { fetchGammaEventsPage, fetchGammaMarketsPage, mapGammaMarket } from './gamma.js';
import { persistMarketChanges } from './rows.js';
import { readRuntimeFetch } from '../../runtime/fetch.js';
import type { CreateSyncServiceOptions, SyncInsforgeClient, SyncMarketRow, SyncRequest } from './types.js';

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
  const fetchImpl = options.fetchImpl ?? readRuntimeFetch();
  const now = options.now ?? (() => Date.now());
  const sleepImpl = options.sleepImpl ?? sleep;

  // 取客户端
  function getClient(): SyncInsforgeClient {
    return options.insforgeClient ?? createSyncInsforgeClient(env);
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

      const result = await persistMarketChanges(client, scoped, dryRun, new Date(now()).toISOString());
      totals.newMarkets += result.newMarkets;
      totals.changedMarkets += result.changedMarkets;
      totals.unchangedMarkets += result.unchangedMarkets;
      totals.marketsUpserted += result.marketsUpserted;
      totals.jobsQueued += result.jobsQueued;
      noImpactPages = result.newMarkets + result.changedMarkets === 0 ? noImpactPages + 1 : 0;
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
    const result = await persistMarketChanges(client, allMarkets, dryRun, new Date(now()).toISOString());
    const totals = {
      eventsFetched: totalEvents,
      marketsRawFetched: totalMarketsRaw,
      uniqueMarkets: allMarkets.length,
      newMarkets: result.newMarkets,
      changedMarkets: result.changedMarkets,
      unchangedMarkets: result.unchangedMarkets,
      marketsUpserted: result.marketsUpserted,
      jobsQueued: result.jobsQueued,
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

  // 同步 1024ex
  async function sync1024Markets(client: SyncInsforgeClient, body: SyncRequest, activeOnly = true) {
    const startedAt = now();
    const pageLimit = clampInt(body.pageLimit, activeOnly ? 500 : DEFAULT_INCREMENTAL_PAGE_LIMIT, 10, MAX_MARKET_PAGE_LIMIT);
    const maxPages = clampInt(body.maxPages, activeOnly ? 1 : DEFAULT_FULL_MAX_PAGES, 1, MAX_FULL_MAX_PAGES);
    const dryRun = Boolean(body.dryRun);
    const rows: SyncMarketRow[] = [];
    let pagesProcessed = 0;
    let fetchedFrom1024ex = 0;
    let finished = false;

    while (pagesProcessed < maxPages && !finished) {
      let hasNext = false;
      const raw = activeOnly
        ? await fetch1024ActiveMarkets(fetchImpl)
        : await (async () => {
          const page = await fetch1024MarketsPage(fetchImpl, pagesProcessed + 1, pageLimit);
          hasNext = page.hasNext;
          return page.items;
        })();
      pagesProcessed += 1;
      fetchedFrom1024ex += raw.length;
      rows.push(...raw.map(map1024Market).filter((row): row is SyncMarketRow => Boolean(row)));

      finished = activeOnly || !hasNext;
      if (!dryRun && !finished) await sleepImpl(100);
    }

    const result = await persistMarketChanges(client, rows, dryRun, new Date(now()).toISOString());
    const cleanupSuccess = !dryRun && body.cleanup !== false ? await cleanupStoppedMarkets(client) : null;
    return {
      action: activeOnly ? 'sync_1024ex_active' : 'sync_1024ex_markets',
      dryRun,
      finished,
      pageLimit,
      maxPages,
      pagesProcessed,
      cleanupSuccess,
      totals: {
        fetchedFrom1024ex,
        mappedValidMarkets: rows.length,
        ...result,
      },
      timingMs: { totalMs: now() - startedAt },
    };
  }

  // 每日同步
  async function runDailySync(client: SyncInsforgeClient, body: SyncRequest) {
    const dryRun = Boolean(body.dryRun);
    const polymarket = await syncIncremental(client, { ...body, cleanup: false });
    const ex1024 = await sync1024Markets(client, { ...body, cleanup: false }, true);
    const cleanupSuccess = !dryRun && body.cleanup !== false ? await cleanupStoppedMarkets(client) : null;
    return { action: 'run_daily_sync', polymarket, ex1024, cleanupSuccess };
  }

  // 执行动作
  async function run(body: SyncRequest = {}) {
    const action = typeof body.action === 'string' && body.action.trim() ? body.action.trim() : 'sync_incremental';
    const client = getClient();
    if (action === 'sync_incremental') return syncIncremental(client, body);
    if (action === 'run_daily_sync') return runDailySync(client, body);
    if (action === 'sync_full') return syncFull(client, body);
    if (action === 'sync_1024ex' || action === 'sync_1024ex_active') return sync1024Markets(client, body, true);
    if (action === 'sync_1024ex_markets') return sync1024Markets(client, body, false);
    if (action === 'cleanup_stopped' || action === 'cleanup_stopped_markets') {
      return { action: 'cleanup_stopped', success: await cleanupStoppedMarkets(client) };
    }
    throw new Error('Unsupported action. Use sync_incremental, sync_full, run_daily_sync, sync_1024ex_active, sync_1024ex_markets, or cleanup_stopped');
  }

  return { run };
}
