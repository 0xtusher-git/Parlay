import { useState } from 'react'
import { Routes, Route, Link, useLocation } from 'react-router-dom'
import { ConnectKitButton } from 'connectkit'
import { useAccount } from 'wagmi'
import { ExternalLink } from 'lucide-react'
import { ChainGuard } from './components/ChainGuard'
import { Dashboard } from './components/Dashboard'
import { CreateAgreement } from './components/CreateAgreement'
import { AgreementsList } from './components/AgreementsList'
import { GuardPanel } from './components/GuardPanel'
import { EventFeed } from './components/EventFeed'
import { NetworkBanner } from './components/NetworkBanner'
import { FaqPage } from './pages/FaqPage'
import { PARLAY_ADDRESS, USE_MAINNET, buildAddressUrl } from './lib/parlay-contract'
import { shortAddr } from './lib/parlay-utils'

export default function App() {
  return (
    <>
      <AppHeader />
      <Routes>
        <Route path="/" element={<MainPage />} />
        <Route path="/faq" element={<FaqPage />} />
        {/* catch-all → home */}
        <Route path="*" element={<MainPage />} />
      </Routes>
      <AppFooter />
    </>
  )
}

// ─── Shared header ────────────────────────────────────────────────────────────

function AppHeader() {
  const location = useLocation()
  const onFaq = location.pathname === '/faq'

  return (
    <header
      className="sticky top-0 z-40 border-b"
      style={{
        background: 'rgba(13,27,47,0.85)',
        backdropFilter: 'blur(20px) saturate(200%)',
        WebkitBackdropFilter: 'blur(20px) saturate(200%)',
        borderColor: 'var(--border)',
      }}
    >
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
        {/* Left: logo + tagline */}
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="display text-xl font-bold transition-opacity hover:opacity-80"
            style={{ color: 'var(--ink)', letterSpacing: '-0.03em', textDecoration: 'none' }}
          >
            Parlay
          </Link>
          <span className="text-xs hidden sm:block" style={{ color: 'var(--subtle)' }}>
            Money moves by agreed terms.
          </span>
          <span
            className="rounded-full px-2 py-0.5 text-xs font-semibold"
            style={USE_MAINNET
              ? { background: 'rgba(26,128,71,0.18)', color: '#4ade80' }
              : { background: 'rgba(172,198,233,0.15)', color: 'var(--accent)' }}
          >
            {USE_MAINNET ? 'Mainnet' : 'Testnet'}
          </span>
        </div>

        {/* Right: nav + contract link + wallet */}
        <div className="flex items-center gap-3">
          <nav className="hidden sm:flex items-center gap-1" aria-label="Main navigation">
            <NavLink to="/" active={!onFaq}>App</NavLink>
            <NavLink to="/faq" active={onFaq}>FAQ</NavLink>
          </nav>
          {/* Mobile FAQ link */}
          <Link
            to="/faq"
            className="sm:hidden text-xs font-semibold px-2.5 py-1 rounded-lg transition-all hover:opacity-80"
            style={{
              color: onFaq ? 'var(--ink)' : 'var(--subtle)',
              background: onFaq ? 'var(--surface-strong)' : 'transparent',
            }}
          >
            FAQ
          </Link>
          <a
            href={buildAddressUrl(PARLAY_ADDRESS)}
            target="_blank"
            rel="noreferrer"
            className="hidden sm:flex items-center gap-1 text-xs"
            style={{ color: 'var(--subtle)' }}
          >
            <span className="mono">{shortAddr(PARLAY_ADDRESS)}</span>
            <ExternalLink className="size-3" />
          </a>
          <ConnectKitButton />
        </div>
      </div>
    </header>
  )
}

function NavLink({ to, active, children }: { to: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="text-sm font-semibold px-3 py-1.5 rounded-lg transition-all hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{
        color: active ? 'var(--ink)' : 'var(--subtle)',
        background: active ? 'var(--surface-strong)' : 'transparent',
        textDecoration: 'none',
        outlineColor: 'var(--accent)',
      }}
      aria-current={active ? 'page' : undefined}
    >
      {children}
    </Link>
  )
}

