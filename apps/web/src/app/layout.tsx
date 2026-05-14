import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';

import { ToastProvider, ToastViewport } from '@feastpot/ui';

import { CookieBanner } from '@/components/cookie-banner';
import { BottomNav } from '@/components/layout/bottom-nav';
import { Footer } from '@/components/layout/footer';
import { TopNav } from '@/components/layout/top-nav';
import { PushPermissionPrompt } from '@/components/push-permission-prompt';
import { QueryProvider } from '@/providers/query-provider';

import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://feastpot.co.uk'),
  title: {
    default: 'Feastpot — African & Caribbean Food Delivered',
    template: '%s | Feastpot',
  },
  description:
    'Order authentic African and Caribbean food in bulk. Party trays, family portions, weekly meal prep. Delivered in London.',
  manifest: '/manifest.json',
  applicationName: 'Feastpot',
  appleWebApp: {
    capable: true,
    title: 'Feastpot',
    statusBarStyle: 'default',
  },
  icons: {
    // /favicon.ico (multi-size 16/32/48 .ico) is the legacy fallback for
    // older browsers / RSS readers / Slack link unfurls that don't honour
    // the PNG <link rel="icon"> tags below. Listed first so user agents
    // that walk the array in order pick up the .ico without us having to
    // also drop a file at /favicon.ico (Next 15 still serves it from
    // public/ but having it in metadata is the canonical signal).
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
  openGraph: {
    type: 'website',
    siteName: 'Feastpot',
    locale: 'en_GB',
    // OG image is generated dynamically by app/opengraph-image.tsx — Next 15
    // auto-injects the correct <meta og:image> tag for every route. Per-vendor
    // pages override it with their own app/vendors/[slug]/opengraph-image.tsx.
  },
  twitter: {
    card: 'summary_large_image',
    site: '@feastpot',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#E8520A',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-GB" className={inter.variable}>
      <body className="min-h-screen bg-surface font-sans text-foreground antialiased">
        {/* WCAG 2.4.1 skip link — first focusable element on every page
            so AT/keyboard users can bypass the persistent top-nav and
            jump straight into the route's content. Visually hidden by
            default, slides into view on focus (see .skip-link in
            globals.css). */}
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <QueryProvider>
          <ToastProvider>
            <TopNav />
            <main
              id="main-content"
              className="page-content mx-auto max-w-lg sm:max-w-2xl md:max-w-4xl lg:max-w-5xl"
            >
              {children}
            </main>
            {/* Footer self-hides on /checkout and the (auth) routes
                via usePathname(). Rendered before BottomNav so the
                fixed bottom-nav still sits visually on top. */}
            <Footer />
            <BottomNav />
            <PushPermissionPrompt />
            <CookieBanner />
            <ToastViewport />
          </ToastProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
