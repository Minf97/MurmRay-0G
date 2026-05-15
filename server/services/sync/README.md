# sync

已迁移的 Polymarket sync edge function 服务。

## 入口

- HTTP 路由：`server/index.ts`
- 服务主链路：`service.ts`

## 主链路

1. `service.ts` 编排 incremental/full/cleanup。
2. `gamma.ts` 拉取并映射 Polymarket Gamma 数据。
3. `db.ts` 写入市场、embedding jobs 和 sync watermark。

## 测试

- `tests/server/polymarket-sync.test.mjs`
