import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { ExternalLink, Loader2, AlertTriangle, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'
import { PARLAY_ABI, PARLAY_ADDRESS, ACTIVE_CHAIN_ID, buildTxUrl } from '../lib/parlay-contract'
import {
  formatUsdc, formatCountdown, formatTimestamp, shortAddr,
  STATUS_LABELS, STATUS_COLORS, decodeContractError,
} from '../lib/parlay-utils'

interface Agreement {
  id: bigint
  creator: string
  arbiter: string
  recipients: readonly string[]
  sharesBps: readonly bigint[]
  amount: bigint
  releaseTime: bigint
  createdAt: bigint
  status: number
}

interface Props {
  agreement: Agreement
  viewerAddress: string | undefined
  onAction?: () => void
}

const ZERO_ADDR = '0x0000000000000000000000000000000000000000'

export function AgreementCard({ agreement, viewerAddress, onAction }: Props) {
  const { writeContract, data: txHash, isPending, reset } = useWriteContract()
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  // oxlint-disable-next-line react/purity -- Date.now is intentional here; this component is not memoized
  const now = BigInt(Math.floor(Date.now() / 1000))
  const isCreator = viewerAddress?.toLowerCase() === agreement.creator.toLowerCase()
  const isRecipient = agreement.recipients.some(r => r.toLowerCase() === viewerAddress?.toLowerCase())
  const isArbiter = viewerAddress?.toLowerCase() === agreement.arbiter.toLowerCase()
  const hasArbiter = agreement.arbiter !== ZERO_ADDR
  const deadlinePassed = now >= agreement.releaseTime
  const disputeTimeoutPassed = now >= agreement.releaseTime + 30n * 24n * 3600n

  const status = agreement.status
  const statusLabel = STATUS_LABELS[status] ?? 'Unknown'
  const statusColor = STATUS_COLORS[status] ?? 'var(--muted)'

  function tx(functionName: string, args: unknown[] = []) {
    reset()
    writeContract(
      {
        address: PARLAY_ADDRESS,
        abi: PARLAY_ABI,
        functionName: functionName,
        args: args,
        chainId: ACTIVE_CHAIN_ID,
      },
      {
        onSuccess: () => onAction?.(),
        onError: (e) => { const m = decodeContractError(e); if (m) toast.error(m) },
      }
    )
  }

  return (
    <div
      className="rounded-2xl p-4 flex flex-col gap-3"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="mono text-xs" style={{ color: 'var(--subtle)' }}>#{agreement.id.toString()}</span>
          <span
            className="rounded-full px-2 py-0.5 text-xs font-semibold"
            style={{ background: `${statusColor}22`, color: statusColor }}
          >
            {statusLabel}
          </span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="display text-lg font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
            {formatUsdc(agreement.amount)}
          </span>
          <span className="text-xs" style={{ color: 'var(--subtle)' }}>USDC</span>
        </div>
      </div>

      {/* Creator / arbiter */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--muted)' }}>
        <span>Creator: <span className="mono" style={{ color: 'var(--ink-2)' }}>{shortAddr(agreement.creator)}{isCreator ? ' (you)' : ''}</span></span>
        {hasArbiter && (
          <span>
            Arbiter:{' '}
            <span className="mono" style={{ color: isArbiter ? 'var(--accent)' : 'var(--ink-2)' }}>
              {agreement.arbiter}{isArbiter ? ' (you)' : ''}
            </span>
          </span>
        )}
      </div>

      {/* Arbiter warning — shown whenever an arbiter is set */}
      {hasArbiter && (
        <div
          className="flex gap-2 rounded-xl p-3 text-xs leading-relaxed"
          style={{ background: 'var(--warning, #92400e22)', border: '1px solid #d97706aa', color: '#fbbf24' }}
        >
          <AlertTriangle className="size-4 shrink-0 mt-px" />
          <p>
            <span className="font-semibold">Arbiter has power over these funds.</span>{' '}
            If a dispute is raised, the arbiter at{' '}
            <span className="mono break-all">{agreement.arbiter}</span>{' '}
            can redirect the full amount back to the creator or release it to recipients.
            Verify this address before relying on this agreement.
          </p>
        </div>
      )}

      {/* Recipients / split */}
      <div>
        <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--muted)' }}>Split</p>
        <div className="flex flex-col gap-1">
          {agreement.recipients.map((r, i) => (
            <div key={r} className="flex justify-between text-xs">
              <span className="mono" style={{ color: r.toLowerCase() === viewerAddress?.toLowerCase() ? 'var(--success)' : 'var(--ink-2)' }}>
                {shortAddr(r)}{r.toLowerCase() === viewerAddress?.toLowerCase() ? ' (you)' : ''}
              </span>
              <span className="tabular-nums" style={{ color: 'var(--muted)' }}>
                {(Number(agreement.sharesBps[i]) / 100).toFixed(2)}% = {formatUsdc(agreement.amount * agreement.sharesBps[i] / 10000n)} USDC
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Deadline */}
      <div className="flex items-center gap-1.5 text-xs" style={{ color: deadlinePassed ? 'var(--success)' : 'var(--subtle)' }}>
        <CheckCircle className="size-3" />
        <span>Release: {formatTimestamp(agreement.releaseTime)} — {formatCountdown(agreement.releaseTime)}</span>
      </div>

      {/* TX receipt */}
      {isSuccess && txHash && (
        <a href={buildTxUrl(txHash)} target="_blank" rel="noreferrer"
          className="flex items-center gap-1 text-xs" style={{ color: 'var(--success)' }}>
          Transaction confirmed <ExternalLink className="size-3" />
        </a>
      )}

      {/* Action buttons */}
      {status === 0 && ( /* Funded */
        <div className="flex flex-wrap gap-2">
          {/* Creator: early release */}
          {isCreator && (
            <ActionBtn label="Release Now" color="var(--success)" isPending={isPending} confirming={confirming}
              onClick={() => tx('approveRelease', [agreement.id])} />
          )}
          {/* Creator: refund (before deadline) */}
          {isCreator && !deadlinePassed && (
            <ActionBtn label="Refund" color="var(--muted)" isPending={isPending} confirming={confirming}
              onClick={() => tx('refund', [agreement.id])} />
          )}
          {/* Anyone: trigger after deadline */}
          {deadlinePassed && (
            <ActionBtn label="Trigger Release" color="var(--accent)" isPending={isPending} confirming={confirming}
              onClick={() => tx('releaseAfterDeadline', [agreement.id])} />
          )}
          {/* Recipient or creator: raise dispute — only available before releaseTime */}
          {(isRecipient || isCreator) && hasArbiter && !deadlinePassed && (
            <ActionBtn label="Raise Dispute" color="var(--danger)" isPending={isPending} confirming={confirming}
              onClick={() => tx('raiseDispute', [agreement.id])} />
          )}
        </div>
      )}

      {status === 3 && ( /* Disputed */
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-1 text-xs w-full" style={{ color: 'var(--danger)' }}>
            <AlertTriangle className="size-3" /> Disputed — awaiting arbiter
          </div>
          {/* Arbiter: resolve */}
          {isArbiter && (
            <>
              <ActionBtn label="Resolve → Recipients" color="var(--success)" isPending={isPending} confirming={confirming}
                onClick={() => tx('resolveDispute', [agreement.id, true])} />
              <ActionBtn label="Resolve → Creator" color="var(--muted)" isPending={isPending} confirming={confirming}
                onClick={() => tx('resolveDispute', [agreement.id, false])} />
            </>
          )}
          {/* Escape hatch after dispute timeout */}
          {disputeTimeoutPassed && (
            <ActionBtn label="Force Release (Timeout)" color="var(--accent)" isPending={isPending} confirming={confirming}
              onClick={() => tx('releaseAfterDeadline', [agreement.id])} />
          )}
        </div>
      )}
    </div>
  )
}

function ActionBtn({
  label, color, isPending, confirming, onClick,
}: {
  label: string; color: string; isPending: boolean; confirming: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={isPending || confirming}
      className="rounded-xl px-3 py-2 text-xs font-semibold flex items-center gap-1.5 transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
      style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}
    >
      {(isPending || confirming) && <Loader2 className="size-3 animate-spin" />}
      {label}
    </button>
  )
}
