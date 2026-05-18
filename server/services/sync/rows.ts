import { fetchExistingMarkets, marketRowsDifferent, upsertMarketsAndJobs } from './db.js';
import type { SyncInsforgeClient, SyncMarketRow } from './types.js';

export interface MarketChangeTotals {
  newMarkets: number;
  changedMarkets: number;
  unchangedMarkets: number;
  marketsUpserted: number;
  jobsQueued: number;
}

// 初始计数
export function createMarketChangeTotals(): MarketChangeTotals {
  return {
    newMarkets: 0,
    changedMarkets: 0,
    unchangedMarkets: 0,
    marketsUpserted: 0,
    jobsQueued: 0,
  };
}

// 写入差异
export async function persistMarketChanges(
  client: SyncInsforgeClient,
  rows: SyncMarketRow[],
  dryRun: boolean,
  nowIso: string,
): Promise<MarketChangeTotals> {
  const totals = createMarketChangeTotals();
  if (rows.length === 0) return totals;

  const existingMap = await fetchExistingMarkets(client, rows.map((row) => row.id));
  const changedRows: SyncMarketRow[] = [];

  for (const row of rows) {
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

  if (!dryRun && changedRows.length > 0) {
    const result = await upsertMarketsAndJobs(client, changedRows, nowIso);
    totals.marketsUpserted += result.upserted;
    totals.jobsQueued += result.jobsCreated;
  }

  return totals;
}
