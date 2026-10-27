/**
 * Shared React Query / wagmi query options.
 *
 * Rules:
 *  - staleTime 60 s  — don't re-fetch if data is < 60 s old (deduplicates
 *    simultaneous renders; the global pollingInterval is already 30 s).
 *  - refetchOnWindowFocus false — already handled by the global pollingInterval;
 *    duplicate focus-refetches double the load for no UX benefit here.
 *  - refetchIntervalInBackground false — stop ALL polling while the tab is hidden.
 *    Combined with refetchOnWindowFocus:false this means a hidden tab sends 0 RPCs.
 *  - gcTime 5 min — keep stale data in memory so navigating back is instant.
 *
 * Use READ_QUERY for normal state reads (balances, agreements, guard panel).
 * Use ACTIVE_QUERY for data that must stay fresh during a pending transaction
 * (receipt polling overrides pollingInterval locally to 4 s).
 */

export const READ_QUERY = {
  staleTime: 60_000,           // 60 s — data is "fresh" for this long
  refetchOnWindowFocus: false, // global 30 s poll handles freshness
  refetchIntervalInBackground: false, // 0 RPCs when tab is hidden
  gcTime: 5 * 60_000,
} as const

/** Slightly tighter stale window for values the user can act on immediately. */
export const BALANCE_QUERY = {
  ...READ_QUERY,
  staleTime: 30_000,           // 30 s — matches global poll interval exactly
} as const
