import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_FREE_DAILY_QUOTA,
  MURMRAY_PAYMENT_CONFIG,
  createDefaultPricingCatalog,
  createFreeMembershipStatus,
  buildChainPaymentOrderId,
  getMembershipPlan,
  getPlanPriceLabel,
  getQuotaLabel,
  isPaymentConfigReady,
  paymentAmountToBaseUnits,
  paymentAmountToHexUnits,
  normalizeMembershipStatus,
  normalizePricingCatalogRows,
} from '../../src/shared/membership';

test('membership catalog falls back to local defaults', () => {
  const catalog = createDefaultPricingCatalog();

  assert.equal(catalog.source, 'local');
  assert.equal(catalog.membershipPlans[0].code, 'free');
  assert.equal(catalog.membershipPlans[0].dailyQuota, DEFAULT_FREE_DAILY_QUOTA);
  assert.equal(getMembershipPlan('missing', catalog.membershipPlans).code, 'free');
});

test('membership catalog normalizes backend rows', () => {
  const catalog = normalizePricingCatalogRows([
    {
      product_type: 'membership',
      code: 'premium',
      name: 'Pro',
      daily_quota: null,
      price_amount: '5.00',
      featured: 'true',
      sort_order: '5',
    },
    {
      product_type: 'usage_pack',
      code: 'pack_10',
      name: '10 Pack',
      credit_count: '10',
      price_amount: '0.100',
      sort_order: 6,
    },
  ]);

  assert.equal(catalog.source, 'backend');
  assert.equal(catalog.membershipPlans[0].code, 'premium');
  assert.equal(catalog.membershipPlans[0].priceAmount, '5');
  assert.equal(catalog.membershipPlans[0].featured, true);
  assert.equal(catalog.membershipPlans.find((plan) => plan.code === 'free').isActive, false);
  assert.equal(catalog.usagePacks[0].code, 'pack_10');
  assert.equal(catalog.usagePacks[0].creditCount, 10);
});

test('membership status normalizes quota and dates', () => {
  const status = normalizeMembershipStatus({
    plan_code: 'premium',
    used_today: 11,
    extra_credits: 3,
    expires_at: '2026-01-02T03:04:05Z',
  });

  assert.equal(status.planCode, 'premium');
  assert.equal(status.unlimited, true);
  assert.equal(status.remainingToday, null);
  assert.equal(status.extraCredits, 3);
  assert.equal(status.expiresAt, '2026-01-02T03:04:05.000Z');
});

test('membership copy formats free quota', () => {
  assert.equal(createFreeMembershipStatus().remainingToday, DEFAULT_FREE_DAILY_QUOTA);
  assert.equal(getQuotaLabel(null), '不限次数 / 日');
  assert.equal(getQuotaLabel(1000), '1000 次 / 日');
});

test('membership payment helpers format x layer prices', () => {
  const catalog = createDefaultPricingCatalog();
  const plan = getMembershipPlan('premium', catalog.membershipPlans);

  assert.equal(getPlanPriceLabel(plan), `5 ${MURMRAY_PAYMENT_CONFIG.paymentSymbol}`);
  assert.equal(isPaymentConfigReady(plan), true);
  assert.equal(paymentAmountToBaseUnits('0.1', 6), '100000');
  assert.equal(paymentAmountToHexUnits('0.1', 6), '0x186a0');
  assert.equal(
    buildChainPaymentOrderId({
      productType: 'membership',
      itemName: 'Pro|Plan',
      amount: '5',
      symbol: 'USDT0',
      orderId: ' order\n1 ',
    }),
    'membership|Pro Plan|5 USDT0|order 1',
  );
});
