# embeddings

已迁移的 Polymarket embeddings edge function 服务。

## 入口

- HTTP 路由：`server/index.ts`
- 服务主链路：`service.ts`

## 主链路

1. `service.ts` 编排 embedding worker。
2. `insforge.ts` 负责 enqueue、claim、apply、mark RPC。
3. `openrouter.ts` 负责请求 OpenRouter embedding。
4. `types.ts` 定义任务和 RPC 契约。

## 测试

- `tests/server/polymarket-embeddings.test.mjs`
