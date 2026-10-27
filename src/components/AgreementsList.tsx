import { useState } from 'react'
import { useAccount, useReadContract, useReadContracts } from 'wagmi'
import { RefreshCw } from 'lucide-react'
import { PARLAY_ABI, PARLAY_ADDRESS, ACTIVE_CHAIN_ID } from '../lib/parlay-contract'
import { AgreementCard } from './AgreementCard'
import { READ_QUERY } from '../lib/query-config'

type Tab = 'created' | 'recipient' | 'arbiter'

export interface AgreementData {
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

export function AgreementsList({ refreshKey: _refreshKey }: { refreshKey: number }) {
  const { address } = useAccount()
  const [tab, setTab] = useState<Tab>('created')

  const { data: agreementIds, refetch, isFetching } = useReadContract({
    address: PARLAY_ADDRESS,
    abi: PARLAY_ABI,
    functionName: 'getUserAgreements',
    args: address ? [address] : undefined,
    chainId: ACTIVE_CHAIN_ID,
    query: { enabled: !!address, ...READ_QUERY },
  }) as { data: readonly bigint[] | undefined; refetch: () => Promise<unknown>; isFetching: boolean }

  const ids: readonly bigint[] = agreementIds ?? []

  const agreementReads = ids.map((id) => ({
    address: PARLAY_ADDRESS,
    abi: PARLAY_ABI,
    functionName: 'getAgreement' as const,
    args: [id] as const,
    chainId: ACTIVE_CHAIN_ID,
  }))

  type ContractRead = { status: string; result: unknown }
  // oxlint-disable-next-line typescript/no-unsafe-assignment -- wagmi generic batch read; typed below
  const batchResult = useReadContracts({
    contracts: agreementReads,
    query: {
      enabled: ids.length > 0,
      ...READ_QUERY,
    },
  })
  // oxlint-disable-next-line typescript/no-unsafe-member-access typescript/no-unsafe-assignment
  const agreementsRaw: ContractRead[] = (batchResult.data as ContractRead[] | undefined) ?? []

  const agreements: AgreementData[] = agreementsRaw
    .map((r) => (r.status === 'success' ? (r.result as AgreementData) : null))
    .filter((x): x is AgreementData => x !== null)

  const ZERO_ADDR = '0x0000000000000000000000000000000000000000'

  const filtered = agreements.filter(ag => {
    if (!address) return false
    const addr = address.toLowerCase()
    if (tab === 'created') return ag.creator.toLowerCase() === addr
    if (tab === 'recipient') return ag.recipients.some(r => r.toLowerCase() === addr)
    if (tab === 'arbiter') return ag.arbiter.toLowerCase() === addr && ag.arbiter !== ZERO_ADDR
    return false
  })

  const tabs: { id: Tab; label: string }[] = [
    { id: 'created', label: 'Created by me' },
    { id: 'recipient', label: "I'm a recipient" },
    { id: 'arbiter', label: "I'm arbiter" },
  ]

  return (
    <div>
      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-4">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
            style={{
              background: tab === t.id ? 'var(--surface-strong)' : 'transparent',
              color: tab === t.id ? 'var(--ink)' : 'var(--subtle)',
              border: tab === t.id ? '1px solid var(--border-strong)' : '1px solid transparent',
            }}
          >
            {t.label}
          </button>
        ))}
        <button
          onClick={() => void refetch()}
          disabled={isFetching}
          className="ml-auto p-2 rounded-xl transition-all hover:opacity-70 disabled:opacity-40"
          style={{ color: 'var(--subtle)' }}
          title="Refresh"
        >
          <RefreshCw className={`size-4 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* List */}
      {!address ? (
        <p className="text-sm text-center py-8" style={{ color: 'var(--subtle)' }}>Connect your wallet to see agreements.</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-center py-8" style={{ color: 'var(--subtle)' }}>No agreements found in this tab.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(ag => (
            <AgreementCard
              key={ag.id.toString()}
              agreement={ag}
              viewerAddress={address}
              onAction={() => void refetch()}
            />
          ))}
        </div>
      )}
    </div>
  )
}
