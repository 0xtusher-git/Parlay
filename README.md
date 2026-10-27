# Parlay — Money moves by agreed terms.

Built with [Arc Studio](https://studio.arc.io)

Parlay is a non-custodial USDC conditional escrow and payment-splitting protocol deployed on Arc. One party locks USDC in an agreement that pays out to one or more recipients by agreed terms: conditional release on a deadline, early release by the creator, split payments across up to ten recipients, and optional arbiter-based dispute resolution — all onchain, all pull-payment, no custody.

---

## Tech Stack

- **Smart contract:** Solidity ^0.8.24, OpenZeppelin 5.6.1 (SafeERC20, ReentrancyGuard, Pausable, Ownable2Step), Foundry
- **Frontend:** React 18, wagmi v2, viem, ConnectKit, React Router v7, Tailwind CSS, Framer Motion
- **Chain:** Arc (USDC-native EVM, chain ID 5042 mainnet / 5042002 testnet)
- **Token:** USDC ERC-20 at `0x3600000000000000000000000000000000000000` (same address on both networks)

---

## Development

### Prerequisites

- [Bun](https://bun.sh) (package manager and runtime)
- [Foundry](https://getfoundry.sh) (Forge for Solidity compilation and tests)

### Install

```bash
bun install
```

### Run

```bash
bun run dev
```

The frontend runs at `http://localhost:5173`.

### Build

```bash
bun run contracts:build   # compile Solidity
bun run build             # not a script — Vite build is run by the host deployment
```

### Test (Solidity)

```bash
bun run contracts:test
```

59 tests covering: create/release/refund/dispute flows, rounding dust invariant, fuzz arithmetic, reentrancy protection, pause policy, solvency invariant, and more.

### Lint and typecheck

```bash
bun run check
```

---

## Environment Variables

| Variable | Purpose | Required |
|---|---|---|
| `RPC_PROXY_BASE_URL` | Proxied RPC endpoint (Arc Studio only) | Optional outside Arc Studio |
| `RPC_PROXY_TOKEN` | RPC proxy auth token (Arc Studio only) | Optional outside Arc Studio |
| `VITE_RPC_PROXY_BASE_URL` | Same proxy URL exposed to the frontend bundle | Optional outside Arc Studio |
| `VITE_RPC_PROXY_TOKEN` | Same proxy token exposed to the frontend bundle | Optional outside Arc Studio |
| `VITE_WALLETCONNECT_PROJECT_ID` | WalletConnect project ID for wallet modal | Optional (injected connector works without) |

No private keys or secrets are required for the frontend.

---

## Contract Architecture

### `Parlay.sol`

A single contract managing the full lifecycle of USDC conditional escrow agreements.

**Agreement lifecycle:**

```
createAgreement → Funded
  Funded → approveRelease (creator)        → Released
  Funded → releaseAfterDeadline (anyone)   → Released
  Funded → refund (creator, before deadline) → Refunded
  Funded → raiseDispute (recipient/creator) → Disputed
  Disputed → resolveDispute (arbiter)       → Resolved
  Disputed → releaseAfterDeadline (anyone, after releaseTime + 30d) → Released
```

**Pull-payment design:** No function pushes USDC to recipients in a loop. `approveRelease`, `releaseAfterDeadline`, and `resolveDispute` credit `claimable[address]` balances. Each recipient withdraws independently with `claim()`. This means a blocklisted or reverting recipient can never block others.

**Rounding dust:** Integer division across recipient shares can leave 1 wei of dust. Dust is always assigned to the last recipient, so the sum of all credits equals the agreement amount exactly.

**Accounting invariant:**
```
USDC.balanceOf(contract) >= totalLocked + totalClaimable
```
`totalLocked` tracks funds in open (Funded / Disputed) agreements. `totalClaimable` tracks credits already assigned but not yet claimed. Verified by the `solvencyCheck()` view and fuzz-tested across random sequences.

### Safety Guards

| Guard | Mechanism |
|---|---|
| **Emergency pause** | `guardian` calls `emergencyPause()`. Blocks `createAgreement` only — never blocks `claim`, `refund`, or dispute resolution. Users can always exit. |
| **Unpause** | `owner` calls `unpause()`. |
| **Cap on new agreements** | `maxAgreementAmount` (default 100 USDC). Owner-adjustable. Limits exposure before audit. |
| **Dispute escape hatch** | After `releaseTime + 30 days`, anyone can call `releaseAfterDeadline` on a Disputed agreement. The timer starts from the agreement's original `releaseTime`, not from when the dispute was raised. The release always goes to recipients — it cannot refund the creator. |
| **Sweep protection** | `rescueToken(token, amount)` may only rescue tokens other than USDC. |
| **No renounced ownership** | `renounceOwnership()` is overridden to revert — the owner is always needed to unpause. |
| **Two-step ownership** | `Ownable2Step` requires the new owner to accept before the transfer completes. |
| **Reentrancy** | `nonReentrant` on all state-mutating functions. Checks-Effects-Interactions throughout. |

### Security Model and Known Limitations

- **Unaudited.** Parlay v1 has not received a third-party security audit. Do not use for amounts you cannot afford to lose.
- **Arbiter trust.** If an arbiter is set, that address can unilaterally send all funds to either the creator or the recipients. Choose arbiters carefully.
- **Block timestamp.** Release time comparisons use `block.timestamp`. Validators can manipulate timestamp by a small window (~15s). This is inherent to all time-based escrow contracts.
- **USDC blocklist.** Arc USDC can blocklist addresses. A blocklisted recipient cannot call `claim()` and their credits remain in the contract until the blocklist is lifted. Pull-payment design means other recipients are unaffected.
- **100 USDC cap.** The `maxAgreementAmount` at launch is 100 USDC. The owner must increase this explicitly before larger agreements can be created.
- **No upgradeability.** There are no proxy patterns. Bug fixes require a new deployment and migrating to the new address.

---

## Deployment

### Mainnet (Arc, chain ID 5042) — LIVE

The contract is deployed at:

```
0xcAb04475aF7b99ff086a25DF5644890E8Ce1FAD9
```

[View on Arc Explorer](https://explorer.arc.io/address/0xcAb04475aF7b99ff086a25DF5644890E8Ce1FAD9)

- USDC: `0x3600000000000000000000000000000000000000`
- `maxAgreementAmount`: 100 USDC (100 000 000 in 6-decimal units) — unaudited launch cap; owner can raise via `setMaxAgreementAmount`
- **This contract has not received a third-party security audit. Do not use for amounts you cannot afford to lose.**

### Testnet (Arc Testnet, chain ID 5042002)

Also deployed at:

```
0x7237249959024f5b311aacf2f234d4f23e19d6f8
```

[View on Arc Testnet Explorer](https://explorer.testnet.arc.io/address/0x7237249959024f5b311aacf2f234d4f23e19d6f8)

To switch the frontend back to testnet, edit `src/lib/parlay-contract.ts`:

```ts
export const USE_MAINNET = false
```

### Re-deploying

To deploy a new version of the contract to mainnet:

```bash
forge build
forge create contracts/Parlay.sol:Parlay \
  --rpc-url https://rpc.mainnet.arc.io \
  --interactive \
  --constructor-args \
    0x3600000000000000000000000000000000000000 \
    <YOUR_OWNER_ADDRESS> \
    <YOUR_GUARDIAN_ADDRESS> \
    100000000 \
  --broadcast
```

`--interactive` prompts for your private key in the terminal — it is never written to shell history or an env var. After deploy, update `PARLAY_ADDRESS_MAINNET` in `src/lib/parlay-contract.ts`.

---

## What Users Can Do

- **Create an agreement:** Lock USDC, set recipients with percentage splits, set a release deadline, optionally name an arbiter.
- **Approve USDC first:** A two-step flow (approve USDC allowance, then create) ensures the user always controls their funds.
- **Release early:** The creator can release USDC to recipients at any time before the deadline.
- **Trigger release after deadline:** Anyone can call `releaseAfterDeadline` once the deadline has passed — no permission needed.
- **Refund:** The creator can get their USDC back at any time before the deadline (and before a dispute is raised).
- **Dispute:** A recipient or the creator can raise a dispute if an arbiter was set. The arbiter then resolves it either way.
- **Claim:** Recipients and refunded creators withdraw their credited USDC via a single `claim()` call.
- **Dispute timeout escape:** If the arbiter is unresponsive, anyone can force-release to recipients once `releaseTime + 30 days` has passed. The clock starts from the agreement's original `releaseTime`, not from when the dispute was raised — a dispute opened early gives the arbiter more than 30 days total. The escape hatch always pays recipients; it cannot refund the creator.
