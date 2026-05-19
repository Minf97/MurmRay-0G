import { Wallet, JsonRpcProvider } from 'ethers';
import { clipText } from '../shared/config.js';
import { readStoredSignalPayload } from './validation.js';
import type { ServerEnv, SignalPayload, StorageProof, StorageSaveInput, ZeroGStorageClient } from './types.js';

interface ZeroGStorageConfig {
  indexerRpc: string;
  evmRpc: string | null;
  privateKey: string | null;
}

type RpcClient = {
  retry: number;
  timeout: number;
};

type UploadResult = {
  txHash?: string;
  rootHash?: string;
  txHashes?: string[];
  rootHashes?: string[];
};

const STORAGE_DOWNLOAD_TIMEOUT_MS = 8_000;
const STORAGE_DOWNLOAD_RETRY_COUNT = 1;

// 读取配置
function readStorageConfig(env: ServerEnv): ZeroGStorageConfig {
  const indexerRpc = clipText(env.ZERO_G_STORAGE_INDEXER_RPC, 1200);
  const evmRpc = clipText(env.ZERO_G_EVM_RPC, 1200) || null;
  const privateKey = clipText(env.ZERO_G_PRIVATE_KEY, 200) || null;

  if (!indexerRpc) throw new Error('Missing ZERO_G_STORAGE_INDEXER_RPC');

  return { indexerRpc, evmRpc, privateKey };
}

// 读取结果
function readUploadResult(result: UploadResult, expectedRootHash: string): StorageProof {
  const storageTxHash = result.txHash || result.txHashes?.[0] || '';
  const rootHash = result.rootHash || result.rootHashes?.[0] || expectedRootHash;

  if (!storageTxHash) throw new Error('0G Storage upload tx hash is empty.');
  if (!rootHash) throw new Error('0G Storage root hash is empty.');

  return {
    storageUri: `0g://${rootHash}`,
    rootHash,
    storageTxHash,
  };
}

// 读取根哈希
function readRootHash(storageUri: string): string {
  const uri = clipText(storageUri, 200);
  if (!uri.startsWith('0g://')) throw new Error('Invalid 0G storage URI.');

  const rootHash = uri.slice('0g://'.length);
  if (!rootHash) throw new Error('Invalid 0G storage URI.');
  return rootHash;
}

// 缩短超时
function tuneStorageRpc(client: RpcClient): void {
  client.timeout = STORAGE_DOWNLOAD_TIMEOUT_MS;
  client.retry = STORAGE_DOWNLOAD_RETRY_COUNT;
}

// 创建客户端
export function createZeroGStorageClient(env: ServerEnv): ZeroGStorageClient {
  const config = readStorageConfig(env);

  return {
    async saveSignal(input: StorageSaveInput): Promise<StorageProof> {
      if (!config.evmRpc) throw new Error('Missing ZERO_G_EVM_RPC');
      if (!config.privateKey) throw new Error('Missing ZERO_G_PRIVATE_KEY');

      const { Indexer, MemData } = await import('@0gfoundation/0g-storage-ts-sdk');
      const file = new MemData(new TextEncoder().encode(input.payload));
      const [tree, treeError] = await file.merkleTree();
      if (treeError) throw treeError;

      const rootHash = tree?.rootHash();
      if (!rootHash) throw new Error('0G Storage root hash is empty.');

      const provider = new JsonRpcProvider(config.evmRpc);
      const signer = new Wallet(config.privateKey, provider);
      const [result, uploadError] = await new Indexer(config.indexerRpc).upload(file, config.evmRpc, signer);
      if (uploadError) throw uploadError;

      return readUploadResult(result, rootHash);
    },
    async loadSignal(storageUri: string): Promise<SignalPayload> {
      const { Downloader, Indexer, StorageNode, selectNodes } = await import('@0gfoundation/0g-storage-ts-sdk');
      const rootHash = readRootHash(storageUri);
      const indexer = new Indexer(config.indexerRpc);
      tuneStorageRpc(indexer);

      const locations = await indexer.getFileLocations(rootHash);
      if (!locations.length) throw new Error(`0G Storage file has no locations: ${rootHash}`);

      const [selected, ok] = selectNodes(locations, 1, 'random');
      if (!ok) throw new Error(`0G Storage file has no complete shard set: ${rootHash}`);

      const nodes = selected.map((node) => {
        const client = new StorageNode(node.url);
        tuneStorageRpc(client);
        return client;
      });

      const [blob, downloadError] = await new Downloader(nodes).downloadToBlob(rootHash);
      if (downloadError) throw downloadError;

      const payload = JSON.parse(await blob.text());
      return readStoredSignalPayload(payload);
    },
  };
}
