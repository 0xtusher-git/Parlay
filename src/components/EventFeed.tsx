import { useEffect, useRef, useState } from 'react'
import { ExternalLink, RefreshCw } from 'lucide-react'
import { createPublicClient, http, parseAbiItem } from 'viem'
import { arcTestnet, arc } from 'viem/chains'
import { PARLAY_ADDRESS, ACTIVE_CHAIN_ID, ARC_MAINNET_CHAIN_ID, buildTxUrl } from '../lib/parlay-contract'
import { formatUsdc, shortAddr } from '../lib/parlay-utils'

// ---------------------------------------------------------------------------
// EventFeed polls eth_getLogs once on mount and once every 60 s.
// It is NOT a real-time watcher (no WebSocket subscription required).
// Each poll fetches only the last LOOKBACK_BLOCKS blocks — bounded range,
// no full-history scan.
//
// Why manual polling instead of useWatchContractEvent × 5:
//   - useWatchContractEvent with no pollingInterval inherits the wagmi global
//     (30 s), but 5 watchers = 5 × 30 s poll calls = 10/min just for events.
//   - One getLogs call every 60 s = 1/min and fetches all event types at once.
// ---------------------------------------------------------------------------

const LOOKBACK_BLOCKS = 2_000n   // ~5-10 min of Arc blocks at ~3s/block
const POLL_MS = 60_000           // 60 s idle poll

// Use the viem chain that matches the active chain.
const CHAIN = ACTIVE_CHAIN_ID === ARC_MAINNET_CHAIN_ID ? arc : arcTestnet

// A minimal public client just for getLogs — avoids wagmi overhead.
const logClient = createPublicClient({
  chain: CHAIN,
  transport: http(
    CHAIN.rpcUrls.default.http[0],
    { retryCount: 3, retryDelay: 1000 }
  ),
})

// All Parlay event signatures we care about.
const EVENT_ABIS = [
  parseAbiItem('event AgreementCreated(uint256 indexed id, address indexed creator, address arbiter, uint256 amount, uint256 releaseTime)'),
  parseAbiItem('event Released(uint256 indexed id, address indexed triggeredBy)'),
  parseAbiItem('event Refunded(uint256 indexed id, address indexed creator)'),
  parseAbiItem('event DisputeRaised(uint256 indexed id, address indexed raisedBy)'),
  parseAbiItem('event Claimed(address indexed claimant, uint256 amount)'),
] as const

interface FeedEvent {
  type: string
  summary: string
  hash?: string
  ts: number
}

function summarise(log: { eventName?: string; args?: Record<string, unknown>; transactionHash?: string | null }): FeedEvent | null {
  const args = log.args ?? {}
  switch (log.eventName) {
    case 'AgreementCreated': {
      const id = args['id'] as bigint | undefined
      const creator = args['creator'] as string | undefined
      const amount = args['amount'] as bigint | undefined
      return { type: 'Created', summary: `#${id} by ${creator ? shortAddr(creator) : '?'} · ${amount ? formatUsdc(amount) : '?'} USDC`, hash: log.transactionHash ?? undefined, ts: Date.now() }
    }
    case 'Released': {
      const id = args['id'] as bigint | undefined
      const by = args['triggeredBy'] as string | undefined
      return { type: 'Released', summary: `#${id} by ${by ? shortAddr(by) : '?'}`, hash: log.transactionHash ?? undefined, ts: Date.now() }
    }
    case 'Refunded': {
      const id = args['id'] as bigint | undefined
      const creator = args['creator'] as string | undefined
      return { type: 'Refunded', summary: `#${id} to ${creator ? shortAddr(creator) : '?'}`, hash: log.transactionHash ?? undefined, ts: Date.now() }
    }
    case 'DisputeRaised': {
      const id = args['id'] as bigint | undefined
      const by = args['raisedBy'] as string | undefined
      return { type: 'Disputed', summary: `#${id} by ${by ? shortAddr(by) : '?'}`, hash: log.transactionHash ?? undefined, ts: Date.now() }
    }
    case 'Claimed': {
      const claimant = args['claimant'] as string | undefined
      const amount = args['amount'] as bigint | undefined
      return { type: 'Claimed', summary: `${claimant ? shortAddr(claimant) : '?'} · ${amount ? formatUsdc(amount) : '?'} USDC`, hash: log.transactionHash ?? undefined, ts: Date.now() }
    }
    default:
      return null
  }
}

