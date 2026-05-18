/**
 * Server-component loading boundary for /vendors/[slug].
 *
 * Next 15 renders this automatically while the page's `await
 * getVendorBySlug(...)` is in flight. Without it the route shows a bare
 * white screen (the topnav stays mounted but the content area is
 * empty), which on a 4G mobile connection reads as a broken page for
 * 1–2 seconds.
 *
 * The skeleton mirrors the real profile layout:
 *   1. Edge-to-edge cover (h-52, matches the live hero)
 *   2. Logo chip overlap (-bottom-6 left-4, same as the live page)
 *   3. Name + rating row + cuisine pill row
 *   4. Cook-identity card on the warm `#FBF6EF` background
 *   5. Sticky category tab strip (5 pills)
 *   6. First menu category - section heading + 6 menu-item rows
 *
 * Pure markup, no client JS - keeps the loading boundary itself a
 * server component so it streams immediately.
 */
export default function VendorProfileLoading() {
  return (
    <div className="px-4 pb-6" role="status" aria-live="polite">
      <span className="sr-only">Loading vendor profile</span>
      {/* Visual skeleton subtree is decorative - hidden from screen
          readers so SR users get the single sr-only announcement above
          rather than traversing every empty list/listitem placeholder. */}
      <div aria-hidden="true">
      {/* HERO */}
      <header className="relative -mx-4">
        <div className="animate-shimmer relative h-52 w-full overflow-hidden" />
        {/* Logo chip overlap - matches the live profile page. */}
        <div
          className="animate-shimmer absolute -bottom-6 left-4 h-16 w-16 rounded-2xl border-4 border-white shadow-card"
          aria-hidden="true"
        />
      </header>

      {/* VENDOR INFO */}
      <section className="mt-9 space-y-3">
        <div
          className="animate-shimmer"
          style={{ height: '24px', width: '60%', borderRadius: '6px' }}
        />
        <div
          className="animate-shimmer"
          style={{ height: '16px', width: '120px', borderRadius: '4px' }}
        />
        <div style={{ display: 'flex', gap: '6px' }}>
          {[60, 72, 50].map((w, i) => (
            <div
              key={i}
              className="animate-shimmer"
              style={{ height: '20px', width: `${w}px`, borderRadius: '999px' }}
            />
          ))}
        </div>

        {/* Cook identity card */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px',
            background: '#FBF6EF',
            borderRadius: '12px',
            marginTop: '8px',
          }}
        >
          <div
            className="animate-shimmer"
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              flexShrink: 0,
              border: '2px solid white',
            }}
          />
          <div style={{ flex: 1 }}>
            <div
              className="animate-shimmer"
              style={{ height: '12px', width: '70%', borderRadius: '3px', marginBottom: '6px' }}
            />
            <div
              className="animate-shimmer"
              style={{ height: '11px', width: '50%', borderRadius: '3px' }}
            />
          </div>
        </div>
      </section>

      {/* MENU TABS */}
      <section className="mt-6">
        <div style={{ display: 'flex', gap: '8px', overflowX: 'hidden', paddingBottom: '4px' }}>
          {[64, 72, 80, 60, 76].map((w, i) => (
            <div
              key={i}
              className="animate-shimmer"
              style={{ height: '36px', width: `${w}px`, borderRadius: '999px', flexShrink: 0 }}
            />
          ))}
        </div>

        {/* MENU ITEMS - first category */}
        <div className="mt-4 space-y-2">
          <div
            className="animate-shimmer"
            style={{ height: '20px', width: '120px', borderRadius: '4px', marginBottom: '8px' }}
          />
          <ul className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <li
                key={i}
                style={{
                  display: 'flex',
                  gap: '12px',
                  padding: '12px',
                  background: 'white',
                  borderRadius: '16px',
                  boxShadow: '0 1px 4px rgba(28,28,26,0.06)',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    className="animate-shimmer"
                    style={{
                      height: '14px',
                      width: '60%',
                      borderRadius: '4px',
                      marginBottom: '6px',
                    }}
                  />
                  <div
                    className="animate-shimmer"
                    style={{
                      height: '11px',
                      width: '85%',
                      borderRadius: '4px',
                      marginBottom: '4px',
                    }}
                  />
                  <div
                    className="animate-shimmer"
                    style={{ height: '11px', width: '45%', borderRadius: '4px' }}
                  />
                </div>
                <div
                  className="animate-shimmer"
                  style={{
                    width: '88px',
                    height: '88px',
                    borderRadius: '12px',
                    flexShrink: 0,
                  }}
                />
              </li>
            ))}
          </ul>
        </div>
      </section>
      </div>
    </div>
  );
}
