import { createClient } from '@insforge/sdk';
import {
  ANALYSIS_FUNCTION_NAME,
  ANALYSIS_TIMEOUT_MS,
  INSFORGE_ANON_KEY,
  INSFORGE_URL,
} from '../shared/config.ts';
import { normalizeAnalysisResult, type AnalysisResult, type PageContext } from '../shared/analysis.ts';

// 建客户端
function createInsforgeClient() {
  return createClient({
    baseUrl: INSFORGE_URL,
    anonKey: INSFORGE_ANON_KEY,
    edgeFunctionToken: INSFORGE_ANON_KEY,
    autoRefreshToken: false,
    persistSession: false,
  });
}

// 统一报错
function normalizeFetchError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '分析失败');
  const lower = message.toLowerCase();

  if (lower.includes('abort')) {
    return '云端分析服务请求超时';
  }

  if (
    lower.includes('failed to fetch')
    || lower.includes('fetch failed')
    || lower.includes('load failed')
    || lower.includes('network')
  ) {
    return '无法连接云端分析服务';
  }

  return message;
}

// 调后端
export async function invokePolymarketAnalysis(pageContext: PageContext): Promise<AnalysisResult> {
  const client = createInsforgeClient();

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('abort')), ANALYSIS_TIMEOUT_MS);
    });

    const invokePromise = client.functions.invoke(ANALYSIS_FUNCTION_NAME, {
      body: {
        action: 'analyze_page',
        pageContext,
        topK: 100,
      },
    });

    const { data, error } = await Promise.race([invokePromise, timeoutPromise]);

    if (error) {
      throw new Error(error.message || JSON.stringify(error));
    }

    return normalizeAnalysisResult(data);
  } catch (error) {
    throw new Error(normalizeFetchError(error));
  }
}
