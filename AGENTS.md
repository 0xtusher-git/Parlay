# Parlay — Agent Notes

## Deployed Contracts

| Network | Address | Explorer | Notes |
|---|---|---|---|
| Arc Testnet (5042002) | `0x7237249959024f5b311aacf2f234d4f23e19d6f8` | [View](https://explorer.testnet.arc.io/address/0x7237249959024f5b311aacf2f234d4f23e19d6f8) | Final — includes raiseDispute deadline guard |
| Arc Testnet (5042002) | `0xcc46afd1488d1ae4b70b84b3f989b912e4e01cd2` | [View](https://explorer.testnet.arc.io/address/0xcc46afd1488d1ae4b70b84b3f989b912e4e01cd2) | Superseded — lacked raiseDispute deadline guard |
| Arc Mainnet (5042) | `0xcAb04475aF7b99ff086a25DF5644890E8Ce1FAD9` | [View](https://explorer.arc.io/address/0xcAb04475aF7b99ff086a25DF5644890E8Ce1FAD9) | Live — USE_MAINNET = true |

Constructor args for testnet deploy:
- `_usdc`: `0x3600000000000000000000000000000000000000`
- `_owner`: `0x5B12Ce46C7194aD57d143bC22847224047b1Ef42`
- `_guardian`: `0x5B12Ce46C7194aD57d143bC22847224047b1Ef42`
- `_maxAgreementAmount`: `100000000` (100 USDC at 6 decimals)

## To Switch to Mainnet

1. User deploys `contracts/Parlay.sol` from their own wallet (see README for exact command).
2. Edit `src/lib/parlay-contract.ts`: set `USE_MAINNET = true` and `PARLAY_ADDRESS_MAINNET = '0x...'`.
3. That single file change propagates to all components and chain configs.
4. Run `bun run check` to confirm no regressions.

## Architecture Decisions

- **Single config file** (`src/lib/parlay-contract.ts`) — flip one boolean to switch testnet/mainnet.
- **Pull-payment** — all releases credit `claimable[address]`; no push loops. Protects against blocklisted recipients.
- **Dispute escape hatch** — `releaseAfterDeadline` works on Disputed agreements after `releaseTime + 30 days`, preventing permanent fund lock.
- **renounceOwnership disabled** — overrides OZ to revert; owner is always needed for `unpause`.
- **Arc Dark theme** — fits a dense financial protocol dashboard.
- **USDC address** — same `0x3600000000000000000000000000000000000000` on both Arc Testnet and Arc Mainnet.

## Known Issues / Follow-ups

- `maxAgreementAmount` is 100 USDC at deploy; owner should increase after testnet validation.
- No third-party audit. The README notes this explicitly.
- Frontend `getUserAgreements` uses a batch `useReadContracts` for individual agreement reads; this is fine for small numbers of agreements but would need pagination for large lists.
