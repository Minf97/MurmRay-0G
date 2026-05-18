import { Contract, Interface, JsonRpcProvider, Wallet, id } from 'ethers';
import { clampInt, clipText } from '../shared/config.js';
import type {
  ChainProof,
  ChainRegisterInput,
  ChainSignalAnchor,
  ServerEnv,
  ZeroGChainClient,
} from './types.js';

export const SIGNAL_REGISTRY_ABI = [
  'function registerSignal(bytes32 signalHash,string storageUri) external',
  'event SignalRegistered(bytes32 indexed signalHash,string storageUri,address indexed submitter)',
];
export const SIGNAL_REGISTERED_TOPIC = id('SignalRegistered(bytes32,string,address)');

interface ZeroGChainConfig {
  evmRpc: string;
  privateKey: string | null;
  contractAddress: string;
  explorerTxBaseUrl: string;
  fromBlock: number;
}

// 读取配置
function readChainConfig(env: ServerEnv): ZeroGChainConfig {
  const evmRpc = clipText(env.ZERO_G_EVM_RPC, 1200);
  const privateKey = clipText(env.ZERO_G_PRIVATE_KEY, 200) || null;
  const contractAddress = clipText(env.ZERO_G_SIGNAL_REGISTRY_ADDRESS, 120);
  const explorerTxBaseUrl = clipText(env.ZERO_G_EXPLORER_TX_BASE_URL, 1200);
  const fromBlock = clampInt(env.ZERO_G_SIGNAL_REGISTRY_FROM_BLOCK, 0, 0, Number.MAX_SAFE_INTEGER);

  if (!evmRpc) throw new Error('Missing ZERO_G_EVM_RPC');
  if (!contractAddress) throw new Error('Missing ZERO_G_SIGNAL_REGISTRY_ADDRESS');
  if (!explorerTxBaseUrl) throw new Error('Missing ZERO_G_EXPLORER_TX_BASE_URL');

  return { evmRpc, privateKey, contractAddress, explorerTxBaseUrl, fromBlock };
}

// 拼接链接
function buildExplorerUrl(baseUrl: string, txHash: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${txHash}`;
}

// 排序日志
function sortAnchors(items: ChainSignalAnchor[]): ChainSignalAnchor[] {
  return items.sort((left, right) => (
    right.blockNumber - left.blockNumber || right.logIndex - left.logIndex
  ));
}

// 创建客户端
export function createZeroGChainClient(env: ServerEnv): ZeroGChainClient {
  const config = readChainConfig(env);
  const provider = new JsonRpcProvider(config.evmRpc);
  const registryInterface = new Interface(SIGNAL_REGISTRY_ABI);

  // 解析事件
  async function mapLog(log: Awaited<ReturnType<typeof provider.getLogs>>[number]): Promise<ChainSignalAnchor> {
    const parsed = registryInterface.parseLog({ topics: [...log.topics], data: log.data });
    if (!parsed) throw new Error('Invalid SignalRegistered log.');

    const network = await provider.getNetwork();
    return {
      signalHash: String(parsed.args.signalHash).toLowerCase(),
      storageUri: String(parsed.args.storageUri),
      txHash: log.transactionHash,
      contractAddress: config.contractAddress,
      explorerUrl: buildExplorerUrl(config.explorerTxBaseUrl, log.transactionHash),
      chainId: network.chainId.toString(),
      blockNumber: log.blockNumber,
      logIndex: log.index,
    };
  }

  // 查询事件
  async function queryAnchors(topics: string[], limit: number): Promise<ChainSignalAnchor[]> {
    const logs = await provider.getLogs({
      address: config.contractAddress,
      fromBlock: config.fromBlock,
      toBlock: 'latest',
      topics,
    });
    const anchors = await Promise.all(logs.map(mapLog));
    return sortAnchors(anchors).slice(0, limit);
  }

  return {
    async registerSignalHash(input: ChainRegisterInput): Promise<ChainProof> {
      if (!config.privateKey) throw new Error('Missing ZERO_G_PRIVATE_KEY');

      const signer = new Wallet(config.privateKey, provider);
      const contract = new Contract(config.contractAddress, SIGNAL_REGISTRY_ABI, signer);
      const network = await provider.getNetwork();
      const tx = await contract.registerSignal(input.signalHash, input.storageUri);
      const receipt = await tx.wait();

      if (!receipt || receipt.status !== 1) {
        throw new Error('0G Chain registry transaction failed.');
      }

      return {
        txHash: tx.hash,
        contractAddress: config.contractAddress,
        explorerUrl: buildExplorerUrl(config.explorerTxBaseUrl, tx.hash),
        chainId: network.chainId.toString(),
      };
    },
    async listSignalAnchors(limit: number): Promise<ChainSignalAnchor[]> {
      return queryAnchors([SIGNAL_REGISTERED_TOPIC], limit);
    },
    async findSignalAnchor(signalHash: string): Promise<ChainSignalAnchor | null> {
      const anchors = await queryAnchors([SIGNAL_REGISTERED_TOPIC, signalHash], 1);
      return anchors[0] || null;
    },
  };
}
