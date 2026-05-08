const GAMMA_API_BASE = 'https://gamma-api.polymarket.com';
const OPENROUTER_API_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_OPENROUTER_MODEL = 'x-ai/grok-4.20';
const DEFAULT_OPENROUTER_EMBED_MODEL = 'google/gemini-embedding-2-preview';
const DEFAULT_OPENROUTER_HTTP_REFERER = 'http://127.0.0.1:8789';
const DEFAULT_OPENROUTER_APP_TITLE = 'MurmRay Local';
const DEFAULT_TOP_K = 100;
const DEFAULT_PREFETCH_COUNT = 240;
const DEFAULT_MARKET_CACHE_TTL_MS = 2 * 60 * 1000;
const DEFAULT_EMBED_CACHE_TTL_MS = 30 * 60 * 1000;
const DEFAULT_EMBED_BATCH_SIZE = 80;

// 截断文本
function clipText(input, maxChars) {
  if (typeof input !== 'string') return '';
  const normalized = input.replace(/\r/g, '').trim();
  if (!normalized) return '';
  return normalized.length <= maxChars ? normalized : normalized.slice(0, maxChars);
}

// 整理整数
function clampInt(input, fallback, min, max) {
  const numeric = Number(input);
  if (!Number.isFinite(numeric)) return fallback;
  const rounded = Math.round(numeric);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
}

// 切分数组
function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

// 规整方向
function normalizeDirection(value) {
  const normalized = clipText(value, 40);
  if (!normalized) return '不确定';
  if (normalized.includes('利好')) return '利好';
  if (normalized.includes('利空')) return '利空';
  return '不确定';
}

// 构建链接
function buildPolymarketUrl(url, slug) {
  const normalizedUrl = clipText(url, 1200);
  if (normalizedUrl) {
    if (/^https?:\/\//i.test(normalizedUrl)) return normalizedUrl;
    if (normalizedUrl.startsWith('//')) return `https:${normalizedUrl}`;
    if (/^polymarket\.com\//i.test(normalizedUrl)) return `https://${normalizedUrl}`;
    return `https://polymarket.com/${normalizedUrl.replace(/^\/+/, '')}`;
  }

  const normalizedSlug = clipText(slug, 500);
  if (!normalizedSlug) return null;
  return `https://polymarket.com/market/${normalizedSlug.replace(/^\/+/, '')}`;
}

// 解析数值
function normalizeNumber(input) {
  const numeric = Number(input);
  if (!Number.isFinite(numeric)) return null;
  return numeric;
}

// 解析文本
function normalizeText(input) {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  return trimmed ? trimmed : null;
}

// 解析时间
function normalizeTimestamp(input) {
  if (typeof input !== 'string') return null;
  const parsed = Date.parse(input);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}

// 解析布尔
function normalizeBoolean(input, fallback = false) {
  if (typeof input === 'boolean') return input;
  return fallback;
}

// 构建标签
function buildTags(rawTags) {
  if (!Array.isArray(rawTags)) return { tags: null, tagSlugs: null };

  const labels = [];
  const slugs = [];

  for (const item of rawTags) {
    if (!item || typeof item !== 'object') continue;
    const label = normalizeText(item.label);
    const slug = normalizeText(item.slug);
    if (label) labels.push(label);
    if (slug) slugs.push(slug);
  }

  return {
    tags: labels.length > 0 ? Array.from(new Set(labels)).sort().join('|') : null,
    tagSlugs: slugs.length > 0 ? Array.from(new Set(slugs)).sort().join('|') : null,
  };
}

// 构建分类
function buildCategories(market) {
  const directCategory = normalizeText(market?.category);
  const categoriesFromEvents = [];

  if (Array.isArray(market?.events)) {
    for (const event of market.events) {
      if (!event || typeof event !== 'object') continue;
      const values = [
        normalizeText(event.category),
        normalizeText(event.slug),
        normalizeText(event.title),
      ].filter(Boolean);
      categoriesFromEvents.push(...values);
    }
  }

  const unique = Array.from(new Set([directCategory, ...categoriesFromEvents].filter(Boolean))).sort();
  return unique.length > 0 ? unique.join('|') : null;
}

// 映射市场
export function mapGammaMarket(raw) {
  const id = Number(raw?.id);
  if (!Number.isFinite(id)) return null;

  const question = normalizeText(raw?.question);
  if (!question) return null;

  const slug = normalizeText(raw?.slug);
  const url = buildPolymarketUrl(normalizeText(raw?.url), slug);
  const endDate = normalizeTimestamp(raw?.endDate) ?? normalizeTimestamp(raw?.endDateIso);
  const volumeNum = normalizeNumber(raw?.volumeNum) ?? normalizeNumber(raw?.volume) ?? normalizeNumber(raw?.volumeClob);
  const liquidityNum = normalizeNumber(raw?.liquidityNum) ?? normalizeNumber(raw?.liquidity);
  const { tags, tagSlugs } = buildTags(raw?.tags);

  return {
    id,
    question,
    url,
    slug,
    endDate,
    volumeNum,
    liquidityNum,
    tags,
    tagSlugs,
    categories: buildCategories(raw),
    acceptingOrders: normalizeBoolean(raw?.acceptingOrders, false),
    enableOrderBook: normalizeBoolean(raw?.enableOrderBook, false),
    updatedAt: normalizeTimestamp(raw?.updatedAt),
  };
}

// 解析松散 JSON
export function parseJsonLoose(rawText) {
  const trimmed = String(rawText || '').trim();
  if (!trimmed) return {};

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    // 忽略首轮
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    try {
      const parsed = JSON.parse(fencedMatch[1].trim());
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      // 忽略代码块
    }
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      const parsed = JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      // 忽略裁剪
    }
  }

  return {};
}

