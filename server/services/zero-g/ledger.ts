import type { MarketOutcomeState, SignalLifecycleStatus, SignalOutcomeStatus, SignalPayload } from './types.js';

export interface TrackRecordState {
  lifecycleStatus: SignalLifecycleStatus;
  outcomeStatus: SignalOutcomeStatus;
  trackRecordNote: string;
}

// 读取结果
function readOutcomeStatus(metadata: Record<string, unknown>): SignalOutcomeStatus {
  const status = String(metadata.outcomeStatus || '').trim().toLowerCase();
  if (status === 'hit' || status === 'miss' || status === 'unknown') return status;
  return 'pending';
}

// 判断状态
export function resolveTrackRecordState(signal: SignalPayload, nowMs: number, outcome?: MarketOutcomeState | null): TrackRecordState {
  if (outcome?.outcomeStatus === 'hit' || outcome?.outcomeStatus === 'miss') {
    return {
      lifecycleStatus: 'resolved',
      outcomeStatus: outcome.outcomeStatus,
      trackRecordNote: outcome.note,
    };
  }

  const outcomeStatus = readOutcomeStatus(signal.metadata);
  if (outcomeStatus === 'hit' || outcomeStatus === 'miss') {
    return {
      lifecycleStatus: 'resolved',
      outcomeStatus,
      trackRecordNote: outcomeStatus === 'hit' ? 'Market result matched the signal.' : 'Market result missed the signal.',
    };
  }

  if (outcome && !outcome.closed) {
    return {
      lifecycleStatus: 'active',
      outcomeStatus: 'pending',
      trackRecordNote: outcome.note,
    };
  }

  if (!signal.market.endDate) {
    return {
      lifecycleStatus: 'untracked',
      outcomeStatus,
      trackRecordNote: 'Market end date is missing, so MurmRay cannot score this signal yet.',
    };
  }

  const endMs = Date.parse(signal.market.endDate);
  if (!Number.isFinite(endMs)) {
    return {
      lifecycleStatus: 'untracked',
      outcomeStatus,
      trackRecordNote: 'Market end date is invalid, so MurmRay cannot score this signal yet.',
    };
  }

  if (endMs > nowMs) {
    return {
      lifecycleStatus: 'active',
      outcomeStatus: 'pending',
      trackRecordNote: 'Market is still open, so this signal is being tracked.',
    };
  }

  return {
    lifecycleStatus: 'expired',
    outcomeStatus: 'unknown',
    trackRecordNote: outcome?.note || 'Market window has passed; outcome is not available yet.',
  };
}
