import { useAccount, useSwitchChain } from 'wagmi'
import { ACTIVE_CHAIN_ID, USE_MAINNET } from '../lib/parlay-contract'

const CHAIN_NAME = USE_MAINNET ? 'Arc Mainnet' : 'Arc Testnet'

export function ChainGuard({ children }: { children: React.ReactNode }) {
  const { isConnected, chainId } = useAccount()
  const { switchChain, isPending } = useSwitchChain()

  if (!isConnected || chainId === ACTIVE_CHAIN_ID) return <>{children}</>

  return (
    <div
      className="w-full rounded-2xl p-5 flex flex-col gap-3"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
        Wrong network
      </p>
      <p className="text-xs" style={{ color: 'var(--muted)' }}>
        Parlay runs on {CHAIN_NAME}. Please switch to continue.
      </p>
      <button
        onClick={() => switchChain({ chainId: ACTIVE_CHAIN_ID })}
        disabled={isPending}
        className="w-full rounded-xl py-2.5 text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50"
        style={{ background: 'var(--accent)', color: '#0d1b2f' }}
      >
        {isPending ? 'Switching…' : `Switch to ${CHAIN_NAME}`}
      </button>
    </div>
  )
}