// 提取回复
function extractAssistantText(responseJson) {
  const content = responseJson?.choices?.[0]?.message?.content;

  if (typeof content === 'string' && content.trim()) {
    return content.trim();
  }

  if (Array.isArray(content)) {
    const merged = content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && typeof part.text === 'string') {
          return part.text;
        }
        return '';
      })
      .join('')
      .trim();

    if (merged) return merged;
  }

  throw new Error('Empty AI response');
}

// 构建检索词
export function buildQueryTexts(page, summary) {
  const title = clipText(page?.title, 300);
  const selectedText = clipText(page?.selectedText, 800);
  const pageExcerpt = clipText(page?.pageText, 1200);
  const summaryText = clipText(summary?.summary, 700);
  const entities = Array.isArray(summary?.entities)
    ? summary.entities.map((item) => clipText(item, 60)).filter(Boolean)
    : [];

  const primarySections = [
    title ? `Title: ${title}` : '',
    selectedText ? `Selected text: ${selectedText}` : (pageExcerpt ? `Page excerpt: ${pageExcerpt}` : ''),
    summaryText ? `Summary: ${summaryText}` : '',
    entities.length > 0 ? `Key entities: ${entities.join(', ')}` : '',
  ].filter(Boolean);

  const parts = [
    primarySections.length > 0 ? primarySections.join('\n') : '',
    title,
    selectedText,
    summaryText,
  ].filter(Boolean);

  const seen = new Set();
  return parts
    .map((part) => clipText(part, 1600))
    .filter((normalized) => {
      if (!normalized) return false;
      const key = normalized.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
}

// 生成摘要
async function summarizePage(page, options) {
  const rawText = await requestChatCompletion({
    fetchImpl: options.fetchImpl,
    apiBaseUrl: options.env.OPENROUTER_API_BASE_URL || OPENROUTER_API_BASE_URL,
    apiKey: options.env.OPENROUTER_API_KEY || '',
    model: options.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL,
    httpReferer: options.env.OPENROUTER_HTTP_REFERER || DEFAULT_OPENROUTER_HTTP_REFERER,
    appTitle: options.env.OPENROUTER_APP_TITLE || DEFAULT_OPENROUTER_APP_TITLE,
    messages: [
      {
        role: 'system',
        content: [
          'You are a prediction-market event summarization assistant.',
          'Generate one concise English summary optimized for Polymarket vector retrieval.',
          'Rules:',
          '1) Use only facts from the input. Do not speculate.',
          '2) summary must be one English paragraph (45-90 words) and include: who/what happened, timing, and likely impacted target.',
          '3) reliability must be high|medium|low; reliability_reason must be one short English sentence.',
          '4) entities must be canonical English names/terms (max 8).',
          '5) Preserve exact proper nouns, acronyms, district codes, tickers, quoted phrases, and abbreviations when present.',
          '6) Output strict JSON only; do not output chain-of-thought.',
          'JSON schema: {"summary":"...","reliability":"high|medium|low","reliability_reason":"...","entities":["..."]}',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          `Page title: ${page.title}`,
          `Page URL: ${page.url}`,
          page.selectedText ? `User selected text:\n${page.selectedText}` : 'User selected text: (none)',
          `Page content excerpt:\n${page.pageText}`,
        ].join('\n\n'),
      },
    ],
  });

  const parsed = parseJsonLoose(rawText);
  const summary = clipText(parsed.summary, 700);

  if (!summary) {
    throw new Error('Summary is empty');
  }

  return {
    summary,
    reliability: clipText(parsed.reliability, 20) || 'medium',
    reliabilityReason: clipText(parsed.reliability_reason, 240) || 'No reliability reason provided.',
    entities: Array.isArray(parsed.entities)
      ? parsed.entities.map((item) => clipText(item, 60)).filter(Boolean)
      : [],
  };
}

// 判定匹配
async function findMatchesForChunk(summary, markets, options) {
  if (markets.length === 0) return [];

  const marketDigest = markets.map((item) => ({
    id: item.id,
    question: item.question,
    endDate: item.endDate,
    tags: item.tags,
    liquidityNum: item.liquidityNum,
    volumeNum: item.volumeNum,
  }));

  const rawText = await requestChatCompletion({
    fetchImpl: options.fetchImpl,
    apiBaseUrl: options.env.OPENROUTER_API_BASE_URL || OPENROUTER_API_BASE_URL,
    apiKey: options.env.OPENROUTER_API_KEY || '',
    model: options.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL,
    httpReferer: options.env.OPENROUTER_HTTP_REFERER || DEFAULT_OPENROUTER_HTTP_REFERER,
    appTitle: options.env.OPENROUTER_APP_TITLE || DEFAULT_OPENROUTER_APP_TITLE,
    messages: [
      {
        role: 'system',
        content: [
          '你是 Polymarket 题目匹配助手。',
          '输入是网页事件摘要和最多100个市场题目，请找出存在明确关联的候选。',
          '严格规则：',
          '1) 事件主体、结果变量、时间窗口至少两项明显相关，才算匹配；',
          '2) 不能只凭关键词重叠；',
          '3) reason 必须具体且不超过60字；',
          '4) 不输出思考过程。',
          '输出 JSON：{"matches":[{"market_id":123,"confidence":0-100,"direction":"利好|利空|不确定","reason":"..."}]}',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          `网页摘要: ${summary.summary}`,
          `可靠性: ${summary.reliability}（${summary.reliabilityReason}）`,
          summary.entities.length > 0 ? `核心实体: ${summary.entities.join('、')}` : '核心实体: （无）',
          '候选题目(JSON):',
          JSON.stringify(marketDigest),
        ].join('\n\n'),
      },
    ],
  });

  const parsed = parseJsonLoose(rawText);
  const rawMatches = Array.isArray(parsed.matches) ? parsed.matches : [];

  return rawMatches
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
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
        marketUrl: buildPolymarketUrl(String(market.url || ''), String(market.slug || '')),
      };
    })
    .filter(Boolean);
}

