import { formatUnits, parseUnits, decodeErrorResult } from 'viem'
import { PARLAY_ABI, USDC_DECIMALS } from './parlay-contract'

// ─── Decimal helpers ───────────────────────────────────────────────────────

export function formatUsdc(raw: bigint | undefined, decimals = 2): string {
  if (raw === undefined) return '—'
  return parseFloat(formatUnits(raw, USDC_DECIMALS)).toFixed(decimals)
}

export function parseUsdc(value: string): bigint {
  if (!value || value === '.' || isNaN(parseFloat(value))) return 0n
  return parseUnits(value, USDC_DECIMALS)
}

// ─── Agreement status ──────────────────────────────────────────────────────

export const STATUS_LABELS: Record<number, string> = {
  0: 'Funded',
  1: 'Released',
  2: 'Refunded',
  3: 'Disputed',
  4: 'Resolved',
}

export const STATUS_COLORS: Record<number, string> = {
  0: '#1a8047',   // green  — active / funded
  1: '#1061a6',   // blue   — completed
  2: '#6b6580',   // muted  — refunded
  3: '#ba2b4c',   // red    — disputed
  4: '#334155',   // ink-2  — resolved
}

// ─── Countdown ────────────────────────────────────────────────────────────

export function formatCountdown(releaseTime: bigint): string {
  const now = BigInt(Math.floor(Date.now() / 1000))
  const diff = releaseTime - now
  if (diff <= 0n) return 'Deadline passed'
  const s = Number(diff)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}d ${h}h remaining`
  if (h > 0) return `${h}h ${m}m remaining`
  return `${m}m remaining`
}

export function formatTimestamp(ts: bigint): string {
  return new Date(Number(ts) * 1000).toLocaleString()
}

// ─── Share validation ─────────────────────────────────────────────────────

export function bpsFromPercent(pct: string): number {
  return Math.round(parseFloat(pct) * 100)
}

export function totalBps(percents: string[]): number {
  return percents.reduce((s, p) => s + bpsFromPercent(p), 0)
}

// ─── Error decoding ──────────────────────────────────────────────────────

const CUSTOM_ERROR_MESSAGES: Record<string, string> = {
  ZeroAddress: 'Address cannot be zero.',
  ZeroAmount: 'Amount must be greater than zero.',
  InvalidShares: 'Recipient shares must sum to exactly 100%.',
  TooManyRecipients: 'Between 1 and 10 recipients required.',
  DuplicateRecipient: 'Duplicate or conflicting address in recipients/arbiter.',
  CreatorIsRecipient: 'Creator cannot be a recipient.',
  AmountExceedsMax: 'Amount exceeds the current maximum agreement cap.',
  ReleaseTimeNotFuture: 'Release time must be in the future.',
  NotCreator: 'Only the agreement creator can do this.',
  NotArbiter: 'Only the agreement arbiter can do this.',
  NotGuardian: 'Only the guardian can do this.',
  NotRecipientOrCreator: 'Only a recipient or the creator can raise a dispute.',
  NoArbiterSet: 'This agreement has no arbiter — disputes are not supported.',
  AgreementNotFunded: 'Agreement is not in a Funded (or Disputed) state.',
  AlreadyPastReleaseTime: 'The release deadline has passed — refunds are no longer allowed.',
  ReleaseTimeNotReached: 'The release deadline has not been reached yet.',
  DisputeAlreadyOpen: 'A dispute is already open for this agreement.',
  DisputeAfterDeadline: 'Disputes can only be raised before the release deadline.',
  DisputeTimeoutNotReached: 'The dispute timeout (releaseTime + 30 days) has not passed yet.',
  NothingToClaim: 'No claimable balance for this address.',
  ContractPaused: 'New agreements are paused. Existing agreements still function normally.',
  CannotRescueUSDC: 'Cannot rescue USDC from this contract.',
  OwnershipCannotBeRenounced: 'Ownership cannot be renounced.',
}

export function decodeContractError(error: unknown): string {
  const msg = (error as Error)?.message ?? ''

  // User rejected
  if (msg.toLowerCase().includes('user rejected') || (error as {code?: number})?.code === 4001) {
    return ''  // silent — user cancelled
  }

  // Rate limit: -32005 or HTTP 429
  if (msg.includes('-32005') || msg.includes('rate limit') || msg.toLowerCase().includes('429')) {
    return 'The network is busy. Wait a minute and try again.'
  }

  // Try to extract custom error name from message
  for (const [name, label] of Object.entries(CUSTOM_ERROR_MESSAGES)) {
    if (msg.includes(name)) return label
  }

  // Try viem decodeErrorResult
  try {
    const dataMatch = msg.match(/data['":\s]+"(0x[0-9a-fA-F]+)"/)
    if (dataMatch) {
      const decoded = decodeErrorResult({ abi: PARLAY_ABI, data: dataMatch[1] as `0x${string}` })
      const label = CUSTOM_ERROR_MESSAGES[decoded.errorName]
      if (label) return label
    }
  } catch { /* fall through */ }

  if (msg.includes('insufficient funds') || msg.includes('exceeds balance')) {
    return 'Insufficient USDC balance or allowance.'
  }
  if (msg.includes('reverted')) {
    return 'Transaction reverted. Please check inputs and try again.'
  }
  if (msg.includes('network') || msg.includes('timeout')) {
    return 'Network error. Please check your connection and try again.'
  }

  return 'Something went wrong. Please try again.'
}

// ─── Address utils ────────────────────────────────────────────────────────

export function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}
