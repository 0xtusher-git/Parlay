import { useState } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { erc20Abi } from 'viem'
import { Plus, Trash2, ExternalLink, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { toast } from 'sonner'
import {
  PARLAY_ABI, PARLAY_ADDRESS, USDC_ADDRESS, ACTIVE_CHAIN_ID, buildTxUrl,
} from '../lib/parlay-contract'
import { parseUsdc, bpsFromPercent, totalBps, decodeContractError, formatUsdc } from '../lib/parlay-utils'
import { READ_QUERY } from '../lib/query-config'

interface RecipientRow {
  address: string
  percent: string
}

const INITIAL_ROWS: RecipientRow[] = [
  { address: '', percent: '100' },
]

export function CreateAgreement({ onCreated }: { onCreated?: () => void }) {
  const { address } = useAccount()
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<RecipientRow[]>(INITIAL_ROWS)
  const [amount, setAmount] = useState('')
  const [releaseDate, setReleaseDate] = useState('')
  const [arbiter, setArbiter] = useState('')
  const [step, setStep] = useState<'idle' | 'approving' | 'approved' | 'creating' | 'done'>('idle')

  // Read current allowance — only when the form is open; stale for 30 s.
  // NOT re-read on every keystroke; only when the component first opens
  // and once after a confirmed approval.
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address ? [address, PARLAY_ADDRESS] : undefined,
    chainId: ACTIVE_CHAIN_ID,
    query: {
      enabled: !!address && open, // don't fetch while form is collapsed
      ...READ_QUERY,
    },
  })

  // Approve — 4 s receipt poll for snappy UX
  const { writeContract: approve, data: approveHash, isPending: approvePending } = useWriteContract()
  const { isLoading: approveConfirming, isSuccess: approveSuccess } = useWaitForTransactionReceipt({
    hash: approveHash,
    pollingInterval: 4_000,
  })

  // Create — 4 s receipt poll
  const { writeContract: create, data: createHash, isPending: createPending } = useWriteContract()
  const { isLoading: createConfirming } = useWaitForTransactionReceipt({
    hash: createHash,
    pollingInterval: 4_000,
  })

  const parsedAmount = parseUsdc(amount)
  const bpsArr = rows.map(r => bpsFromPercent(r.percent))
  const bpsTotal = totalBps(rows.map(r => r.percent))
  const sharesOk = bpsTotal === 10_000
  const alreadyApproved = allowance !== undefined && allowance >= parsedAmount && parsedAmount > 0n

  function addRow() {
    setRows(r => [...r, { address: '', percent: '0' }])
  }

  function removeRow(i: number) {
    setRows(r => r.filter((_, idx) => idx !== i))
  }

  function updateRow(i: number, field: keyof RecipientRow, val: string) {
    setRows(r => r.map((row, idx) => idx === i ? { ...row, [field]: val } : row))
  }

  function handleError(e: Error) {
    // Decode contract-level revert strings first.
    const contractMsg = decodeContractError(e)
    if (contractMsg) { toast.error(contractMsg); return }

    // Surface rate-limit errors as a human-readable message.
    const raw = e.message ?? ''
    if (raw.includes('-32005') || raw.includes('rate limit') || raw.toLowerCase().includes('429')) {
      toast.error('The network is busy. Wait a minute and try again.')
      return
    }
    // Generic fallback — show first 120 chars of the message without JSON noise.
    const clean = raw.replace(/\{.*\}/s, '').trim().slice(0, 120)
    if (clean) toast.error(clean)
  }

  function handleApprove() {
    if (!parsedAmount) return
    setStep('approving')
    approve(
      {
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: 'approve',
        args: [PARLAY_ADDRESS, parsedAmount],
        chainId: ACTIVE_CHAIN_ID,
      },
      {
        onSuccess: () => { void refetchAllowance(); setStep('approved') },
        onError: (e) => { handleError(e); setStep('idle') },
      }
    )
  }

  function handleCreate() {
    const releaseTs = releaseDate ? BigInt(Math.floor(new Date(releaseDate).getTime() / 1000)) : 0n
    const recipients = rows.map(r => r.address as `0x${string}`)
    const shares = bpsArr.map(BigInt)
    const arbiterAddr = arbiter.trim() === ''
      ? '0x0000000000000000000000000000000000000000' as `0x${string}`
      : arbiter as `0x${string}`

    setStep('creating')
    create(
      {
        address: PARLAY_ADDRESS,
        abi: PARLAY_ABI,
        functionName: 'createAgreement',
        args: [recipients, shares, parsedAmount, releaseTs, arbiterAddr],
        chainId: ACTIVE_CHAIN_ID,
      },
      {
        onSuccess: () => { setStep('done'); onCreated?.() },
        onError: (e) => { handleError(e); setStep('idle') },
      }
    )
  }

  // Buttons are disabled during ANY in-flight request to prevent double-submit.
  const anyInFlight = approvePending || approveConfirming || createPending || createConfirming
  const canApprove = parsedAmount > 0n && sharesOk && !alreadyApproved && step === 'idle' && !anyInFlight
  const canCreate  = parsedAmount > 0n && sharesOk && (alreadyApproved || step === 'approved' || approveSuccess) && !anyInFlight && step !== 'done'

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-sm font-semibold"
        style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }}
      >
        <span>New Agreement</span>
        {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
      </button>

      {open && (
        <div className="p-5 flex flex-col gap-4" style={{ background: 'var(--surface)' }}>
          {/* Recipients */}
          <div>
            <label className="block text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
              Recipients
            </label>
            <div className="flex flex-col gap-2">
              {rows.map((row, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    type="text"
                    placeholder="0x…"
                    value={row.address}
                    onChange={e => updateRow(i, 'address', e.target.value)}
                    className="flex-1 rounded-xl px-3 py-2 text-sm mono outline-none"
                    style={{ background: 'var(--surface-muted)', color: 'var(--ink)', border: '1px solid var(--border)' }}
                  />
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      placeholder="0"
                      value={row.percent}
                      onChange={e => updateRow(i, 'percent', e.target.value)}
                      className="w-20 rounded-xl px-3 py-2 text-sm tabular-nums text-right outline-none"
                      style={{ background: 'var(--surface-muted)', color: 'var(--ink)', border: '1px solid var(--border)' }}
                    />
                    <span className="text-xs" style={{ color: 'var(--subtle)' }}>%</span>
                  </div>
                  {rows.length > 1 && (
                    <button onClick={() => removeRow(i)} className="p-1 rounded-lg hover:opacity-70">
                      <Trash2 className="size-4" style={{ color: 'var(--danger)' }} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mt-2">
              <button
                onClick={addRow}
                disabled={rows.length >= 10}
                className="flex items-center gap-1 text-xs font-medium disabled:opacity-40"
                style={{ color: 'var(--accent)' }}
              >
                <Plus className="size-3" /> Add recipient
              </button>
              <span className={`text-xs tabular-nums font-semibold ${!sharesOk && bpsTotal > 0 ? 'text-red-400' : ''}`}
                style={{ color: sharesOk ? 'var(--success)' : bpsTotal > 0 ? undefined : 'var(--subtle)' }}>
                {(bpsTotal / 100).toFixed(2)}% {sharesOk ? '✓' : `/ 100%`}
              </span>
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Amount (USDC)</label>
            <div className="relative">
              <input
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={e => {
                  const v = e.target.value.replace(/[^0-9.]/g, '')
                  if (v === '' || /^\d*\.?\d*$/.test(v)) setAmount(v)
                }}
                className="w-full rounded-xl px-4 py-3 text-xl font-bold tabular-nums outline-none"
                style={{ background: 'var(--surface-muted)', color: 'var(--ink)', border: '1px solid var(--border)' }}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium" style={{ color: 'var(--subtle)' }}>USDC</span>
            </div>
          </div>

          {/* Release time */}
          <div>
            <label className="block text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Release Date & Time</label>
            <input
              type="datetime-local"
              value={releaseDate}
              onChange={e => setReleaseDate(e.target.value)}
              className="w-full rounded-xl px-4 py-3 text-sm outline-none"
              style={{ background: 'var(--surface-muted)', color: 'var(--ink)', border: '1px solid var(--border)', colorScheme: 'dark' }}
            />
          </div>

          {/* Arbiter (optional) */}
          <div>
            <label className="block text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
              Arbiter <span className="normal-case font-normal">(optional — enables disputes)</span>
            </label>
            <input
              type="text"
              placeholder="0x… or leave blank"
              value={arbiter}
              onChange={e => setArbiter(e.target.value)}
              className="w-full rounded-xl px-4 py-3 text-sm mono outline-none"
              style={{ background: 'var(--surface-muted)', color: 'var(--ink)', border: '1px solid var(--border)' }}
            />
          </div>

          {/* Allowance info */}
          {parsedAmount > 0n && allowance !== undefined && (
            <p className="text-xs" style={{ color: 'var(--subtle)' }}>
              Current allowance: {formatUsdc(allowance)} USDC
              {alreadyApproved ? ' ✓ (sufficient)' : ' — approve required'}
            </p>
          )}

          {/* Step 1: Approve */}
          {!alreadyApproved && (
            <button
              onClick={handleApprove}
              disabled={!canApprove}
              className="w-full rounded-xl py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'var(--surface-muted)', color: 'var(--ink)', border: '1px solid var(--border-strong)' }}
            >
              {approvePending ? <><Loader2 className="size-4 animate-spin" /> Confirm in wallet…</>
                : approveConfirming ? <><Loader2 className="size-4 animate-spin" /> Approving USDC…</>
                : 'Step 1 — Approve USDC'}
            </button>
          )}
          {approveHash && !alreadyApproved && (
            <a href={buildTxUrl(approveHash)} target="_blank" rel="noreferrer"
              className="flex items-center gap-1 text-xs" style={{ color: 'var(--accent)' }}>
              Approval tx <ExternalLink className="size-3" />
            </a>
          )}

          {/* Step 2: Create */}
          <button
            onClick={handleCreate}
            disabled={!canCreate}
            className="w-full rounded-xl py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'var(--accent)', color: '#0d1b2f' }}
          >
            {createPending ? <><Loader2 className="size-4 animate-spin" /> Confirm in wallet…</>
              : createConfirming ? <><Loader2 className="size-4 animate-spin" /> Creating agreement…</>
              : step === 'done' ? 'Agreement created!'
              : alreadyApproved ? 'Create Agreement' : 'Step 2 — Create Agreement'}
          </button>
          {createHash && (
            <a href={buildTxUrl(createHash)} target="_blank" rel="noreferrer"
              className="flex items-center gap-1 text-xs" style={{ color: 'var(--success)' }}>
              Agreement tx <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      )}
    </div>
  )
}