// ─── Shared footer ────────────────────────────────────────────────────────────

function AppFooter() {
  return (
    <footer
      className="border-t mt-8"
      style={{ borderColor: 'var(--border)' }}
    >
      <div className="max-w-5xl mx-auto px-4 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="display text-sm font-bold" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>
            Parlay
          </span>
          <span className="text-xs" style={{ color: 'var(--subtle)' }}>
            Non-custodial USDC agreements on Arc.
          </span>
        </div>
        <nav className="flex items-center gap-4" aria-label="Footer navigation">
          <Link
            to="/"
            className="text-xs font-medium transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 rounded"
            style={{ color: 'var(--subtle)', textDecoration: 'none', outlineColor: 'var(--accent)' }}
          >
            App
          </Link>
          <Link
            to="/faq"
            className="text-xs font-medium transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 rounded"
            style={{ color: 'var(--subtle)', textDecoration: 'none', outlineColor: 'var(--accent)' }}
          >
            FAQ
          </Link>
          <a
            href={buildAddressUrl(PARLAY_ADDRESS)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 rounded"
            style={{ color: 'var(--subtle)', outlineColor: 'var(--accent)' }}
          >
            Contract
            <ExternalLink className="size-3" />
          </a>
        </nav>
      </div>
    </footer>
  )
}

// ─── Main app page (existing logic, untouched) ────────────────────────────────

function MainPage() {
  const { isConnected } = useAccount()
  const [refreshKey, setRefreshKey] = useState(0)
  // Incremented after any confirmed transaction so EventFeed re-polls immediately.
  const [pollTrigger, setPollTrigger] = useState(0)

  function onAction() {
    setRefreshKey(k => k + 1)
    setPollTrigger(t => t + 1)
  }

  return (
    <main className="max-w-5xl mx-auto px-4 py-8 flex flex-col gap-8">
      {/* Network mismatch banner — shown before everything else */}
      <NetworkBanner />

      {/* Tagline when disconnected */}
      {!isConnected && (
        <div className="text-center py-12">
          <h1
            className="display text-4xl font-bold mb-3"
            style={{ color: 'var(--ink)', letterSpacing: '-0.04em' }}
          >
            Parlay
          </h1>
          <p className="text-lg mb-2" style={{ color: 'var(--muted)' }}>
            Money moves by agreed terms.
          </p>
          <p className="text-sm mb-8 max-w-lg mx-auto" style={{ color: 'var(--subtle)' }}>
            Lock USDC in a conditional agreement. Release on a deadline, split between
            recipients, refund before the clock runs out, or bring in an arbiter for disputes.
            Fully non-custodial on Arc.
          </p>
          <div className="flex justify-center">
            <ConnectKitButton label="Connect to get started" />
          </div>
        </div>
      )}

      {isConnected && (
        <>
          {/* Dashboard: balances and claim */}
          <section>
            <SectionLabel>Your Balances</SectionLabel>
            <ChainGuard>
              <Dashboard onClaimed={onAction} />
            </ChainGuard>
          </section>

          {/* Create agreement */}
          <section>
            <SectionLabel>New Agreement</SectionLabel>
            <ChainGuard>
              <CreateAgreement onCreated={onAction} />
            </ChainGuard>
          </section>

          {/* Agreements list */}
          <section>
            <SectionLabel>Agreements</SectionLabel>
            <ChainGuard>
              <AgreementsList refreshKey={refreshKey} />
            </ChainGuard>
          </section>
        </>
      )}

      {/* Guard panel + event feed — always visible */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <section>
          <SectionLabel>Protocol Health</SectionLabel>
          <GuardPanel />
        </section>
        <section>
          <SectionLabel>Live Activity</SectionLabel>
          <EventFeed pollTrigger={pollTrigger} />
        </section>
      </div>
    </main>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--subtle)' }}>
      {children}
    </p>
  )
}
