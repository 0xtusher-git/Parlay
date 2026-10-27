/**
 * FAQ content for Parlay.
 * Edit text here — no layout changes needed.
 *
 * Links use runtime imports from the config so they always
 * reflect the active network (testnet vs mainnet).
 */

export interface FaqEntry {
  category: string
  question: string
  /** Plain text or a React node key. Use {EXPLORER_LINK} as a placeholder
   *  for the contract explorer URL — the component replaces it at render time. */
  answer: string
}

export const FAQ_CATEGORIES = [
  'The basics',
  'Getting started',
  'Agreements',
  'Your funds and safety',
  'Costs and gas',
  'Risks',
] as const

export type FaqCategory = (typeof FAQ_CATEGORIES)[number]

export const FAQ: FaqEntry[] = [
  // ─── The basics ────────────────────────────────────────────────────────────
  {
    category: 'The basics',
    question: 'What does Parlay do?',
    answer:
      'Parlay lets you lock USDC in an agreement that pays out by terms you set: who gets paid, what share each person gets, and when. It combines conditional escrow and payment splitting in one smart contract on Arc.',
  },
  {
    category: 'The basics',
    question: 'What is an agreement?',
    answer:
      'An agreement is a single USDC deposit with a list of recipients, a percentage share for each, a release time, and an optional arbiter. Once created, the USDC sits in the contract — not with Parlay or anyone else — until it is released or refunded under the rules.',
  },
  {
    category: 'The basics',
    question: 'Why Arc and USDC?',
    answer:
      'Arc is a stablecoin-native chain where gas is paid in USDC and finality is fast, so you only ever need one asset: the same USDC you are paying with.',
  },
  {
    category: 'The basics',
    question: 'Who is Parlay for?',
    answer:
      'Anyone who wants to pay several people from one deposit, hold funds until a date, or pay on agreed terms without trusting a middleman: freelancers and clients, small teams, shared treasuries, and software or agents that pay each other.',
  },

  // ─── Getting started ───────────────────────────────────────────────────────
  {
    category: 'Getting started',
    question: 'What do I need to use Parlay?',
    answer:
      'An EVM wallet (such as MetaMask or Phantom) connected to Arc mainnet (chain ID 5042), and some USDC on Arc. The same USDC covers gas, so you do not need any other token.',
  },
  {
    category: 'Getting started',
    question: 'How do I add Arc to my wallet?',
    answer:
      'Click "Switch to Arc Mainnet" in the app and approve the prompt. To add it manually: chain ID 5042, RPC https://rpc.mainnet.arc.io, explorer https://explorer.arc.io, currency USDC.',
  },
  {
    category: 'Getting started',
    question: 'How do I create an agreement?',
    answer:
      'Add your recipients and each person\'s percentage (they must total 100%), enter the USDC amount and release date, optionally choose an arbiter, then approve USDC and confirm the create transaction. That is two wallet confirmations.',
  },
  {
    category: 'Getting started',
    question: 'How do recipients get paid?',
    answer:
      'When an agreement is released, each recipient\'s share is credited to their claimable balance in Parlay. They open the app and press "Claim" to receive the USDC in their wallet.',
  },
  {
    category: 'Getting started',
    question: 'Why do recipients have to claim instead of being paid automatically?',
    answer:
      'So that one problem address can never block everyone else. USDC on Arc can reject transfers to blocked addresses; if Parlay pushed all payments in one transaction, a single failed transfer could freeze the whole payout. With claiming, each person is paid independently.',
  },

  // ─── Agreements ────────────────────────────────────────────────────────────
  {
    category: 'Agreements',
    question: 'How can an agreement be released?',
    answer:
      'Two ways. The creator can approve release at any time. Or, once the release time passes, anyone can trigger the release and the split is credited to the recipients. No one has to be online for the deadline to work.',
  },
  {
    category: 'Agreements',
    question: 'Can I get my money back?',
    answer:
      'The creator can refund an agreement only if all three conditions hold: the agreement is still in Funded status, the release time has not yet passed, and no dispute is open. Once any of those conditions fails, the refund path is closed. After the release time the agreement pays out to recipients — it cannot be redirected back to the creator by anyone.',
  },
  {
    category: 'Agreements',
    question: 'What is an arbiter and what happens in a dispute?',
    answer:
      'An arbiter is an optional neutral address chosen when the agreement is created. If the creator or a recipient raises a dispute before the release time, the agreement is frozen and only the arbiter can decide: pay the recipients per their shares, or refund the creator. Disputes can only be raised while the agreement is still pending — once the release deadline passes, the dispute window closes and the agreement pays out normally.\n\nIf no arbiter was set, disputes are not available.\n\nIf the arbiter never acts, funds are not stuck forever. Once the original release time plus 30 days has passed, anyone can call the contract to trigger a release to recipients. That escape hatch always pays recipients — it cannot refund the creator.',
  },
  {
    category: 'Agreements',
    question: 'Can the terms change after creation?',
    answer:
      'No. Recipients, shares, amount, release time, and arbiter are fixed once the agreement is created. Not even Parlay\'s owner can change them.',
  },
  {
    category: 'Agreements',
    question: 'How many recipients can I add?',
    answer:
      'Between 1 and 10 per agreement. Shares are in basis points and must add up to exactly 100%. Any rounding leftover goes to the last recipient so the numbers always add up.',
  },

  // ─── Your funds and safety ─────────────────────────────────────────────────
  {
    category: 'Your funds and safety',
    question: 'Does Parlay hold my funds?',
    answer:
      'Your USDC is held by the smart contract, not by a person or company. The contract\'s owner cannot withdraw user USDC, change agreements, or redirect payouts. There is no function that allows it.',
  },
  {
    category: 'Your funds and safety',
    question: 'What is the emergency pause?',
    answer:
      'A guardian can pause the contract, which blocks new agreements. It does not block claiming, refunds, or dispute resolution, so you can always get your money out when paused.',
  },
  {
    category: 'Your funds and safety',
    question: 'What is the solvency check?',
    answer:
      'The Guard panel reads the contract live and confirms its USDC balance covers everything locked and everything claimable. If it ever shows red, something is wrong. Anyone can verify this on-chain.',
  },
  {
    category: 'Your funds and safety',
    question: 'Is there a limit on how much I can put in?',
    answer:
      'Yes. Each agreement is capped by a configurable limit set in the contract. At launch this is 100 USDC — a conservative ceiling while the contract is unaudited. The owner can raise it by calling setMaxAgreementAmount. The current value is always visible in the Guard panel.',
  },
  {
    category: 'Your funds and safety',
    question: 'Has Parlay been audited?',
    answer:
      'Not yet. The code is public and verified on the explorer, and it has tests, but it has not had a formal third-party audit. Please start small and read the contract yourself.',
  },
  {
    category: 'Your funds and safety',
    question: 'Are my private keys ever shared?',
    answer:
      'Never. Parlay only asks your wallet to sign transactions. It never sees, asks for, or stores your keys or seed phrase.',
  },

  // ─── Costs and gas ─────────────────────────────────────────────────────────
  {
    category: 'Costs and gas',
    question: 'What does Parlay cost?',
    answer:
      'Parlay charges no platform fee in this version. You only pay network gas on Arc.',
  },
  {
    category: 'Costs and gas',
    question: 'How is gas paid?',
    answer:
      'In USDC, the same asset you are paying with. Fees on Arc are small, but you need a little USDC in your wallet beyond the amount you deposit.',
  },
  {
    category: 'Costs and gas',
    question: 'Why do I see two approvals or confirmations?',
    answer:
      'The first approves the Parlay contract to pull your exact USDC amount; the second creates the agreement. Claiming is a separate single confirmation.',
  },

  // ─── Risks ─────────────────────────────────────────────────────────────────
  {
    category: 'Risks',
    question: 'What can still go wrong?',
    answer:
      'Honestly: the contract is unaudited and may contain bugs; USDC itself can be restricted by its issuer for blocked addresses; you could enter the wrong recipient address (sent funds cannot be recalled); a creator can refund before the deadline; and wallets or the website could be compromised. Parlay is not risk-free.',
  },
  {
    category: 'Risks',
    question: 'What if I enter a wrong recipient address?',
    answer:
      'Agreements cannot be edited. Double-check every address before confirming. If the agreement has not been released and the release time has not passed, the creator can refund and create a corrected one.',
  },
  {
    category: 'Risks',
    question: 'What if the website goes down?',
    answer:
      'Your funds stay in the contract. Anyone can trigger releases after the deadline and claim directly through the explorer\'s contract interface, so access to your money does not depend on this website.',
  },
  {
    category: 'Risks',
    question: 'Is this financial or legal advice?',
    answer:
      'No. Parlay is software. You are responsible for your own agreements and for complying with the laws that apply to you.',
  },
]
