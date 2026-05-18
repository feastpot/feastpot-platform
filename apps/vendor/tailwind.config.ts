import type { Config } from 'tailwindcss';
import defaultTheme from 'tailwindcss/defaultTheme';

/**
 * Tailwind config for @feastpot/vendor.
 *
 * Mirrors apps/web's brand-token layer so the same authoring conventions
 * apply across the customer PWA and the vendor portal:
 *   - `bg-brand` / `bg-teal` / `bg-vendor` resolve to literal hex via the
 *     `brand` / `teal` / `vendor` colour scales below (don't go through
 *     the shadcn HSL var layer for these - those are reserved for neutral
 *     semantic tokens).
 *   - `text-dark` / `text-mid` / `bg-surface` are mobile-only utility
 *     neutrals that match the customer app's tokens.
 *
 * The shadcn HSL `--primary` is wired to vendor blue in globals.css since
 * the vendor portal's dominant accent is blue, NOT brand orange.
 */
const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx,mdx}', '../../packages/ui/src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1rem' },
    extend: {
      colors: {
        // Feastpot brand palette - full scales for variants. Brand orange
        // remains available for revenue/critical-accept actions.
        brand: {
          DEFAULT: '#E8520A',
          light: '#FEF0E9',
          dark: '#B33D07',
          50: '#FEF0E9',
          100: '#FDD8C4',
          500: '#E8520A',
          600: '#C94308',
          700: '#B33D07',
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

        // Mobile-only neutrals - same set as the customer app so cross-app
        // copy/paste of components is safe.
        dark: '#1C1C1A',
        mid: '#5F5E5A',
        surface: '#F8F7F5',

        // shadcn/ui semantic tokens - bound to CSS vars in globals.css.
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
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
      },
      fontFamily: { sans: ['Inter var', ...defaultTheme.fontFamily.sans] },
      boxShadow: {
        card: '0 1px 4px 0 rgba(28,28,26,0.08), 0 4px 16px 0 rgba(28,28,26,0.04)',
        'card-lg': '0 4px 24px 0 rgba(28,28,26,0.10)',
        sticky: '0 -2px 16px 0 rgba(28,28,26,0.08)',
      },
      keyframes: {
        'pulse-dot': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.6', transform: 'scale(1.3)' },
        },
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'pulse-dot': 'pulse-dot 1.4s ease-in-out infinite',
        'fade-up': 'fadeUp 0.3s ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
