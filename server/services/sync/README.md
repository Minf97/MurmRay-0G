# sync

已迁移的市场 sync edge function 服务。

## 入口

- HTTP 路由：`server/index.ts`
- 服务主链路：`service.ts`

## 主链路

1. `service.ts` 编排 incremental/full/cleanup。
2. `gamma.ts` 拉取并映射 Polymarket Gamma 数据。
3. `ex1024.ts` 拉取并映射 1024ex 数据。
4. `rows.ts` 统一比较并写入变化。
5. `db.ts` 写入市场、embedding jobs 和 sync watermark。

## 动作

- `sync_incremental`：同步 Polymarket 增量市场。
- `sync_full`：同步 Polymarket 全量事件市场。
- `sync_1024ex_active`：同步 1024ex 活跃市场。
- `sync_1024ex_markets`：分页同步 1024ex 全量市场。
- `run_daily_sync`：同步 Polymarket 增量和 1024ex 活跃市场。

## 测试

- `tests/server/polymarket-sync.test.mjs`
