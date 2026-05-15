# Hidden Payment Surface

当前产品只保留 `Polymarket 持仓`，钱包、会员购买、免费支付、链上支付入口先隐藏。
底层迁移代码保留，后续可按下面步骤恢复。

## 统一开关

位置：`src/shared/feature-flags.ts`

```ts
export const SHOW_WALLET_SURFACE = false;
export const SHOW_PAYMENT_SURFACE = false;
```

恢复入口时改为：

```ts
export const SHOW_WALLET_SURFACE = true;
export const SHOW_PAYMENT_SURFACE = true;
```

## 当前可见

1. `entrypoints/sidepanel/App.tsx`
   - `ProfileView` 只展示用户信息和 `Polymarket 持仓`。
   - 钱包区块由 `SHOW_WALLET_SURFACE` 控制。
   - 会员购买区块由 `SHOW_PAYMENT_SURFACE` 控制。

## 已保留代码

1. `entrypoints/sidepanel/App.tsx`
   - `MembershipBillingBlock`：会员权益、链上支付、会员购买和次卡购买 UI。
   - `WalletStatusBlock`：钱包检测、连接和切链 UI。
   - `handlePurchase`：创建订单、钱包支付、订单确认和权益刷新。
2. `entrypoints/background.ts`
   - 已保留订单创建、订单确认和钱包付款消息。
3. `src/background/membership.ts`
   - 已保留会员订单、次卡订单和确认 RPC。
4. `src/background/wallet.ts`
   - 已保留原生币、ERC20 转账和合约支付。

## 恢复步骤

1. 将 `src/shared/feature-flags.ts` 两个开关改成 `true`。
2. 将 `tests/shared/feature-flags.test.mjs` 改回断言 `true`。
3. 将 `tests/sidepanel/styles.test.mjs` 改回验证会员购买 surface 可见。
4. 跑验收命令。

## 验收命令

```bash
pnpm test
pnpm build
```
