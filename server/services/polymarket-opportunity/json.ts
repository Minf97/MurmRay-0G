import { clipText } from './config';

// 解析对象
function parseObject(text: string): Record<string, unknown> | null {
  const parsed = JSON.parse(text);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  return null;
}

// 解析松散 JSON
export function parseJsonLoose(rawText: unknown): Record<string, unknown> {
  const trimmed = String(rawText || '').trim();
  if (!trimmed) return {};

  try {
    const parsed = parseObject(trimmed);
    if (parsed) return parsed;
  } catch {
    // 继续解析
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    try {
      const parsed = parseObject(fencedMatch[1].trim());
      if (parsed) return parsed;
    } catch {
      // 继续解析
    }
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      const parsed = parseObject(trimmed.slice(firstBrace, lastBrace + 1));
      if (parsed) return parsed;
    } catch {
      // 继续解析
    }
  }

  return {};
}

// 读取数组
export function readStringArray(input: unknown, maxChars: number): string[] {
  if (!Array.isArray(input)) return [];
  return input.map((item) => clipText(item, maxChars)).filter(Boolean);
}
