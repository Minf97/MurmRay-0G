import { clipText } from './config.js';
import type { Market, PageContext, SummaryData } from './types.js';

// 构建检索词
export function buildQueryTexts(page: Partial<PageContext>, summary: Partial<SummaryData>): string[] {
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

  const seen = new Set<string>();
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

// 计算余弦
export function cosineSimilarity(left: unknown, right: unknown): number {
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
export function pickTopMarkets(
  markets: Market[],
  marketEmbeddings: Map<number, number[]>,
  queryEmbeddings: number[][],
  topK: number,
): Market[] {
  const scored: Market[] = [];

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
    .sort((left, right) => Number(right.vectorScore) - Number(left.vectorScore))
    .slice(0, topK);
}
