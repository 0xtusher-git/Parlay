import { useState, useEffect, useRef, useCallback } from 'react'
// NOTE: useEffect is still used for Escape-key listener below
import { useNavigate, useLocation } from 'react-router-dom'
import { Search, X, ExternalLink } from 'lucide-react'
import { FAQ, FAQ_CATEGORIES, type FaqCategory } from '../data/faq'
import { buildAddressUrl, PARLAY_ADDRESS, EXPLORER_BASE } from '../lib/parlay-contract'

// Slug helpers ────────────────────────────────────────────────────────────────
function toSlug(cat: string) {
  return cat.toLowerCase().replace(/\s+/g, '-')
}
function fromSlug(slug: string): FaqCategory | undefined {
  return FAQ_CATEGORIES.find(c => toSlug(c) === slug)
}

// Highlight helper ────────────────────────────────────────────────────────────
function highlight(text: string, query: string) {
  if (!query.trim()) return <>{text}</>
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  const parts = text.split(regex)
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark
            key={i}
            style={{ background: 'rgba(172,198,233,0.35)', color: 'inherit', borderRadius: '2px', padding: '0 1px' }}
          >
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────
export function FaqPage() {
  const location = useLocation()
  const navigate = useNavigate()

  // Derive active category directly from the URL hash — no state sync needed.
  // Fallback to the first category when hash is absent or unrecognised.
  const activeCategory: FaqCategory =
    fromSlug(location.hash.replace('#', '')) ?? FAQ_CATEGORIES[0]

  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  const selectCategory = useCallback(
    (cat: FaqCategory) => {
      setQuery('')
      void navigate(`/faq#${toSlug(cat)}`, { replace: true })
    },
    [navigate],
  )

  // Search mode: flatten all FAQs and filter
  const isSearching = query.trim().length > 0
  const lq = query.toLowerCase()
  const searchResults = isSearching
    ? FAQ.filter(
        e =>
          e.question.toLowerCase().includes(lq) ||
          e.answer.toLowerCase().includes(lq),
      )
    : []

  const activeItems = isSearching
    ? searchResults
    : FAQ.filter(e => e.category === activeCategory)

  // Keyboard: Esc clears search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && query) setQuery('')
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [query])

  const contractExplorerUrl = buildAddressUrl(PARLAY_ADDRESS)
  const explorerHome = EXPLORER_BASE

  return (
    <div className="min-h-dvh" style={{ background: 'var(--bg)', backgroundImage: 'var(--bg-gradient)' }}>
      <div className="max-w-5xl mx-auto px-4 pt-12 pb-24">

        {/* Page title */}
        <div className="mb-10">
          <h1
            className="display font-bold mb-2"
            style={{ fontSize: 'clamp(2.5rem, 8vw, 4.5rem)', letterSpacing: '-0.04em', color: 'var(--ink)', lineHeight: 1 }}
          >
            Questions
          </h1>
          <p className="text-base max-w-xl" style={{ color: 'var(--subtle)', lineHeight: '1.6' }}>
            How Parlay works, what it can and can't do with your USDC, and what can still go wrong.
          </p>
        </div>

        {/* Search */}
        <div
          className="relative mb-8 max-w-sm"
        >
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 size-4 pointer-events-none"
            style={{ color: 'var(--subtle)' }}
          />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search questions…"
            aria-label="Search FAQ"
            className="w-full rounded-xl py-2.5 pl-9 pr-9 text-sm outline-none transition-all"
            style={{
              background: 'var(--surface-strong)',
              border: '1px solid var(--border)',
              color: 'var(--ink)',
            }}
            onFocus={e => {
              (e.target).style.borderColor = 'var(--border-strong)'
            }}
            onBlur={e => {
              (e.target).style.borderColor = 'var(--border)'
            }}
          />
          {query && (
            <button
              onClick={() => { setQuery(''); searchRef.current?.focus() }}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 transition-opacity hover:opacity-70"
              aria-label="Clear search"
              style={{ color: 'var(--subtle)' }}
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {/* Two-column layout */}
        <div className="flex flex-col md:flex-row gap-8 md:gap-12 items-start">

          {/* ── Sidebar / category chips ──────────────────────────────────── */}
          <nav
            aria-label="FAQ categories"
            className="
              flex flex-row md:flex-col gap-1
              overflow-x-auto md:overflow-x-visible
              md:sticky md:top-20
              md:w-52 md:shrink-0
              pb-1 md:pb-0
              md:pl-3
            "
            style={{
              /* Desktop: thin vertical line on the left */
              borderLeft: undefined,
            }}
          >
            {/* Vertical rule wrapper — desktop only */}
            <div
              className="hidden md:block absolute"
              style={{
                left: 0,
                top: 0,
                bottom: 0,
                width: '1px',
                background: 'var(--border)',
              }}
            />
            <div className="hidden md:flex flex-col gap-0.5 relative pl-3" style={{ borderLeft: '1px solid var(--border)' }}>
              {FAQ_CATEGORIES.map(cat => {
                const active = !isSearching && cat === activeCategory
                return (
                  <button
                    key={cat}
                    onClick={() => selectCategory(cat)}
                    aria-current={active ? 'true' : undefined}
                    className="relative text-left text-sm font-medium px-3 py-2 rounded-lg transition-all focus-visible:outline-2 focus-visible:outline-offset-2"
                    style={{
                      color: active ? 'var(--ink)' : 'var(--subtle)',
                      background: active ? 'var(--surface-strong)' : 'transparent',
                      fontWeight: active ? 700 : 500,
                      outlineColor: 'var(--accent)',
                    }}
                  >
                    {/* Active indicator on the vertical line */}
                    {active && (
                      <span
                        className="absolute"
                        style={{
                          left: '-13px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          width: '2px',
                          height: '60%',
                          borderRadius: '1px',
                          background: 'var(--ink)',
                        }}
                      />
                    )}
                    {cat}
                  </button>
                )
              })}
            </div>

            {/* Mobile: horizontal chip row */}
            <div className="flex md:hidden flex-row gap-2 flex-nowrap">
              {FAQ_CATEGORIES.map(cat => {
                const active = !isSearching && cat === activeCategory
                return (
                  <button
                    key={cat}
                    onClick={() => selectCategory(cat)}
                    aria-current={active ? 'true' : undefined}
                    className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full transition-all focus-visible:outline-2 focus-visible:outline-offset-2 whitespace-nowrap"
                    style={{
                      background: active ? 'var(--surface-strong)' : 'var(--surface)',
                      color: active ? 'var(--ink)' : 'var(--subtle)',
                      border: `1px solid ${active ? 'var(--border-strong)' : 'var(--border)'}`,
                      outlineColor: 'var(--accent)',
                    }}
                  >
                    {cat}
                  </button>
                )
              })}
            </div>
          </nav>

          {/* ── Q&A column ───────────────────────────────────────────────── */}
          <div className="flex-1 min-w-0">
            {/* Category heading */}
            {!isSearching && (
              <>
                <h2
                  className="display text-2xl font-bold mb-4"
                  style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}
                >
                  {activeCategory}
                </h2>
                <div style={{ height: '1px', background: 'var(--border)', marginBottom: '1.5rem' }} />
              </>
            )}

            {/* Search heading */}
            {isSearching && (
              <>
                <h2
                  className="display text-lg font-bold mb-4"
                  style={{ color: 'var(--subtle)', letterSpacing: '-0.01em' }}
                >
                  {searchResults.length === 0
                    ? 'No matches'
                    : `${searchResults.length} result${searchResults.length !== 1 ? 's' : ''} for "${query}"`}
                </h2>
                <div style={{ height: '1px', background: 'var(--border)', marginBottom: '1.5rem' }} />
              </>
            )}

            {/* Q&A list */}
            <div className="flex flex-col">
              {activeItems.length === 0 && isSearching && (
                <p className="text-sm py-8 text-center" style={{ color: 'var(--subtle)' }}>
                  Try a different keyword, or browse by category.
                </p>
              )}

              {activeItems.map((entry, i) => (
                <div key={`${entry.category}-${i}`}>
                  {/* Category label in search mode */}
                  {isSearching && (
                    <span
                      className="inline-block text-xs font-semibold uppercase tracking-wider mb-2 px-2 py-0.5 rounded-md"
                      style={{ background: 'var(--surface-strong)', color: 'var(--accent)', letterSpacing: '0.06em' }}
                    >
                      {entry.category}
                    </span>
                  )}

                  <h3
                    className="text-base font-bold mb-2"
                    style={{ color: 'var(--ink)', lineHeight: 1.4 }}
                  >
                    {highlight(entry.question, query)}
                  </h3>

                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: 'var(--muted)', maxWidth: '70ch', lineHeight: '1.75' }}
                  >
                    {highlight(entry.answer, query)}
                  </p>

                  {i < activeItems.length - 1 && (
                    <div style={{ height: '1px', background: 'var(--border)', margin: '1.5rem 0' }} />
                  )}
                </div>
              ))}
            </div>

            {/* Bottom callout */}
            {!isSearching && (
              <div
                className="mt-12 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center gap-4"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                <div className="flex-1">
                  <p className="text-sm font-semibold mb-1" style={{ color: 'var(--ink)' }}>
                    Still stuck? Read the contract.
                  </p>
                  <p className="text-xs" style={{ color: 'var(--subtle)' }}>
                    The source code is public and verified on the explorer. Every rule
                    this page describes is enforced there, not by Parlay.
                  </p>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <a
                    href={contractExplorerUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-xl transition-all hover:opacity-80"
                    style={{ background: 'var(--surface-strong)', color: 'var(--accent)', border: '1px solid var(--border-strong)' }}
                  >
                    Contract on {explorerHome.replace('https://', '')}
                    <ExternalLink className="size-3" />
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
