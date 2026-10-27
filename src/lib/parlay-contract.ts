/**
 * Parlay contract configuration.
 * CHANGE ONLY THIS FILE when switching testnet ↔ mainnet.
 */

import artifact from '../../contracts/out/Parlay.sol/Parlay.json'
import type { Abi } from 'viem'

// ─── Network config ────────────────────────────────────────────────────────

/** Live on Arc mainnet. Set to false to switch back to testnet. */
export const USE_MAINNET = true

export const ARC_TESTNET_CHAIN_ID = 5042002
export const ARC_MAINNET_CHAIN_ID = 5042

export const ACTIVE_CHAIN_ID = USE_MAINNET ? ARC_MAINNET_CHAIN_ID : ARC_TESTNET_CHAIN_ID

export const PARLAY_ADDRESS_TESTNET = '0x7237249959024f5b311aacf2f234d4f23e19d6f8' as const
export const PARLAY_ADDRESS_MAINNET = '0xcAb04475aF7b99ff086a25DF5644890E8Ce1FAD9' as const
export const PARLAY_ADDRESS = (USE_MAINNET ? PARLAY_ADDRESS_MAINNET : PARLAY_ADDRESS_TESTNET) as `0x${string}`

export const USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as const

export const EXPLORER_BASE = USE_MAINNET
  ? 'https://explorer.arc.io'
  : 'https://explorer.testnet.arc.io'

export function buildTxUrl(hash: string) {
  return `${EXPLORER_BASE}/tx/${hash}`
}

export function buildAddressUrl(addr: string) {
  return `${EXPLORER_BASE}/address/${addr}`
}

// ─── ABI ───────────────────────────────────────────────────────────────────

export const PARLAY_ABI = artifact.abi as Abi

// ─── Constants ─────────────────────────────────────────────────────────────

export const BASIS_POINTS = 10_000
export const USDC_DECIMALS = 6

/** 100 USDC in 6-decimal units — the initial cap set at deploy time */
export const DEFAULT_MAX_AMOUNT = 100_000_000n
