/**
 * Skeleton placeholder for the horizontal-scrolling CuisineFilter row.
 *
 * Renders six pill-shaped shimmer blocks at varied widths so the strip
 * looks like a real chip rail loading rather than a uniform set of
 * boxes. `overflowX: hidden` mirrors the live filter's scroll container
 * without leaking the internal scrollbar during the loading state.
 */
export function CuisineFilterSkeleton() {
  const widths = [80, 96, 88, 92, 78, 84];
  return (
    <div
      style={{
        display: 'flex',
        gap: '8px',
        padding: '12px 16px',
        overflowX: 'hidden',
      }}
      aria-hidden="true"
    >
      {widths.map((w, i) => (
        <div
          key={i}
          className="animate-shimmer"
          style={{
            height: '72px',
            width: `${w}px`,
            borderRadius: '12px',
            flexShrink: 0,
          }}
        />
      ))}
    </div>
  );
}
