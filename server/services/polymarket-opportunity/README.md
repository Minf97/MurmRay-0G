# polymarket-opportunity

已迁移的 Polymarket opportunity edge function 服务。

## 入口

- HTTP 路由：`server/index.ts`
- 服务主链路：`service.ts`

## 主链路

1. `service.ts` 读取请求并编排分析流程。
2. `openrouter.ts` 调 OpenRouter 做摘要、embedding 和匹配判断。
3. `insforge.ts` 调 InsForge RPC 做向量候选召回。
4. `market.ts` 映射 RPC 返回的市场候选。
5. `vector.ts` 保留检索词和本地排序测试工具。

## 测试

- `tests/server/analysis-service.test.mjs`
- `tests/server/defaults.test.mjs`
