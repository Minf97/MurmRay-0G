export type FetchImpl = typeof fetch;
export type { ServerEnv } from '../shared/insforge';

export interface PageContext {
  title: string;
  url: string;
  pageText: string;
  selectedText: string;
}

export interface SummaryData {
  summary: string;
  reliability: string;
  reliabilityReason: string;
  entities: string[];
}

export interface Market {
  id: number;
  question: string;
  url: string | null;
  slug: string | null;
  endDate: string | null;
  volumeNum: number | null;
  liquidityNum: number | null;
  tags: string | null;
  tagSlugs: string | null;
  categories: string | null;
  acceptingOrders: boolean;
  enableOrderBook: boolean;
  updatedAt: string | null;
  distance?: number;
  vectorScore?: number;
}

export type VectorCandidate = Market & { distance: number };

export interface MatchResult {
  marketId: number;
  question: string;
  confidence: number;
  direction: string;
  reason: string;
  marketUrl: string | null;
  marketEndDate: string | null;
}

export interface AnalysisRequest {
  action?: unknown;
  pageContext?: {
    title?: unknown;
    url?: unknown;
    pageText?: unknown;
    selectedText?: unknown;
  };
  topK?: unknown;
  prefetchCount?: unknown;
}

export interface CreateAnalysisServiceOptions {
  fetchImpl?: FetchImpl;
  env?: ServerEnv;
  now?: () => number;
  embedBatchSize?: unknown;
  insforgeClient?: InsforgeClient;
}

export type RpcResult = Promise<{
  data?: unknown;
  error?: { message?: string } | null;
  count?: number | null;
}>;

export interface InsforgeClient {
  database: {
    rpc: (fn: string, args?: Record<string, unknown>) => RpcResult;
    from: (table: string) => {
      select: (columns: string, options: { count: 'exact'; head: true }) => {
        eq: (column: string, value: unknown) => {
          gt: (column: string, value: unknown) => RpcResult;
        };
      };
    };
  };
}
