import { clipText } from './config.js';
import type { FetchImpl, MatchResult, PageContext, ServerEnv, SummaryData } from './types.js';

export type ZeroGProofStatus = 'idle' | 'skipped' | 'ready';

export interface ZeroGProofSummary {
  signalHash: string;
  storageUri: string;
  txHash: string;
  contractAddress: string;
  explorerUrl: string;
  marketId: string;
  marketQuestion: string;
  marketEndDate: string | null;
  lifecycleStatus: string;
  outcomeStatus: string;
  trackRecordNote: string;
  sourceTitle: string;
  createdAt: string;
}

export interface ZeroGProofPublishState {
  status: ZeroGProofStatus;
  proofs: ZeroGProofSummary[];
  error: string;
  proofPageUrl: string;
}

interface PublishOptions {
  env: ServerEnv;
  fetchImpl: FetchImpl;
  now: () => number;
}

// 拼接地址
function joinProofUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/, '')}${path}`;
}

// 读取配置
function readProofConfig(env: ServerEnv) {
  const baseUrl = clipText(env.ZERO_G_PROOF_API_BASE_URL, 1200);
  const apiKey = clipText(env.MURMRAY_PROOF_API_KEY, 500);
  if (!baseUrl || !apiKey) return null;
  return { baseUrl, apiKey };
}

// 组装载荷
export function buildZeroGSignalRequest(
  page: PageContext,
  summary: SummaryData,
  match: MatchResult,
  generatedAt: string,
) {
  const marketUrl = clipText(match.marketUrl, 1200);
  if (!marketUrl) throw new Error('Matched market URL is required for 0G proof.');

  return {
    action: 'publish_signal',
    signal: {
      source: {
        title: clipText(page.title, 300) || 'Untitled',
        url: clipText(page.url, 1200),
      },
      market: {
        id: String(match.marketId),
        question: clipText(match.question, 500),
        url: marketUrl,
        endDate: clipText(match.marketEndDate, 80) || null,
      },
      match: {
        confidence: Math.round(Number(match.confidence) || 0),
        direction: clipText(match.direction, 40) || '不确定',
        reason: clipText(match.reason, 500),
      },
      ai: {
        summary: clipText(summary.summary, 1200),
        signal: clipText(`${match.direction}: ${match.question}`, 1200),
        evidence: [clipText(match.reason, 500)],
      },
      generatedAt,
      metadata: {
        reliability: clipText(summary.reliability, 80),
        reliabilityReason: clipText(summary.reliabilityReason, 500),
      },
    },
  };
}

// 标准证明
function normalizeProof(value: unknown): ZeroGProofSummary {
  const proof = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const signalHash = clipText(proof.signalHash, 80);
  const storageUri = clipText(proof.storageUri, 240);
  const txHash = clipText(proof.txHash, 80);
  if (!signalHash || !storageUri || !txHash) throw new Error('Invalid 0G proof response.');

  return {
    signalHash,
    storageUri,
    txHash,
    contractAddress: clipText(proof.contractAddress, 120),
    explorerUrl: clipText(proof.explorerUrl, 1200),
    marketId: clipText(proof.marketId, 120),
    marketQuestion: clipText(proof.marketQuestion, 500),
    marketEndDate: clipText(proof.marketEndDate, 80) || null,
    lifecycleStatus: clipText(proof.lifecycleStatus, 40),
    outcomeStatus: clipText(proof.outcomeStatus, 40),
    trackRecordNote: clipText(proof.trackRecordNote, 500),
    sourceTitle: clipText(proof.sourceTitle, 300),
    createdAt: clipText(proof.createdAt, 80),
  };
}

// 发布单条
async function publishOneSignal(
  baseUrl: string,
  apiKey: string,
  fetchImpl: FetchImpl,
  request: ReturnType<typeof buildZeroGSignalRequest>,
) {
  const response = await fetchImpl(joinProofUrl(baseUrl, '/api/0g/signals'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(request),
  });
  const payload = JSON.parse(await response.text()) as Record<string, unknown>;
  if (!response.ok) throw new Error(String(payload.error || '0G proof publish failed.'));
  return normalizeProof(payload.proof);
}

// 发布证明
export async function publishZeroGProofs(
  page: PageContext,
  summary: SummaryData,
  matches: MatchResult[],
  options: PublishOptions,
): Promise<ZeroGProofPublishState> {
  if (!matches.length) return { status: 'idle', proofs: [], error: '', proofPageUrl: '' };

  const config = readProofConfig(options.env);
  if (!config) return { status: 'skipped', proofs: [], error: '0G proof publish is not configured.', proofPageUrl: '' };

  const generatedAt = new Date(options.now()).toISOString();
  const proofs: ZeroGProofSummary[] = [];

  // 串行登记
  for (const match of matches) {
    proofs.push(await publishOneSignal(
      config.baseUrl,
      config.apiKey,
      options.fetchImpl,
      buildZeroGSignalRequest(page, summary, match, generatedAt),
    ));
  }

  return {
    status: 'ready',
    proofs,
    error: '',
    proofPageUrl: joinProofUrl(config.baseUrl, '/0g-proof'),
  };
}
