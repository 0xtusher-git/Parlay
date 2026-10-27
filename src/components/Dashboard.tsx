import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { erc20Abi } from 'viem'
import { ExternalLink, Wallet, CheckCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { PARLAY_ABI, PARLAY_ADDRESS, USDC_ADDRESS, ACTIVE_CHAIN_ID, buildTxUrl } from '../lib/parlay-contract'
import { formatUsdc, decodeContractError } from '../lib/parlay-utils'
import { formatUnits } from 'viem'
import { useBalance } from 'wagmi'
import { BALANCE_QUERY } from '../lib/query-config'

export function Dashboard({ onClaimed }: { onClaimed?: () => void }) {
  const { address } = useAccount()

  const { data: usdcBalance, refetch: refetchUsdc } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: ACTIVE_CHAIN_ID,
    query: { enabled: !!address, ...BALANCE_QUERY },
  })

  const { data: gasBalance } = useBalance({
    address,
    chainId: ACTIVE_CHAIN_ID,
    query: { enabled: !!address, ...BALANCE_QUERY },
  })

  const { data: claimableBalance, refetch: refetchClaimable } = useReadContract({
    address: PARLAY_ADDRESS,
    abi: PARLAY_ABI,
    functionName: 'claimable',
    args: address ? [address] : undefined,
    chainId: ACTIVE_CHAIN_ID,
    query: { enabled: !!address, ...BALANCE_QUERY },
  }) as { data: bigint | undefined; refetch: () => Promise<unknown> }

  const { writeContract: claim, data: claimHash, isPending: claimPending } = useWriteContract()
  // Use a faster poll interval for receipt confirmation only — 4 s instead of global 30 s.
  const { isLoading: claimConfirming, isSuccess: claimSuccess } = useWaitForTransactionReceipt({
    hash: claimHash,
    pollingInterval: 4_000,
  })

  function handleClaim() {
    claim(
      { address: PARLAY_ADDRESS, abi: PARLAY_ABI, functionName: 'claim' },
      {
        onSuccess: () => {
          void refetchUsdc()
          void refetchClaimable()
          onClaimed?.()
        },
        onError: (e) => {
          const msg = decodeContractError(e)
          if (msg) toast.error(msg)
        },
      }
    )
  }

  const hasClaim = claimableBalance != null && claimableBalance > 0n

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {/* USDC balance */}
      <div className="rounded-2xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center gap-1.5 mb-2">
          <Wallet className="size-3.5" style={{ color: 'var(--muted)' }} />
          <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--muted)' }}>USDC Balance</span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="display text-3xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
            {usdcBalance !== undefined ? formatUsdc(usdcBalance) : '—'}
          </span>
          <span className="text-sm font-medium" style={{ color: 'var(--subtle)' }}>USDC</span>
        </div>
        <p className="text-xs mt-1" style={{ color: 'var(--subtle)' }}>ERC-20 · 6 decimals</p>
      </div>

      {/* Gas balance */}
      <div className="rounded-2xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center gap-1.5 mb-2">
          <Wallet className="size-3.5" style={{ color: 'var(--muted)' }} />
          <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--muted)' }}>Gas Balance</span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="display text-3xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
            {gasBalance ? parseFloat(formatUnits(gasBalance.value, 18)).toFixed(6) : '—'}
          </span>
          <span className="text-sm font-medium" style={{ color: 'var(--subtle)' }}>USDC</span>
        </div>
        <p className="text-xs mt-1" style={{ color: 'var(--subtle)' }}>Native · 18 decimals</p>
      </div>

      {/* Claimable */}
      <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <CheckCircle className="size-3.5" style={{ color: hasClaim ? 'var(--success)' : 'var(--muted)' }} />
            <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--muted)' }}>Claimable</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="display text-3xl font-bold tabular-nums" style={{ color: hasClaim ? 'var(--success)' : 'var(--ink)' }}>
              {claimableBalance != null ? formatUsdc(claimableBalance) : '—'}
            </span>
            <span className="text-sm font-medium" style={{ color: 'var(--subtle)' }}>USDC</span>
          </div>
        </div>
        {claimSuccess && claimHash && (
          <a href={buildTxUrl(claimHash)} target="_blank" rel="noreferrer"
            className="flex items-center gap-1 text-xs" style={{ color: 'var(--success)' }}>
            Claimed <ExternalLink className="size-3" />
          </a>
        )}
        <button
          onClick={handleClaim}
          disabled={!hasClaim || claimPending || claimConfirming}
          className="w-full rounded-xl py-2.5 text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          style={{ background: 'var(--accent)', color: '#0d1b2f' }}
        >
          {claimPending ? <><Loader2 className="size-4 animate-spin" /> Confirm…</>
            : claimConfirming ? <><Loader2 className="size-4 animate-spin" /> Claiming…</>
            : 'Claim USDC'}
        </button>
      </div>
    </div>
  )
}
