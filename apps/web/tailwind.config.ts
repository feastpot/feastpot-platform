import type { Config } from 'tailwindcss';
import defaultTheme from 'tailwindcss/defaultTheme';

/**
 * Tailwind config for @feastpot/web.
 *
 * Brand tokens are mirrored here as plain hex so component authors can write
 * `bg-brand`, `text-teal-dark`, `border-vendor` without going through the
 * shadcn HSL CSS-variable layer (which is reserved for the neutral/semantic
 * tokens defined in `globals.css` and `@feastpot/ui/theme.css`).
 *
 * `content` covers BOTH this app's source AND the shared UI package - Tailwind
 * needs to scan @feastpot/ui's components or their utility classes get purged
 * from the production build.
 *
 * Light-mode only for launch: we leave `darkMode: 'class'` (the safest valid
 * v3 value), but no `<html class="dark">` is ever set, so nothing dark renders.
 */
const config: Config = {
  darkMode: 'class',
  content: [
    './src/**/*.{ts,tsx,mdx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '1rem',
    },
    extend: {
      colors: {
        // ─── Feastpot brand palette ──────────────────────────────────
        // "Logo DNA" tokens: terracotta + scotch-bonnet + plantain +
        // yam + pot/kente accents. The brand brief replaced the entire
        // colours block, but we keep shadcn's HSL semantic tokens
        // (background/foreground/card/...) intact below - those are the
        // mechanism the rest of the app + @feastpot/ui consume, so
        // wholesale replacement would break unrelated components.
        brand: {
          // 2026-05-16 PWA redesign - wireframe palette. Brand green is
          // the new primary CTA (was terracotta orange). Cascades to
          // every `bg-brand` / `text-brand` / `border-brand` consumer
          // across apps/web - no per-file edit needed.
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
        scotch: '#E30613', // wireframe red - offers, discounts, urgent
        plantain: '#F6B400', // wireframe gold - rewards, FeastPass, highlights
        yam: '#00843D', // FSA, halal, verified - collapses to brand green
        pot: '#5F5E5A', // neutral decorative
        cream: {
          DEFAULT: '#FFFDF7', // wireframe cream - main background
          warm: '#FFF8E8', // section dividers, card bg
          deep: '#F2EAD3', // stronger contrast for borders
        },
        charcoal: {
          DEFAULT: '#1C1C1A',
          mid: '#5F5E5A',
          light: '#9B9894',
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
        // Vendor-portal accent (used for vendor-related chips/badges in the
        // customer app - e.g. "View vendor" links).
        vendor: '#185FA5',

        // Legacy neutral aliases retained for back-compat - many existing
        // components use bg-surface/text-mid/text-dark. We rewire them to
        // the new cream + charcoal scale so the rebrand cascades without
        // touching every consumer file.
        dark: '#1C1C1A',
        mid: '#5F5E5A',
        surface: '#FBF6EF',

        // shadcn/ui semantic tokens - bound to CSS vars in globals.css.
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
      fontFamily: {
        // `--font-inter` / `--font-playfair` are emitted by next/font in
        // apps/web/src/app/layout.tsx so the families resolve to the
        // self-hosted, preloaded woff2 (no Google Fonts request).
        sans: ['var(--font-inter)', 'Inter', ...defaultTheme.fontFamily.sans],
        display: ['var(--font-playfair)', '"Playfair Display"', 'Georgia', 'serif'],
      },
      boxShadow: {
        card: '0 1px 4px 0 rgba(28,28,26,0.08), 0 4px 16px 0 rgba(28,28,26,0.04)',
        'card-lg': '0 4px 24px 0 rgba(28,28,26,0.10)',
        sticky: '0 -2px 16px 0 rgba(28,28,26,0.08)',
      },
      animation: {
        'fade-up': 'fadeUp 0.3s ease-out',
        'slide-up': 'slideUp 0.25s ease-out',
        'pulse-dot': 'pulseDot 2s infinite',
        'count-up': 'countUp 0.4s ease-out',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        pulseDot: {
          '0%,100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.6', transform: 'scale(1.15)' },
        },
        countUp: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