// 请求聊天
async function requestChatCompletion(options) {
  if (!options.apiKey) {
    throw new Error('Missing OPENROUTER_API_KEY');
  }

  const response = await options.fetchImpl(`${options.apiBaseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'HTTP-Referer': options.httpReferer,
      'X-Title': options.appTitle,
    },
    body: JSON.stringify({
      model: options.model,
      messages: options.messages,
      reasoning: {
        enabled: false,
        effort: 'none',
      },
      stream: false,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI request failed (${response.status}): ${errorText.slice(0, 600)}`);
  }

  return extractAssistantText(await response.json());
}

// 请求向量
async function requestEmbeddings(options) {
  if (!options.apiKey) {
    throw new Error('Missing OPENROUTER_API_KEY');
  }

  const response = await options.fetchImpl(`${options.apiBaseUrl.replace(/\/+$/, '')}/embeddings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'HTTP-Referer': options.httpReferer,
      'X-Title': options.appTitle,
    },
    body: JSON.stringify({
      model: options.model,
      input: options.texts,
      encoding_format: 'float',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Embedding request failed (${response.status}): ${errorText.slice(0, 600)}`);
  }

  const data = await response.json();
  const rows = Array.isArray(data?.data) ? data.data : [];

  if (rows.length !== options.texts.length) {
    throw new Error(`Embedding response size mismatch: expected ${options.texts.length}, got ${rows.length}`);
  }

  const vectors = rows.map((row) => (
    Array.isArray(row?.embedding) ? row.embedding.map((value) => Number(value)) : null
  ));

  if (vectors.some((vector) => !Array.isArray(vector) || vector.length === 0)) {
    throw new Error('Embedding response was empty');
  }

  const expectedDimensions = Number(options.expectedDimensions);
  if (Number.isFinite(expectedDimensions) && vectors.some((vector) => vector.length !== expectedDimensions)) {
    throw new Error(`Embedding dimension mismatch: expected ${expectedDimensions}`);
  }

  return vectors;
}

