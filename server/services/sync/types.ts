import type { ServerEnv } from '../shared/insforge';

export type { ServerEnv };
export type FetchImpl = typeof fetch;

export interface SyncRequest {
  action?: unknown;
  pageLimit?: unknown;
  maxPages?: unknown;
  startOffset?: unknown;
  overlapSeconds?: unknown;
  noChangeStopPages?: unknown;
  forceFull?: unknown;
  dryRun?: unknown;
  cleanup?: unknown;
}

export interface SyncMarketRow {
  id: number;
  question: string;
  url: string | null;
  slug: string | null;
  conditionid: string | null;
  enddate: string | null;
  volumenum: number | null;
  liquiditynum: number | null;
  tags: string | null;
  tag_slugs: string | null;
  categories: string | null;
  acceptingorders: boolean;
  enableorderbook: boolean;
  updatedat: string | null;
}

export interface ExistingMarketRow extends SyncMarketRow {
  embed_text: string | null;
}

export type DbResult<T = unknown> = Promise<{
  data?: T;
  error?: { message?: string } | null;
}>;

type QueryBuilder = {
  select: (columns: string) => QueryBuilder;
  eq: (column: string, value: unknown) => QueryBuilder;
  in: (column: string, values: unknown[]) => DbResult<unknown[]>;
  limit: (count: number) => DbResult<unknown[]>;
  upsert: (rows: unknown[], options?: Record<string, unknown>) => DbResult;
};

export interface SyncInsforgeClient {
  database: {
    from: (table: string) => QueryBuilder;
    rpc: (fn: string, args?: Record<string, unknown>) => DbResult;
  };
}

export interface CreateSyncServiceOptions {
  env?: ServerEnv;
  fetchImpl?: FetchImpl;
  now?: () => number;
  sleepImpl?: (ms: number) => Promise<void>;
  insforgeClient?: SyncInsforgeClient;
}
