import { clipText } from '../shared/config.js';
import { readRuntimeFetch } from '../../runtime/fetch.js';
import type { MarketOutcomeState, SignalOutcomeStatus, SignalPayload, ZeroGMarketOutcomeClient } from './types.js';

const GAMMA_API_BASE = 'https://gamma-api.polymarket.com';

// 读记录
function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

// 读布尔
function readBoolean(value: unknown): boolean {
  return value === true || String(value).toLowerCase() === 'true';
}

// 读数组
function readJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const text = clipText(value, 5000);
  if (!text) return [];
  const parsed = JSON.parse(text);
  return Array.isArray(parsed) ? parsed : [];
}

// 是否肯定
function isYesDirection(direction: string): boolean {
  return /利好|yes|y\b|看涨|支持|positive|for/i.test(direction);
}

// 是否否定
function isNoDirection(direction: string): boolean {
  return /利空|no|n\b|看跌|反对|negative|against/i.test(direction);
}

// 对应结果
function expectedOutcome(signal: SignalPayload): string | null {
  if (isYesDirection(signal.match.direction)) return 'yes';
  if (isNoDirection(signal.match.direction)) return 'no';
  return null;
}

// 取赢家
function resolveWinningOutcome(market: Record<string, unknown>): string | null {
  const winner = clipText(market.winningOutcome ?? market.winnerOutcome ?? market.winner, 120);
  if (winner) return winner;

  const outcomes = readJsonArray(market.outcomes);
  const prices = readJsonArray(market.outcomePrices);
  const index = prices.findIndex((price) => Number(price) >= 0.99);
  return index >= 0 ? clipText(outcomes[index], 120) || null : null;
}

// 判断命中
function scoreOutcome(signal: SignalPayload, winningOutcome: string | null): SignalOutcomeStatus {
  const expected = expectedOutcome(signal);
  if (!expected || !winningOutcome) return 'unknown';
  return winningOutcome.trim().toLowerCase() === expected ? 'hit' : 'miss';
}

// 结果说明
function buildNote(outcomeStatus: SignalOutcomeStatus, winningOutcome: string | null): string {
  if (outcomeStatus === 'hit') return `Market resolved to ${winningOutcome}; signal matched.`;
  if (outcomeStatus === 'miss') return `Market resolved to ${winningOutcome}; signal missed.`;
  return 'Market is closed, but winning outcome is not available yet.';
}

// 查市场
async function fetchGammaMarket(fetchImpl: typeof fetch, marketId: string): Promise<Record<string, unknown> | null> {
  const response = await fetchImpl(`${GAMMA_API_BASE}/markets/${encodeURIComponent(marketId)}`, {
    headers: { Accept: 'application/json' },
  });
  const text = await response.text();
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Gamma market request failed (${response.status}): ${text.slice(0, 240)}`);
  return asRecord(text ? JSON.parse(text) : null);
}

// 创建结果源
export function createPolymarketOutcomeClient(fetchImpl: typeof fetch = readRuntimeFetch()): ZeroGMarketOutcomeClient {
  return {
    async resolve(signal: SignalPayload, nowMs: number): Promise<MarketOutcomeState | null> {
      if (!signal.market.id || Number(signal.market.id) < 0) return null;

      const market = await fetchGammaMarket(fetchImpl, signal.market.id);
      if (!market) return null;

      const closed = readBoolean(market.closed) || readBoolean(market.archived);
      if (!closed) {
        return {
          checkedAt: new Date(nowMs).toISOString(),
          closed: false,
          winningOutcome: null,
          outcomeStatus: 'pending',
          note: 'Market is still open on Polymarket.',
        };
      }

      const winningOutcome = resolveWinningOutcome(market);
      const outcomeStatus = scoreOutcome(signal, winningOutcome);
      return {
        checkedAt: new Date(nowMs).toISOString(),
        closed: true,
        winningOutcome,
        outcomeStatus,
        note: buildNote(outcomeStatus, winningOutcome),
      };
    },
  };
}
