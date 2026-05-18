# zero-g signal ledger

0G Signal Ledger 服务，供 Vercel 部署。

## Vercel

根目录 `server.ts` 默认导出 Hono app，符合 Vercel Hono 零配置入口。

## 路由

- `GET /health`
- `GET /0g-proof`
- `POST /api/0g/signals`
- `GET /api/0g/proofs`
- `GET /api/0g/proofs/:signalHash`

## 扩展交互

用户正常浏览网页并触发 MurmRay 分析后，background 会把匹配到的 Signal 自动发到
`POST /api/0g/signals`。用户不需要连接钱包；0G Storage 上传和 0G Chain 登记都由服务端钱包完成。

本地自测时需要同时启动 Proof 服务和扩展：

```bash
pnpm dev:0g
WXT_ZERO_G_PROOF_API_BASE_URL=http://127.0.0.1:8790 \
WXT_ZERO_G_PROOF_API_KEY=<MURMRAY_PROOF_API_KEY> \
pnpm dev
```

分析完成后，sidepanel 会显示 0G Proof 状态；点击 `Proof` 可打开 `/0g-proof` 查看
Signal 的 Active / Expired / Resolved 状态、Storage URI、Tx Hash、合约地址和 Explorer 链接。

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
      "url": "https://polymarket.com/market/tariff-market",
      "endDate": "2026-06-01T00:00:00.000Z"
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
Ledger 列表直接从 `SignalRegistered` 链上事件读取，再按 `storageUri` 从 0G Storage 拉回 Signal 内容。
服务会用 `market.endDate` 标记 `active` 或 `expired`；真实市场结果接入前不会硬算 hit / miss。

## 环境变量

- `MURMRAY_PROOF_API_KEY`
- `ZERO_G_STORAGE_INDEXER_RPC`
- `ZERO_G_EVM_RPC`
- `ZERO_G_PRIVATE_KEY`
- `ZERO_G_SIGNAL_REGISTRY_ADDRESS`
- `ZERO_G_SIGNAL_REGISTRY_FROM_BLOCK`
- `ZERO_G_EXPLORER_TX_BASE_URL`
