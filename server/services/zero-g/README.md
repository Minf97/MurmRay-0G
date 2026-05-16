# zero-g proof

0G Proof 服务，供 Vercel 部署。

## Vercel

根目录 `server.ts` 默认导出 Hono app，符合 Vercel Hono 零配置入口。

## 路由

- `GET /health`
- `GET /0g-proof`
- `POST /api/0g/signals`
- `GET /api/0g/proofs`
- `GET /api/0g/proofs/:signalHash`

## 发布请求

`POST /api/0g/signals` 需要 `Authorization: Bearer <MURMRAY_PROOF_API_KEY>`。

```json
{
  "action": "publish_signal",
  "signal": {
    "source": {
      "title": "Tariff update",
      "url": "https://example.com/news/tariff"
    },
    "market": {
      "id": "101",
      "question": "Will tariffs rise before July?",
      "url": "https://polymarket.com/market/tariff-market"
    },
    "match": {
      "confidence": 87,
      "direction": "利好",
      "reason": "The event directly affects the tariff market."
    },
    "ai": {
      "summary": "Trump discussed tariff policy before July.",
      "signal": "Tariff comments increase probability for the market.",
      "evidence": ["Direct policy statement"]
    }
  }
}
```

## 合约接口

服务端会调用 `ZERO_G_SIGNAL_REGISTRY_ADDRESS`：

```solidity
function registerSignal(bytes32 signalHash, string storageUri) external;
event SignalRegistered(bytes32 indexed signalHash, string storageUri, address indexed submitter);
```

用户不需要连接钱包；后端使用 `ZERO_G_PRIVATE_KEY` 支付 0G Storage 和 0G Chain 交易。
Proof 列表直接从 `SignalRegistered` 链上事件读取，再按 `storageUri` 从 0G Storage 拉回 Signal 内容。

## 环境变量

- `MURMRAY_PROOF_API_KEY`
- `ZERO_G_STORAGE_INDEXER_RPC`
- `ZERO_G_EVM_RPC`
- `ZERO_G_PRIVATE_KEY`
- `ZERO_G_SIGNAL_REGISTRY_ADDRESS`
- `ZERO_G_SIGNAL_REGISTRY_FROM_BLOCK`
- `ZERO_G_EXPLORER_TX_BASE_URL`
