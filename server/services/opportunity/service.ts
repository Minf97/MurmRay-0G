import {
  DEFAULT_EMBED_BATCH_SIZE,
  DEFAULT_PREFETCH_COUNT,
  DEFAULT_TOP_K,
  chunkArray,
  clampInt,
  clipText,
} from './config.js';
import { countOpenMarkets, createInsforgeClient, fetchVectorCandidates } from './insforge.js';
import { buildPolymarketUrl } from './market.js';
import { requestEmbeddings, requestMarketMatches, resolveOpenRouterConfig, summarizePage } from './openrouter.js';
import { buildQueryTexts, cosineSimilarity, pickTopMarkets } from './vector.js';
import { publishZeroGProofs } from './zero-g-proof.js';
import { readRuntimeFetch } from '../../runtime/fetch.js';
import type { AnalysisRequest, CreateAnalysisServiceOptions, Market, MatchResult, PageContext } from './types.js';

export { mergeCandidateLists } from './insforge.js';
export { parseJsonLoose } from './json.js';
export { buildQueryTexts, cosineSimilarity, pickTopMarkets } from './vector.js';

// 规整方向
function normalizeDirection(value: unknown): string {
  const normalized = clipText(value, 40);
  if (!normalized) return '不确定';
  if (normalized.includes('利好')) return '利好';
  if (normalized.includes('利空')) return '利空';
  return '不确定';
}

// 读取页面
function readPageContext(body: AnalysisRequest): PageContext {
  const page = {
    title: clipText(body?.pageContext?.title, 300) || 'Untitled',
    url: clipText(body?.pageContext?.url, 1200),
    pageText: clipText(body?.pageContext?.pageText, 12000),
    selectedText: clipText(body?.pageContext?.selectedText, 2500),
  };

  if (!page.url || !/^https?:/i.test(page.url)) {
    throw new Error('Invalid page URL.');
  }

  if (!page.pageText && !page.selectedText) {
    throw new Error('Page text is empty.');
  }

  return page;
}

// 去重匹配
function dedupeMatches(matches: MatchResult[]): MatchResult[] {
  const deduped = new Map<number, MatchResult>();

  for (const item of matches) {
    const existing = deduped.get(item.marketId);
    if (!existing || item.confidence > existing.confidence) {
      deduped.set(item.marketId, item);
    }
  }

  return Array.from(deduped.values()).sort((left, right) => right.confidence - left.confidence);
}

// 转换匹配
function mapAiMatches(rawMatches: Record<string, unknown>[], markets: Market[]): MatchResult[] {
  return rawMatches
    .map((item) => {
      const marketId = Number(item.market_id);
      if (!Number.isFinite(marketId)) return null;

      const market = markets.find((candidate) => Number(candidate.id) === marketId);
      if (!market) return null;

      const confidenceRaw = Number(item.confidence);
      const confidence = Number.isFinite(confidenceRaw)
        ? Math.max(0, Math.min(100, confidenceRaw))
        : 0;

      return {
        marketId,
        question: String(market.question || ''),
        confidence,
        direction: normalizeDirection(item.direction),
        reason: clipText(item.reason, 120) || '模型未给出具体理由。',
        marketUrl: buildPolymarketUrl(market.url, market.slug),
        marketEndDate: market.endDate,
      };
    })
    .filter((item): item is MatchResult => Boolean(item));
}

// 创建服务
export function createAnalysisService(options: CreateAnalysisServiceOptions = {}) {
  const fetchImpl = options.fetchImpl ?? readRuntimeFetch();
  const env = options.env ?? process.env;
  const now = options.now ?? (() => Date.now());
  const embedBatchSize = clampInt(options.embedBatchSize, DEFAULT_EMBED_BATCH_SIZE, 1, 200);

  // 取客户端
  function getInsforgeClient() {
    return options.insforgeClient ?? createInsforgeClient(env);
  }

  // 取向量组
  async function embedTexts(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const config = resolveOpenRouterConfig(env);
    const vectors: number[][] = [];

    for (const batch of chunkArray(texts, embedBatchSize)) {
      const batchVectors = await requestEmbeddings({
        fetchImpl,
        apiBaseUrl: config.apiBaseUrl,
        apiKey: config.apiKey,
        model: config.embedModel,
        httpReferer: config.httpReferer,
        appTitle: config.appTitle,
        expectedDimensions: config.embedDimensions,
        texts: batch,
      });

      vectors.push(...batchVectors);
    }

    return vectors;
  }

  // 判定匹配
  async function findMatchesForChunk(summary: Awaited<ReturnType<typeof summarizePage>>, markets: Market[]): Promise<MatchResult[]> {
    if (markets.length === 0) return [];

    const marketDigest = markets.map((item) => ({
      id: item.id,
      question: item.question,
      endDate: item.endDate,
      tags: item.tags,
      liquidityNum: item.liquidityNum,
      volumeNum: item.volumeNum,
    }));

    const rawMatches = await requestMarketMatches(summary, marketDigest, { fetchImpl, env });
    return mapAiMatches(rawMatches, markets);
  }

  // 执行分析
  async function analyze(body: AnalysisRequest = {}) {
    const action = clipText(body?.action, 40) || 'analyze_page';
    if (action !== 'analyze_page') {
      throw new Error('Unsupported action. Use action=analyze_page');
    }

    const page = readPageContext(body);
    const startedAt = now();
    const summaryData = await summarizePage(page, { fetchImpl, env });
    const summarizeMs = now() - startedAt;

    const queryTexts = buildQueryTexts(page, summaryData);
    const queryEmbeddings = await embedTexts(queryTexts);
    const queryEmbeddingMs = now() - startedAt - summarizeMs;

    const topK = clampInt(body?.topK, DEFAULT_TOP_K, 1, 300);
    const prefetchCount = clampInt(body?.prefetchCount, DEFAULT_PREFETCH_COUNT, 500, 1000);
    const insforgeClient = getInsforgeClient();
    const totalMarkets = await countOpenMarkets(insforgeClient, new Date(startedAt).toISOString());
    const candidates = await fetchVectorCandidates(insforgeClient, queryEmbeddings, topK, prefetchCount);
    const vectorRecallMs = now() - startedAt - summarizeMs - queryEmbeddingMs;

    const judgeStartedAt = now();
    const matches = dedupeMatches(await findMatchesForChunk(summaryData, candidates));
    const judgeMatchesMs = now() - judgeStartedAt;
    const proofStartedAt = now();
    const zeroGProofState = await publishZeroGProofs(page, summaryData, matches, { env, fetchImpl, now });
    const zeroGProofMs = now() - proofStartedAt;

    return {
      action: 'analyze_page',
      summaryData,
      totalMarkets,
      topK,
      prefetchCount,
      candidateCount: candidates.length,
      topVectorCandidates: candidates.slice(0, 10).map((item, index) => ({
        rank: index + 1,
        marketId: item.id,
        question: item.question,
        distance: item.distance,
      })),
      matches,
      zeroGProofStatus: zeroGProofState.status,
      zeroGProofs: zeroGProofState.proofs,
      zeroGProofError: zeroGProofState.error,
      zeroGProofPageUrl: zeroGProofState.proofPageUrl,
      timingMs: {
        summarizeMs,
        queryEmbeddingMs,
        vectorRecallMs,
        judgeMatchesMs,
        zeroGProofMs,
        totalMs: now() - startedAt,
      },
    };
  }

  return {
    analyze,
  };
}
