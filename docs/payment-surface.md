# Payment Surface

当前已按 `origin/main` 恢复钱包与付费入口。

## 统一开关

位置：`src/shared/feature-flags.ts`

```ts
export const SHOW_WALLET_SURFACE = true;
export const SHOW_PAYMENT_SURFACE = true;
```

## 已接回范围

1. `entrypoints/sidepanel/App.tsx`
   - `ProfileView` 渲染会员权益、链上支付、会员购买和次卡购买。
   - 购买流程依次执行创建订单、钱包支付、订单确认和权益刷新。
2. `entrypoints/background.ts`
   - 接入订单创建、订单确认和钱包付款消息。
3. `src/background/membership.ts`
   - 写入会员订单、次卡订单，并调用确认 RPC。
4. `src/background/wallet.ts`
   - 支持原生币、ERC20 转账和合约支付。

## 验收命令

```bash
pnpm test
pnpm build
```
