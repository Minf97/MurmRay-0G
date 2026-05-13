# Hidden Surfaces

当前产品临时采用免费策略，sidepanel 里先隐藏钱包和付费入口。底层代码没有删除，后续恢复时按下面位置打开。

## 统一开关

位置：`src/shared/feature-flags.ts`

```ts
export const SHOW_WALLET_SURFACE = false;
export const SHOW_PAYMENT_SURFACE = false;
```

恢复钱包入口时，把 `SHOW_WALLET_SURFACE` 改成 `true`。

付费入口当前没有挂回 sidepanel；恢复收费时，先把 `SHOW_PAYMENT_SURFACE` 改成 `true`，再按下面“付费入口”补 UI。

## 钱包入口

主要位置：

1. `entrypoints/sidepanel/App.tsx`
   - `ProfileView` 里用 `SHOW_WALLET_SURFACE` 包住 `WalletStatusBlock`。
   - `useEffect` 里只在 `SHOW_WALLET_SURFACE` 为 `true` 时调用 `refreshWalletState({ silent: true })`。
   - `requestPortfolioSnapshot` 在钱包隐藏时不自动读取钱包，只允许手动 Polymarket 地址。
2. `src/background/wallet.ts`
   - 钱包检测、连接、切链逻辑保留。
3. `entrypoints/background.ts`
   - `wallet:get_state`、`wallet:connect`、`wallet:switch_xlayer` 消息处理保留。

恢复后建议跑：

```bash
npm run test
npm run build
```

## 付费入口

当前状态：

1. sidepanel 没有渲染会员/付费 UI。
2. `tests/sidepanel/styles.test.mjs` 会检查会员入口仍隐藏。
3. `src/background/membership.ts`、`src/shared/membership.ts` 保留会员状态和目录逻辑。
4. `entrypoints/background.ts` 保留 `membership:get_status` 和 `membership:get_catalog`。

恢复收费时需要补回：

1. `entrypoints/sidepanel/App.tsx` 中的会员/购买视图。
2. 订单创建、链上支付、订单确认消息。
3. 对应测试。

旧实现参考：

1. `/Users/mac/Desktop/code/osaka/packages/extension/src/sidepanel/payment.js`
2. `/Users/mac/Desktop/code/osaka/packages/extension/src/background/api.js`
3. `/Users/mac/Desktop/code/osaka/packages/extension/src/background/wallet.js`
