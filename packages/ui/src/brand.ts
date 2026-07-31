/**
 * Feastpot brand palette — the single source of truth for brand hex values.
 *
 * Consumed by each app's `tailwind.config.ts` (configs are JS, so the
 * cross-package @layer CSS limitation that forces globals.css duplication
 * doesn't apply) and by components that need literal hexes (e.g. inline
 * styles in the vendor onboarding step indicator).
 *
 * The per-app `globals.css` files still inline these values as CSS vars
 * (cross-package @layer CSS gets dropped in production builds), but they are
 * verified against this module by `packages/ui/scripts/check-brand-tokens.mjs`
 * which runs as part of `@feastpot/ui`'s lint. If you change a hex here,
 * that check will fail until every globals.css is updated to match — no more
 * silent drift like the portals staying orange after the green rebrand.
 *
 * Keep values as plain string literals: the check script parses this file
 * textually (no TS toolchain), so computed values won't be picked up.
 */
export const brandColors = {
  brand: {
    DEFAULT: '#00843D', // Pan-African green - primary CTAs
    light: '#E6F4EC',
    dark: '#005C2B', // Deep forest - hover state
    50: '#E6F4EC',
    100: '#C2E5D0',
    500: '#00843D',
    600: '#006E32',
    700: '#005C2B',
    900: '#003318',
  },
  teal: {
    DEFAULT: '#1D9E75',
    light: '#E1F5EE',
    dark: '#0F6E56',
    50: '#E1F5EE',
    500: '#1D9E75',
    600: '#178A65',
    700: '#0F6E56',
  },
  vendor: {
    DEFAULT: '#185FA5',
    light: '#E5EEF7',
    dark: '#0F4373',
    50: '#E5EEF7',
    500: '#185FA5',
    600: '#13518D',
    700: '#0F4373',
  },
  scotch: '#E30613', // wireframe red - offers, discounts, urgent
  plantain: '#F6B400', // wireframe gold - rewards, FeastPass, highlights
  yam: '#00843D', // FSA, halal, verified - collapses to brand green
  pot: '#5F5E5A', // neutral decorative
  cream: {
    DEFAULT: '#FFFDF7', // main background (customer app)
    warm: '#FFF8E8', // section dividers, card bg
    deep: '#F2EAD3', // stronger contrast for borders
    border: '#EDE4D4', // hairline borders on warm surfaces
    muted: '#F5EDE0', // muted/incomplete state fills
  },
  charcoal: {
    DEFAULT: '#1C1C1A',
    mid: '#5F5E5A',
    light: '#9B9894',
    soft: '#BDBBB7', // disabled/incomplete outlines
  },
  surface: {
    web: '#FBF6EF', // customer app bg-surface
    vendor: '#F8F7F5', // vendor/admin bg-surface
  },
} as const;

export type BrandColors = typeof brandColors;
