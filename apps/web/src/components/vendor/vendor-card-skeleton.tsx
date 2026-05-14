/**
 * Skeleton placeholder for VendorCard.
 *
 * Mirrors the real card's information hierarchy so the layout doesn't
 * shift when data lands: cover (h-40 to match `list` variant), name,
 * cuisine pill, rating row, then the cook-identity row separated by the
 * same warm hairline divider used in the live card.
 *
 * The shimmer effect uses the global `.animate-shimmer` utility (defined
 * in globals.css). Inline styles match the patterns already used in
 * vendor-card.tsx for the cook-identity row, keeping the two files
 * visually aligned without adding new Tailwind utilities.
 */
export function VendorCardSkeleton() {
  return (
    <div className="fp-card overflow-hidden" aria-hidden="true">
      {/* Cover image placeholder — h-40 matches VendorCard list variant. */}
      <div className="animate-shimmer h-40 w-full" />

      {/* Body padding matches `p-3` from the live card. */}
      <div style={{ padding: '12px', background: 'white' }}>
        {/* Vendor name */}
        <div
          style={{
            height: '16px',
            width: '65%',
            background: '#EDE4D4',
            borderRadius: '6px',
            marginBottom: '8px',
          }}
        />
        {/* Cuisine pill */}
        <div
          style={{
            height: '12px',
            width: '40%',
            background: '#F5EDE0',
            borderRadius: '4px',
            marginBottom: '10px',
          }}
        />
        {/* Rating + meta row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ height: '12px', width: '80px', background: '#EDE4D4', borderRadius: '4px' }} />
          <div style={{ height: '12px', width: '50px', background: '#F5EDE0', borderRadius: '4px' }} />
        </div>
        {/* Cook identity row — same divider treatment as the live card. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginTop: '10px',
            paddingTop: '10px',
            borderTop: '1px solid #F5EDE0',
          }}
        >
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              background: '#EDE4D4',
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1 }}>
            <div
              style={{
                height: '10px',
                width: '70%',
                background: '#EDE4D4',
                borderRadius: '3px',
                marginBottom: '4px',
              }}
            />
            <div
              style={{
                height: '9px',
                width: '55%',
                background: '#F5EDE0',
                borderRadius: '3px',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