// 计算余弦
export function cosineSimilarity(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length === 0 || left.length !== right.length) {
    return -1;
  }

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (let index = 0; index < left.length; index += 1) {
    const leftValue = Number(left[index]);
    const rightValue = Number(right[index]);
    dot += leftValue * rightValue;
    leftNorm += leftValue * leftValue;
    rightNorm += rightValue * rightValue;
  }

  if (leftNorm === 0 || rightNorm === 0) {
    return -1;
  }

  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

// 排序候选
export function pickTopMarkets(markets, marketEmbeddings, queryEmbeddings, topK) {
  const scored = [];

  for (const market of markets) {
    const vector = marketEmbeddings.get(Number(market.id));
    if (!Array.isArray(vector) || vector.length === 0) continue;

    let bestScore = -1;
    for (const queryVector of queryEmbeddings) {
      const score = cosineSimilarity(queryVector, vector);
      if (score > bestScore) {
        bestScore = score;
      }
    }

    scored.push({
      ...market,
      vectorScore: bestScore,
    });
  }

  return scored
    .sort((left, right) => right.vectorScore - left.vectorScore)
    .slice(0, topK);
}

// 去重匹配
function dedupeMatches(matches) {
  const deduped = new Map();

  for (const item of matches) {
    const existing = deduped.get(item.marketId);
    if (!existing || item.confidence > existing.confidence) {
      deduped.set(item.marketId, item);
    }
  }

  return Array.from(deduped.values()).sort((left, right) => right.confidence - left.confidence);
}