export function EventFeed({ pollTrigger }: { pollTrigger?: number }) {
  const [events, setEvents] = useState<FeedEvent[]>([])
  const [fetching, setFetching] = useState(false)
  const lastBlockRef = useRef<bigint | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function fetchLogs(force = false) {
    // Don't hammer if already in flight.
    if (fetching && !force) return
    // Don't poll while the tab is hidden — stops ALL RPC traffic when backgrounded.
    if (document.hidden) return

    setFetching(true)
    try {
      const head = await logClient.getBlockNumber()
      const fromBlock = lastBlockRef.current != null
        ? lastBlockRef.current + 1n
        : head - LOOKBACK_BLOCKS > 0n ? head - LOOKBACK_BLOCKS : 0n

      // Nothing new yet.
      if (fromBlock > head) { setFetching(false); return }

      // Fetch all event types in one getLogs call per ABI (arc getLogs range limit: 10,000 blocks).
      const newEvents: FeedEvent[] = []
      for (const abi of EVENT_ABIS) {
        const logs = await logClient.getLogs({
          address: PARLAY_ADDRESS,
          event: abi,
          fromBlock,
          toBlock: head,
        })
        for (const log of logs) {
          const ev = summarise(log)
          if (ev) newEvents.push(ev)
        }
      }

      lastBlockRef.current = head

      if (newEvents.length > 0) {
        setEvents(prev =>
          [...newEvents.sort((a, b) => b.ts - a.ts), ...prev].slice(0, 30)
        )
      }
    } catch {
      // Silently ignore rate-limit errors in the background feed —
      // the next scheduled poll will retry.
    } finally {
      setFetching(false)
    }
  }

  // Schedule the next poll (cleared and reset on every successful call).
  function schedulePoll() {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      void fetchLogs()
      schedulePoll()
    }, POLL_MS)
  }

  // Initial load + start poll loop.
  useEffect(() => {
    void fetchLogs()
    schedulePoll()
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-poll immediately when a transaction is confirmed (pollTrigger increments).
  useEffect(() => {
    if (pollTrigger == null || pollTrigger === 0) return
    void fetchLogs(true)
    schedulePoll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollTrigger])

  const TYPE_COLORS: Record<string, string> = {
    Created: 'var(--accent)',
    Released: 'var(--success)',
    Refunded: 'var(--muted)',
    Disputed: 'var(--danger)',
    Claimed: 'var(--success)',
  }

  return (
    <div className="rounded-2xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 mb-3">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Live Activity</p>
        <button
          onClick={() => { void fetchLogs(true); schedulePoll() }}
          disabled={fetching}
          className="ml-auto p-1.5 rounded-lg transition-all hover:opacity-70 disabled:opacity-40"
          style={{ color: 'var(--subtle)' }}
          title="Refresh activity feed"
        >
          <RefreshCw className={`size-3.5 ${fetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {events.length === 0 ? (
        <p className="text-xs py-4 text-center" style={{ color: 'var(--subtle)' }}>
          {fetching ? 'Loading activity…' : 'Events will appear here as they occur on chain.'}
        </p>
      ) : (
        <div className="flex flex-col gap-2 max-h-52 overflow-y-auto">
          {events.map((ev, i) => (
            <div key={i} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="rounded-full px-1.5 py-0.5 text-xs font-semibold shrink-0"
                  style={{ background: `${TYPE_COLORS[ev.type] ?? 'var(--muted)'}22`, color: TYPE_COLORS[ev.type] ?? 'var(--muted)' }}
                >
                  {ev.type}
                </span>
                <span className="text-xs truncate" style={{ color: 'var(--ink-2)' }}>{ev.summary}</span>
              </div>
              {ev.hash && (
                <a href={buildTxUrl(ev.hash)} target="_blank" rel="noreferrer"
                  className="shrink-0" style={{ color: 'var(--subtle)' }}>
                  <ExternalLink className="size-3" />
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
