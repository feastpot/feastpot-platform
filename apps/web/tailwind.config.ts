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
 * `content` covers BOTH this app's source AND the shared UI package — Tailwind
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
        // (background/foreground/card/...) intact below — those are the
        // mechanism the rest of the app + @feastpot/ui consume, so
        // wholesale replacement would break unrelated components.
        brand: {
          DEFAULT: '#E8520A', // Terracotta Flame — primary CTAs
          light: '#FEF0E9',
          dark: '#C8401F', // Scotch Bonnet Red — hover state
          50: '#FEF0E9',
          100: '#FDD8C4',
          500: '#E8520A',
          600: '#C8401F',
          700: '#B33D07',
          900: '#7A2610',
        },
        scotch: '#C8401F', // spice indicators, urgent
        plantain: '#F5A52A', // rewards, highlights
        yam: '#3D7A47', // FSA, halal, verified
        pot: '#8B5E3C', // tribal patterns, decorative
        cream: {
          DEFAULT: '#FBF6EF', // main background — warmer than white
          warm: '#F5EDE0', // section dividers, card bg
          deep: '#EDE4D4', // stronger contrast for borders
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
        // customer app — e.g. "View vendor" links).
        vendor: '#185FA5',

        // Legacy neutral aliases retained for back-compat — many existing
        // components use bg-surface/text-mid/text-dark. We rewire them to
        // the new cream + charcoal scale so the rebrand cascades without
        // touching every consumer file.
        dark: '#1C1C1A',
        mid: '#5F5E5A',
        surface: '#FBF6EF',

        // shadcn/ui semantic tokens — bound to CSS vars in globals.css.
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
        sans: ['Inter var', 'Inter', ...defaultTheme.fontFamily.sans],
        // Display face — Playfair for cultural warmth on hero / headings.
        display: ['"Playfair Display"', 'Georgia', 'serif'],
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
