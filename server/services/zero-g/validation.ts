import { clampInt, clipText } from '../shared/config';
import { ProofHttpError, type PublishSignalRequest, type SignalPayload } from './types';

const MAX_EVIDENCE_ITEMS = 8;

// 判定对象
function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ProofHttpError(400, `${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

// 读取文本
function requiredText(value: unknown, maxChars: number, label: string): string {
  const text = clipText(value, maxChars);
  if (!text) throw new ProofHttpError(400, `${label} is required.`);
  return text;
}

// 读取链接
function requiredHttpUrl(value: unknown, label: string): string {
  const url = requiredText(value, 1200, label);
  if (!/^https?:\/\//i.test(url)) {
    throw new ProofHttpError(400, `${label} must be an HTTP URL.`);
  }
  return url;
}

// 读取置信度
function readConfidence(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new ProofHttpError(400, 'signal.match.confidence is required.');
  }
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

// 读取证据
function readEvidence(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new ProofHttpError(400, 'signal.ai.evidence must be an array.');
  }

  const evidence = value
    .map((item) => clipText(item, 500))
    .filter((item) => Boolean(item))
    .slice(0, MAX_EVIDENCE_ITEMS);

  if (evidence.length === 0) {
    throw new ProofHttpError(400, 'signal.ai.evidence is required.');
  }

  return evidence;
}

// 读取元数据
function readMetadata(value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  return asRecord(value, 'signal.metadata');
}

// 读取时间
function readGeneratedAt(value: unknown, now: () => number): string {
  const text = clipText(value, 80);
  if (!text) return new Date(now()).toISOString();

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    throw new ProofHttpError(400, 'signal.generatedAt must be a valid date.');
  }
  return date.toISOString();
}

// 限制数量
export function readProofLimit(value: unknown): number {
  return clampInt(value, 50, 1, 200);
}

// 读取信号
export function readSignalPayload(body: PublishSignalRequest, now: () => number): SignalPayload {
  if (body.action !== undefined && body.action !== 'publish_signal') {
    throw new ProofHttpError(400, 'Unsupported action. Use action=publish_signal.');
  }

  const signal = asRecord(body.signal, 'signal');
  const source = asRecord(signal.source, 'signal.source');
  const market = asRecord(signal.market, 'signal.market');
  const match = asRecord(signal.match, 'signal.match');
  const ai = asRecord(signal.ai, 'signal.ai');

  return {
    schemaVersion: 1,
    source: {
      title: requiredText(source.title, 300, 'signal.source.title'),
      url: requiredHttpUrl(source.url, 'signal.source.url'),
    },
    market: {
      id: requiredText(market.id, 120, 'signal.market.id'),
      question: requiredText(market.question, 500, 'signal.market.question'),
      url: requiredHttpUrl(market.url, 'signal.market.url'),
    },
    match: {
      confidence: readConfidence(match.confidence),
      direction: requiredText(match.direction, 40, 'signal.match.direction'),
      reason: requiredText(match.reason, 500, 'signal.match.reason'),
    },
    ai: {
      summary: requiredText(ai.summary, 1200, 'signal.ai.summary'),
      signal: requiredText(ai.signal, 1200, 'signal.ai.signal'),
      evidence: readEvidence(ai.evidence),
    },
    generatedAt: readGeneratedAt(signal.generatedAt, now),
    metadata: readMetadata(signal.metadata),
  };
}

// 读取已存信号
export function readStoredSignalPayload(value: unknown): SignalPayload {
  const signal = readSignalPayload({ signal: value }, () => 0);
  if (asRecord(value, 'stored signal').schemaVersion !== 1) {
    throw new ProofHttpError(500, 'Stored signal schema is unsupported.');
  }
  return signal;
}

// 校验哈希
export function assertSignalHash(value: unknown): string {
  const hash = clipText(value, 80).toLowerCase();
  if (!/^0x[a-f0-9]{64}$/.test(hash)) {
    throw new ProofHttpError(400, 'Invalid signal hash.');
  }
  return hash;
}
