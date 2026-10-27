import { useAccount, useSwitchChain } from 'wagmi'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { ACTIVE_CHAIN_ID, ARC_MAINNET_CHAIN_ID } from '../lib/parlay-contract'
import { ADD_ARC_TESTNET_PARAMS, ADD_ARC_MAINNET_PARAMS } from '../config'

const CHAIN_NAME = ACTIVE_CHAIN_ID === ARC_MAINNET_CHAIN_ID ? 'Arc' : 'Arc Testnet'
const ADD_PARAMS = ACTIVE_CHAIN_ID === ARC_MAINNET_CHAIN_ID ? ADD_ARC_MAINNET_PARAMS : ADD_ARC_TESTNET_PARAMS

/** wallet_addEthereumChain via the raw EIP-3085 method. */
async function addChain(): Promise<void> {
  const provider = (window as { ethereum?: { request?: (args: { method: string; params: unknown[] }) => Promise<void> } }).ethereum
  if (provider?.request) {
    await provider.request({ method: 'wallet_addEthereumChain', params: [ADD_PARAMS] })
  }
}

export function NetworkBanner() {
  const { chainId, isConnected } = useAccount()
  const { switchChain, isPending } = useSwitchChain()

  if (!isConnected || chainId === ACTIVE_CHAIN_ID) return null

  async function handleAddAndSwitch() {
    try {
      // wallet_addEthereumChain adds the chain if missing, then switches to it.
      await addChain()
    } catch {
      // Chain already known in the wallet — just switch.
      switchChain({ chainId: ACTIVE_CHAIN_ID })
    }
  }

  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3 text-sm"
      style={{ background: '#92400e22', border: '1px solid #d9770688', color: '#fbbf24' }}
    >
      <AlertTriangle className="size-4 shrink-0" />
      <span className="flex-1">
        Wrong network. Parlay runs on <strong>{CHAIN_NAME}</strong>.
      </span>
      <button
        onClick={() => { void handleAddAndSwitch() }}
        disabled={isPending}
        className="rounded-xl px-4 py-1.5 text-xs font-semibold transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
        style={{ background: '#d97706', color: '#0d1b2f' }}
      >
        {isPending ? <><Loader2 className="size-3 animate-spin" /> Switching…</> : `Switch to ${CHAIN_NAME}`}
      </button>
      <button
        onClick={() => { void handleAddAndSwitch() }}
        disabled={isPending}
        className="rounded-xl px-4 py-1.5 text-xs font-semibold transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ background: 'transparent', color: '#fbbf24', border: '1px solid #fbbf2444' }}
      >
        Add {CHAIN_NAME} to wallet
      </button>
    </div>
  )
}
