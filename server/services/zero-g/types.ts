export type ServerEnv = Record<string, string | undefined>;

export interface SignalSource {
  title: string;
  url: string;
}

export interface SignalMarket {
  id: string;
  question: string;
  url: string;
  endDate: string | null;
}

export interface SignalMatch {
  confidence: number;
  direction: string;
  reason: string;
}

export interface SignalAi {
  summary: string;
  signal: string;
  evidence: string[];
}

export interface SignalPayload {
  schemaVersion: 1;
  source: SignalSource;
  market: SignalMarket;
  match: SignalMatch;
  ai: SignalAi;
  generatedAt: string;
  metadata: Record<string, unknown>;
}

export type SignalLifecycleStatus = 'active' | 'expired' | 'resolved' | 'untracked';
export type SignalOutcomeStatus = 'pending' | 'hit' | 'miss' | 'unknown';

export interface PublishSignalRequest {
  action?: unknown;
  signal?: unknown;
}

export interface StorageSaveInput {
  signalHash: string;
  payload: string;
}

export interface StorageProof {
  storageUri: string;
  rootHash: string;
  storageTxHash: string | null;
}

export interface ChainRegisterInput {
  signalHash: string;
  storageUri: string;
}

export interface ChainProof {
  txHash: string;
  contractAddress: string;
  explorerUrl: string;
  chainId: string;
}

export interface ChainSignalAnchor extends ChainProof {
  signalHash: string;
  storageUri: string;
  blockNumber: number;
  logIndex: number;
}

export interface SignalProof extends StorageProof, ChainProof {
  signalHash: string;
  sourceTitle: string;
  sourceUrl: string;
  marketId: string;
  marketQuestion: string;
  marketUrl: string;
  marketEndDate: string | null;
  confidence: number;
  direction: string;
  lifecycleStatus: SignalLifecycleStatus;
  outcomeStatus: SignalOutcomeStatus;
  trackRecordNote: string;
  createdAt: string;
}

export interface MarketOutcomeState {
  checkedAt: string;
  closed: boolean;
  winningOutcome: string | null;
  outcomeStatus: SignalOutcomeStatus;
  note: string;
}

export interface ZeroGMarketOutcomeClient {
  resolve(signal: SignalPayload, nowMs: number): Promise<MarketOutcomeState | null>;
}

export interface ZeroGStorageClient {
  saveSignal(input: StorageSaveInput): Promise<StorageProof>;
  loadSignal(storageUri: string): Promise<SignalPayload>;
}

export interface ZeroGChainClient {
  registerSignalHash(input: ChainRegisterInput): Promise<ChainProof>;
  listSignalAnchors(limit: number): Promise<ChainSignalAnchor[]>;
  findSignalAnchor(signalHash: string): Promise<ChainSignalAnchor | null>;
}

export interface CreateZeroGProofServiceOptions {
  env?: ServerEnv;
  now?: () => number;
  storageClient?: ZeroGStorageClient;
  chainClient?: ZeroGChainClient;
  outcomeClient?: ZeroGMarketOutcomeClient;
}

export class ProofHttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ProofHttpError';
    this.status = status;
  }
}
