import { canonicalize, hashCanonicalJson } from './canonical.js';
import { createZeroGChainClient } from './chain.js';
import { createZeroGStorageClient } from './storage.js';
import { readProofLimit, readSignalPayload } from './validation.js';
import { resolveTrackRecordState } from './ledger.js';
import type {
  ChainSignalAnchor,
  CreateZeroGProofServiceOptions,
  PublishSignalRequest,
  SignalPayload,
  SignalProof,
} from './types.js';

// 读取根哈希
function readRootHash(storageUri: string): string {
  if (!storageUri.startsWith('0g://')) throw new Error('Invalid 0G storage URI.');
  const rootHash = storageUri.slice('0g://'.length);
  if (!rootHash) throw new Error('Invalid 0G storage URI.');
  return rootHash;
}

// 组装证明
function buildProofFromAnchor(anchor: ChainSignalAnchor, signal: SignalPayload, nowMs: number): SignalProof {
  const trackRecord = resolveTrackRecordState(signal, nowMs);
  return {
    signalHash: anchor.signalHash,
    storageUri: anchor.storageUri,
    rootHash: readRootHash(anchor.storageUri),
    storageTxHash: null,
    txHash: anchor.txHash,
    contractAddress: anchor.contractAddress,
    explorerUrl: anchor.explorerUrl,
    chainId: anchor.chainId,
    sourceTitle: signal.source.title,
    sourceUrl: signal.source.url,
    marketId: signal.market.id,
    marketQuestion: signal.market.question,
    marketUrl: signal.market.url,
    marketEndDate: signal.market.endDate,
    confidence: signal.match.confidence,
    direction: signal.match.direction,
    lifecycleStatus: trackRecord.lifecycleStatus,
    outcomeStatus: trackRecord.outcomeStatus,
    trackRecordNote: trackRecord.trackRecordNote,
    createdAt: signal.generatedAt,
  };
}

// 创建服务
export function createZeroGProofService(options: CreateZeroGProofServiceOptions = {}) {
  const env = options.env ?? process.env;
  const now = options.now ?? (() => Date.now());
  let storageClient = options.storageClient;
  let chainClient = options.chainClient;

  // 取存储器
  function getStorageClient() {
    if (!storageClient) storageClient = createZeroGStorageClient(env);
    return storageClient;
  }

  // 取链客户端
  function getChainClient() {
    if (!chainClient) chainClient = createZeroGChainClient(env);
    return chainClient;
  }

  // 发布信号
  async function publishSignal(body: PublishSignalRequest = {}): Promise<SignalProof> {
    const signal = readSignalPayload(body, now);
    const payload = canonicalize(signal);
    const signalHash = hashCanonicalJson(payload);
    const storageProof = await getStorageClient().saveSignal({ signalHash, payload });
    const chainProof = await getChainClient().registerSignalHash({
      signalHash,
      storageUri: storageProof.storageUri,
    });
    const trackRecord = resolveTrackRecordState(signal, now());

    const proof: SignalProof = {
      signalHash,
      ...storageProof,
      ...chainProof,
      sourceTitle: signal.source.title,
      sourceUrl: signal.source.url,
      marketId: signal.market.id,
      marketQuestion: signal.market.question,
      marketUrl: signal.market.url,
      marketEndDate: signal.market.endDate,
      confidence: signal.match.confidence,
      direction: signal.match.direction,
      lifecycleStatus: trackRecord.lifecycleStatus,
      outcomeStatus: trackRecord.outcomeStatus,
      trackRecordNote: trackRecord.trackRecordNote,
      createdAt: new Date(now()).toISOString(),
    };

    return proof;
  }

  // 列出证明
  async function listProofs(limitInput: unknown): Promise<SignalProof[]> {
    const anchors = await getChainClient().listSignalAnchors(readProofLimit(limitInput));
    return Promise.all(anchors.map(async (anchor) => (
      buildProofFromAnchor(anchor, await getStorageClient().loadSignal(anchor.storageUri), now())
    )));
  }

  // 查找证明
  async function findProof(signalHash: string): Promise<SignalProof | null> {
    const anchor = await getChainClient().findSignalAnchor(signalHash);
    if (!anchor) return null;
    return buildProofFromAnchor(anchor, await getStorageClient().loadSignal(anchor.storageUri), now());
  }

  return {
    publishSignal,
    listProofs,
    findProof,
  };
}
