import {
  DEFAULT_OPENROUTER_APP_TITLE,
  DEFAULT_OPENROUTER_EMBED_DIMENSIONS,
  DEFAULT_OPENROUTER_EMBED_MODEL,
  DEFAULT_OPENROUTER_HTTP_REFERER,
  DEFAULT_OPENROUTER_MODEL,
  OPENROUTER_API_BASE_URL,
  clipText,
} from '../shared/config';
import { parseJsonLoose, readStringArray } from './json';
import type { FetchImpl, PageContext, ServerEnv, SummaryData } from './types';

interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

interface RequestChatOptions {
  fetchImpl: FetchImpl;
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  httpReferer: string;
  appTitle: string;
  messages: ChatMessage[];
}

interface RequestEmbeddingOptions {
  fetchImpl: FetchImpl;
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  httpReferer: string;
  appTitle: string;
  expectedDimensions?: string;
  texts: string[];
}

// 提取回复
function extractAssistantText(responseJson: unknown): string {
  const json = responseJson as { choices?: { message?: { content?: unknown } }[] };
  const content = json?.choices?.[0]?.message?.content;

  if (typeof content === 'string' && content.trim()) {
    return content.trim();
  }

  if (Array.isArray(content)) {
    const merged = content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string') {
          return (part as { text: string }).text;
        }
        return '';
      })
      .join('')
      .trim();

    if (merged) return merged;
  }

  throw new Error('Empty AI response');
}

// 补齐配置
export function resolveOpenRouterConfig(env: ServerEnv): {
  apiBaseUrl: string;
  apiKey: string;
  chatModel: string;
  embedModel: string;
  httpReferer: string;
  appTitle: string;
  embedDimensions?: string;
} {
  return {
    apiBaseUrl: env.OPENROUTER_API_BASE_URL || OPENROUTER_API_BASE_URL,
    apiKey: env.OPENROUTER_API_KEY || '',
    chatModel: env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL,
    embedModel: env.OPENROUTER_EMBED_MODEL || DEFAULT_OPENROUTER_EMBED_MODEL,
    httpReferer: env.OPENROUTER_HTTP_REFERER || DEFAULT_OPENROUTER_HTTP_REFERER,
    appTitle: env.OPENROUTER_APP_TITLE || DEFAULT_OPENROUTER_APP_TITLE,
    embedDimensions: env.OPENROUTER_EMBED_DIMENSIONS || DEFAULT_OPENROUTER_EMBED_DIMENSIONS,
  };
}

// 请求聊天
async function requestChatCompletion(options: RequestChatOptions): Promise<string> {
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
export async function requestEmbeddings(options: RequestEmbeddingOptions): Promise<number[][]> {
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

  const data = await response.json() as { data?: { embedding?: unknown }[] };
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

  return vectors as number[][];
}

// 生成摘要
export async function summarizePage(page: PageContext, options: {
  fetchImpl: FetchImpl;
  env: ServerEnv;
}): Promise<SummaryData> {
  const config = resolveOpenRouterConfig(options.env);
  const rawText = await requestChatCompletion({
    fetchImpl: options.fetchImpl,
    apiBaseUrl: config.apiBaseUrl,
    apiKey: config.apiKey,
    model: config.chatModel,
    httpReferer: config.httpReferer,
    appTitle: config.appTitle,
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
          "5) Preserve exact proper nouns, acronyms, district codes, tickers, quoted phrases, and abbreviations when present (for example: SD-AL, IL-03, 'Super Bowl'). Do not expand them unless the input explicitly gives the expansion.",
          '6) If the input is already a market-style question or short headline, keep its core wording and named entities as close to the source as possible.',
          '7) Output strict JSON only; do not output chain-of-thought.',
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
    entities: readStringArray(parsed.entities, 60),
  };
}

// 请求匹配
export async function requestMarketMatches(summary: SummaryData, marketDigest: unknown[], options: {
  fetchImpl: FetchImpl;
  env: ServerEnv;
}): Promise<Record<string, unknown>[]> {
  const config = resolveOpenRouterConfig(options.env);
  const rawText = await requestChatCompletion({
    fetchImpl: options.fetchImpl,
    apiBaseUrl: config.apiBaseUrl,
    apiKey: config.apiKey,
    model: config.chatModel,
    httpReferer: config.httpReferer,
    appTitle: config.appTitle,
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
  return Array.isArray(parsed.matches) ? parsed.matches as Record<string, unknown>[] : [];
}