// 取市场页
async function fetchGammaMarketsPage(offset, limit, fetchImpl) {
  const url = new URL(`${GAMMA_API_BASE}/markets`);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('offset', String(offset));
  url.searchParams.set('order', 'updatedAt');
  url.searchParams.set('ascending', 'false');
  url.searchParams.set('closed', 'false');

  const response = await fetchImpl(url.toString(), {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Polymarket fetch failed (${response.status}): ${errorText.slice(0, 240)}`);
  }

  const json = await response.json();
  if (!Array.isArray(json)) {
    throw new Error('Polymarket response is not an array');
  }

  return json;
}

// 过滤开盘
function filterOpenMarkets(markets, nowIso) {
  return markets.filter((market) => {
    if (!market?.acceptingOrders) return false;
    if (!market?.endDate) return false;
    return Date.parse(market.endDate) > Date.parse(nowIso);
  });
}

// 创建服务
export function createAnalysisService(options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const env = options.env ?? process.env;
  const now = options.now ?? (() => Date.now());
  const marketCacheTtlMs = clampInt(options.marketCacheTtlMs, DEFAULT_MARKET_CACHE_TTL_MS, 1_000, 10 * 60 * 1000);
  const embedCacheTtlMs = clampInt(options.embedCacheTtlMs, DEFAULT_EMBED_CACHE_TTL_MS, 30_000, 12 * 60 * 60 * 1000);
  const embedBatchSize = clampInt(options.embedBatchSize, DEFAULT_EMBED_BATCH_SIZE, 1, 200);
  const listMarketsOverride = typeof options.listMarkets === 'function' ? options.listMarkets : null;

  let cachedMarkets = {
    expiresAt: 0,
    rows: [],
  };

  const marketEmbeddingCache = new Map();

  // 读取页面
  function readPageContext(body) {
    const page = {
      title: clipText(body?.pageContext?.title, 300) || 'Untitled',
      url: clipText(body?.pageContext?.url, 1200),
      pageText: clipText(body?.pageContext?.pageText, 12000),
      selectedText: clipText(body?.pageContext?.selectedText, 2500),
    };

    if (!page.url || !/^https?:/i.test(page.url)) {
      throw new Error('Invalid page context');
    }

    if (!page.pageText && !page.selectedText) {
      throw new Error('Invalid page context');
    }

    return page;
  }

  // 取市场集
  async function listMarkets(limit) {
    if (listMarketsOverride) {
      return listMarketsOverride({ limit });
    }

    const nowMs = now();
    if (cachedMarkets.expiresAt > nowMs && cachedMarkets.rows.length >= limit) {
      return cachedMarkets.rows.slice(0, limit);
    }

    const pageLimit = Math.min(limit, 100);
    const maxPages = Math.max(1, Math.ceil(limit / pageLimit));
    const rows = [];

    for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
      const rawMarkets = await fetchGammaMarketsPage(pageIndex * pageLimit, pageLimit, fetchImpl);
      const mapped = rawMarkets.map(mapGammaMarket).filter(Boolean);
      rows.push(...mapped);

      if (rawMarkets.length < pageLimit) {
        break;
      }
    }

    const filtered = filterOpenMarkets(rows, new Date(nowMs).toISOString()).slice(0, limit);
    cachedMarkets = {
      expiresAt: nowMs + marketCacheTtlMs,
      rows: filtered,
    };

    return filtered;
  }

  // 取向量组
  async function embedTexts(texts) {
    if (texts.length === 0) return [];

    const vectors = [];
    for (const batch of chunkArray(texts, embedBatchSize)) {
      const batchVectors = await requestEmbeddings({
        fetchImpl,
        apiBaseUrl: env.OPENROUTER_API_BASE_URL || OPENROUTER_API_BASE_URL,
        apiKey: env.OPENROUTER_API_KEY || '',
        model: env.OPENROUTER_EMBED_MODEL || DEFAULT_OPENROUTER_EMBED_MODEL,
        httpReferer: env.OPENROUTER_HTTP_REFERER || DEFAULT_OPENROUTER_HTTP_REFERER,
        appTitle: env.OPENROUTER_APP_TITLE || DEFAULT_OPENROUTER_APP_TITLE,
        expectedDimensions: env.OPENROUTER_EMBED_DIMENSIONS,
        texts: batch,
      });

      vectors.push(...batchVectors);
    }

    return vectors;
  }

  // 取市场向量
  async function resolveMarketEmbeddings(markets) {
    const missingMarkets = [];
    const missingTexts = [];
    const nowMs = now();

    for (const market of markets) {
      const marketId = Number(market.id);
      const embedText = market.tags ? `${market.question}\n标签: ${market.tags}` : market.question;
      const cacheKey = `${marketId}:${market.updatedAt || ''}:${embedText}`;
      const cached = marketEmbeddingCache.get(cacheKey);

      if (cached && nowMs - cached.cachedAt < embedCacheTtlMs) {
        continue;
      }

      missingMarkets.push({ cacheKey, marketId });
      missingTexts.push(embedText);
    }

    if (missingTexts.length > 0) {
      const vectors = await embedTexts(missingTexts);
      missingMarkets.forEach((item, index) => {
        marketEmbeddingCache.set(item.cacheKey, {
          cachedAt: nowMs,
          marketId: item.marketId,
          vector: vectors[index],
        });
      });
    }

    const vectorMap = new Map();

    for (const market of markets) {
      const marketId = Number(market.id);
      const embedText = market.tags ? `${market.question}\n标签: ${market.tags}` : market.question;
      const cacheKey = `${marketId}:${market.updatedAt || ''}:${embedText}`;
      const cached = marketEmbeddingCache.get(cacheKey);
      if (cached?.vector) {
        vectorMap.set(marketId, cached.vector);
      }
    }

    return vectorMap;
  }

  // 执行分析
  async function analyze(body = {}) {
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
    const prefetchCount = clampInt(body?.prefetchCount, DEFAULT_PREFETCH_COUNT, 50, 500);
    const markets = await listMarkets(prefetchCount);
    const marketEmbeddings = await resolveMarketEmbeddings(markets);
    const candidates = pickTopMarkets(markets, marketEmbeddings, queryEmbeddings, topK);
    const vectorRecallMs = now() - startedAt - summarizeMs - queryEmbeddingMs;

    const matches = dedupeMatches(await findMatchesForChunk(summaryData, candidates, { fetchImpl, env }));
    const judgeMatchesMs = now() - startedAt - summarizeMs - queryEmbeddingMs - vectorRecallMs;

    return {
      action: 'analyze_page',
      summaryData,
      totalMarkets: markets.length,
      topK,
      prefetchCount,
      candidateCount: candidates.length,
      topVectorCandidates: candidates.slice(0, 10).map((item, index) => ({
        rank: index + 1,
        marketId: item.id,
        question: item.question,
        score: Number.isFinite(item.vectorScore) ? Number(item.vectorScore.toFixed(6)) : null,
      })),
      matches,
      timingMs: {
        summarizeMs,
        queryEmbeddingMs,
        vectorRecallMs,
        judgeMatchesMs,
        totalMs: now() - startedAt,
      },
    };
  }

  return {
    analyze,
  };
}
