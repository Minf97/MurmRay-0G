import {
  ZERO_G_PROOF_API_BASE_URL,
  ZERO_G_PROOF_API_KEY,
} from '../shared/config';
import { readRuntimeFetch } from '../shared/runtime-fetch';
import {
  clipText,
  type AnalysisMatch,
  type AnalysisResult,
  type PageContext,
  type ZeroGProofStatus,
  type ZeroGProofSummary,
} from '../shared/analysis';

type PublishOptions = {
  baseUrl?: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
};

export type ZeroGPublishState = {
  status: ZeroGProofStatus;
  proofs: ZeroGProofSummary[];
  error: string;
  proofPageUrl: string;
};

// 拼接地址
function joinProofUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/, '')}${path}`;
}

// 页面入口
export function buildZeroGProofPageUrl(baseUrl = ZERO_G_PROOF_API_BASE_URL) {
  return joinProofUrl(baseUrl, '/0g-proof');
}

// 证明载荷
export function buildZeroGSignalRequest(
  pageContext: PageContext,
  match: AnalysisMatch,
  generatedAt: string,
) {
  const marketUrl = clipText(match.marketUrl, 1200);
  if (!marketUrl) throw new Error('Matched market URL is required for 0G proof.');

  return {
    action: 'publish_signal',
    signal: {
      source: {
        title: clipText(pageContext.title, 300) || 'Untitled',
        url: clipText(pageContext.url, 1200),
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
        summary: clipText(pageContext.selectedText || pageContext.pageText, 1200),
        signal: clipText(`${match.direction}: ${match.question}`, 1200),
        evidence: [clipText(match.reason, 500)],
      },
      generatedAt,
      metadata: {
        pageTitle: clipText(pageContext.title, 300),
        pageUrl: clipText(pageContext.url, 1200),
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

// 读取响应
async function readJson(response: Response) {
  return JSON.parse(await response.text()) as Record<string, unknown>;
}

// 发布单条
async function publishOneSignal(
  request: ReturnType<typeof buildZeroGSignalRequest>,
  options: Required<Pick<PublishOptions, 'apiKey' | 'fetchImpl'>> & { baseUrl: string },
) {
  const response = await options.fetchImpl(joinProofUrl(options.baseUrl, '/api/0g/signals'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${options.apiKey}`,
    },
    body: JSON.stringify(request),
  });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(String(payload.error || '0G proof publish failed.'));
  return normalizeProof(payload.proof);
}

// 发布证明
export async function publishZeroGProofsForAnalysis(
  pageContext: PageContext,
  result: AnalysisResult,
  options: PublishOptions = {},
): Promise<ZeroGPublishState> {
  const baseUrl = (options.baseUrl || ZERO_G_PROOF_API_BASE_URL).trim();
  const apiKey = (options.apiKey || ZERO_G_PROOF_API_KEY).trim();
  const fetchImpl = options.fetchImpl || readRuntimeFetch();
  const proofPageUrl = buildZeroGProofPageUrl(baseUrl);

  if (result.zeroGProofs?.length) {
    return { status: 'ready', proofs: result.zeroGProofs, error: '', proofPageUrl };
  }

  if (!result.matches.length) {
    return { status: 'idle', proofs: [], error: '', proofPageUrl };
  }

  if (!baseUrl || !apiKey) {
    return { status: 'skipped', proofs: [], error: '0G proof publish is not configured.', proofPageUrl };
  }

  const generatedAt = new Date((options.now || (() => Date.now()))()).toISOString();
  const proofs: ZeroGProofSummary[] = [];

  // 串行登记
  for (const match of result.matches) {
    proofs.push(await publishOneSignal(
      buildZeroGSignalRequest(pageContext, match, generatedAt),
      { baseUrl, apiKey, fetchImpl },
    ));
  }

  return { status: 'ready', proofs, error: '', proofPageUrl };
}
