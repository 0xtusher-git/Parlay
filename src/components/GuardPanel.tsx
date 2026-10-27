import { useReadContracts } from 'wagmi'
import { ShieldCheck, ShieldAlert, Activity, RefreshCw } from 'lucide-react'
import { PARLAY_ABI, PARLAY_ADDRESS, ACTIVE_CHAIN_ID, buildAddressUrl } from '../lib/parlay-contract'
import { formatUsdc } from '../lib/parlay-utils'
import { READ_QUERY } from '../lib/query-config'

// Batch all three Guard reads into a single multicall instead of 3 separate eth_call requests.
const GUARD_CONTRACTS = [
  {
    address: PARLAY_ADDRESS,
    abi: PARLAY_ABI,
    functionName: 'healthReport' as const,
    chainId: ACTIVE_CHAIN_ID,
  },
  {
    address: PARLAY_ADDRESS,
    abi: PARLAY_ABI,
    functionName: 'solvencyCheck' as const,
    chainId: ACTIVE_CHAIN_ID,
  },
  {
    address: PARLAY_ADDRESS,
    abi: PARLAY_ABI,
    functionName: 'maxAgreementAmount' as const,
    chainId: ACTIVE_CHAIN_ID,
  },
] as const

export function GuardPanel() {
  const { data, refetch, isFetching } = useReadContracts({
    contracts: GUARD_CONTRACTS,
    query: READ_QUERY,
  })

  const health = data?.[0]?.status === 'success'
    ? data[0].result as [bigint, bigint, bigint, bigint, boolean]
    : undefined

  const solvency = data?.[1]?.status === 'success'
    ? data[1].result as [bigint, bigint, bigint, boolean]
    : undefined

  const maxAmount = data?.[2]?.status === 'success'
    ? data[2].result as bigint
    : undefined

  const isPaused = health ? health[4] : false
  const isSolvent = solvency ? solvency[3] : true

  const rows: { label: string; value: string }[] = [
    { label: 'Status', value: isPaused ? 'Paused' : 'Active' },
    { label: 'Solvency', value: isSolvent ? 'Solvent' : 'INSOLVENT' },
    { label: 'Contract balance', value: solvency ? `${formatUsdc(solvency[0])} USDC` : '—' },
    { label: 'Total locked', value: solvency ? `${formatUsdc(solvency[1])} USDC` : '—' },
    { label: 'Total claimable', value: solvency ? `${formatUsdc(solvency[2])} USDC` : '—' },
    { label: 'Open agreements', value: health ? health[3].toString() : '—' },
    { label: 'Max agreement cap', value: maxAmount !== undefined ? `${formatUsdc(maxAmount)} USDC` : '—' },
  ]

  return (
    <div className="rounded-2xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 mb-4">
        {isPaused ? (
          <ShieldAlert className="size-4" style={{ color: 'var(--danger)' }} />
        ) : isSolvent ? (
          <ShieldCheck className="size-4" style={{ color: 'var(--success)' }} />
        ) : (
          <ShieldAlert className="size-4" style={{ color: 'var(--danger)' }} />
        )}
        <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Protocol Health</span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => void refetch()}
            disabled={isFetching}
            className="p-1.5 rounded-lg transition-all hover:opacity-70 disabled:opacity-40"
            style={{ color: 'var(--subtle)' }}
            title="Refresh guard panel"
          >
            <RefreshCw className={`size-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
          <a
            href={buildAddressUrl(PARLAY_ADDRESS)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-xs"
            style={{ color: 'var(--subtle)' }}
          >
            <Activity className="size-3" /> Explorer
          </a>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {rows.map(r => (
          <div key={r.label} className="flex justify-between text-xs">
            <span style={{ color: 'var(--muted)' }}>{r.label}</span>
            <span
              className="tabular-nums font-semibold"
              style={{
                color: r.label === 'Status' && isPaused ? 'var(--danger)'
                  : r.label === 'Solvency' && !isSolvent ? 'var(--danger)'
                  : r.label === 'Solvency' ? 'var(--success)'
                  : 'var(--ink-2)',
              }}
            >
              {r.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
