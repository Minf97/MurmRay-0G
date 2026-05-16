import { createHash } from 'node:crypto';

// 判定对象
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// 稳定清理
function normalizeCanonical(value: unknown): unknown {
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Signal contains invalid number.');
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeCanonical(item));
  }

  if (isRecord(value)) {
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] === undefined) continue;
      output[key] = normalizeCanonical(value[key]);
    }
    return output;
  }

  throw new Error('Signal contains unsupported value.');
}

// 稳定 JSON
export function canonicalize(value: unknown): string {
  return JSON.stringify(normalizeCanonical(value));
}

// 计算哈希
export function hashCanonicalJson(canonicalJson: string): string {
  return `0x${createHash('sha256').update(canonicalJson).digest('hex')}`;
}
