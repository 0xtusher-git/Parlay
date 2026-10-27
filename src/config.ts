/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, fallback, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arcTestnet, arc } from 'viem/chains'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'

// ---------------------------------------------------------------------------
// Arc RPC endpoints — from https://docs.arc.io/arc/references/rpc-endpoints
// We list multiple providers so viem's fallback() rotates when one rate-limits.
// Third-party endpoints (Blockdaemon, dRPC, QuickNode) are anonymous & free.
// ---------------------------------------------------------------------------

// Arc Testnet (chain ID 5042002) — no-key public endpoints
const ARC_TESTNET_RPCS = [
  'https://rpc.testnet.arc.io',           // Circle primary
  'https://rpc.blockdaemon.testnet.arc.io', // Blockdaemon
  'https://rpc.drpc.testnet.arc.io',       // dRPC
  'https://rpc.quicknode.testnet.arc.io',  // QuickNode
] as const

// Arc Mainnet (chain ID 5042) — no-key public endpoints
const ARC_MAINNET_RPCS = [
  'https://rpc.mainnet.arc.io',            // Circle primary
  'https://rpc.blockdaemon.mainnet.arc.io', // Blockdaemon
  'https://rpc.drpc.mainnet.arc.io',        // dRPC
  'https://rpc.quicknode.mainnet.arc.io',   // QuickNode
] as const

// ---------------------------------------------------------------------------
// RPC proxy (Arc Studio sandbox) — injected at build time.
// When present, use it as the leading transport for testnet so development
// traffic goes through the rate-limit-aware proxy first.
// ---------------------------------------------------------------------------
const PROXY_BASE = import.meta.env.VITE_RPC_PROXY_BASE_URL as string | undefined
const PROXY_TOKEN = import.meta.env.VITE_RPC_PROXY_TOKEN as string | undefined

function proxyUrl(compassChain: string): string | null {
  if (!PROXY_BASE || !PROXY_TOKEN) return null
  return `${PROXY_BASE}/api/rpc/${compassChain}?_rpc_token=${PROXY_TOKEN}`
}

// ---------------------------------------------------------------------------
// Retry configuration for -32005 (rate limit) and 429 responses.
// viem http() retryDelay is a fixed number of milliseconds between retries.
// With a fallback transport, the primary retry is effectively: try all 4
// endpoints (fallback rotates on failure) before giving up.
// ---------------------------------------------------------------------------
const RETRY_OPTS = {
  retryCount: 2,     // 2 retries per individual endpoint before fallback rotates
  retryDelay: 1000,  // 1 s fixed delay between retries on the same endpoint
} as const

// ---------------------------------------------------------------------------
// Build fallback transport for each chain
// ---------------------------------------------------------------------------
function arcTestnetTransport() {
  const proxy = proxyUrl('Arc_Testnet')
  const urls = proxy
    ? [proxy, ...ARC_TESTNET_RPCS]
    : [...ARC_TESTNET_RPCS]
  return fallback(urls.map(url => http(url, RETRY_OPTS)), { rank: false })
}

function arcMainnetTransport() {
  const proxy = proxyUrl('Arc_Mainnet')
  const urls = proxy
    ? [proxy, ...ARC_MAINNET_RPCS]
    : [...ARC_MAINNET_RPCS]
  return fallback(urls.map(url => http(url, RETRY_OPTS)), { rank: false })
}

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arcTestnet.id, arcTestnet.rpcUrls.default.http[0])
registerChain(arc.id, arc.rpcUrls.default.http[0])

// ---------------------------------------------------------------------------
// wagmi config
// pollingInterval: 30_000ms (30s) replaces the 4s default across all hooks.
// Individual hooks that need faster updates override locally.
// ---------------------------------------------------------------------------
export const config = createConfig({
  chains: [arcTestnet, arc, mainnet],
  connectors: [injected()],
  transports: {
    [arcTestnet.id]: arcTestnetTransport(),
    [arc.id]: arcMainnetTransport(),
    [mainnet.id]: http(undefined, RETRY_OPTS), // ENS resolution
  },
  // Global polling interval: 30s. Hooks that need live feedback after a tx
  // receive a local override of 4000ms for receipt polling only.
  pollingInterval: 30_000,
})

export { arcTestnet, arc }

// ---------------------------------------------------------------------------
// wallet_addEthereumChain parameters — used by the add-chain button
// ---------------------------------------------------------------------------
export const ADD_ARC_TESTNET_PARAMS = {
  chainId: '0x4CEF52',                           // 5042002
  chainName: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: [...ARC_TESTNET_RPCS],
  blockExplorerUrls: ['https://explorer.testnet.arc.io'],
} as const

export const ADD_ARC_MAINNET_PARAMS = {
  chainId: '0x13B2',                             // 5042
  chainName: 'Arc',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: [...ARC_MAINNET_RPCS],
  blockExplorerUrls: ['https://explorer.arc.io'],
} as const
