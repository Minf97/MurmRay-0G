import type { ZeroGProofStatus, ZeroGProofSummary } from '../../src/shared/analysis';

type ProofStripProps = {
  status: ZeroGProofStatus;
  proofs: ZeroGProofSummary[];
  error: string;
  proofPageUrl: string;
  onOpenProof: () => void;
};

// 状态文案
function getProofCopy(status: ZeroGProofStatus, count: number, error: string) {
  if (status === 'ready') return `0G 已登记 ${count} 条 Signal`;
  if (status === 'error') return error || '0G Proof 发布失败';
  if (status === 'skipped') return '0G Proof 未配置';
  return '';
}

// 状态样式
function getProofTone(status: ZeroGProofStatus) {
  if (status === 'ready') return 'border-[#a7f3d0] bg-(--good-soft) text-(--good)';
  if (status === 'error') return 'border-[#fecdd3] bg-(--bad-soft) text-(--bad)';
  return 'border-(--rule) bg-(--surface) text-(--amber)';
}

// 证明状态条
export function ZeroGProofStrip({
  status,
  proofs,
  error,
  proofPageUrl,
  onOpenProof,
}: ProofStripProps) {
  if (status === 'idle') return null;

  const copy = getProofCopy(status, proofs.length, error);
  return (
    <section className="border-b border-(--rule) px-4 py-3" aria-label="0G Proof 状态">
      <div className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${getProofTone(status)}`}>
        <div className="min-w-0">
          <p className="m-0 truncate text-[12px] font-semibold">{copy}</p>
          {proofs[0]?.txHash ? (
            <p className="m-0 mt-0.5 truncate text-[11px] opacity-80">{proofs[0].txHash}</p>
          ) : null}
        </div>
        <button
          type="button"
          className="shrink-0 rounded-md border border-current/30 px-2.5 py-1 text-[11px] font-semibold transition-colors duration-160 hover:bg-current/10 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={onOpenProof}
          disabled={!proofPageUrl}
        >
          Proof
        </button>
      </div>
    </section>
  );
}
