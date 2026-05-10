import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';

import { ToastProvider, ToastViewport } from '@feastpot/ui';

import { CookieBanner } from '@/components/cookie-banner';
import { BottomNav } from '@/components/layout/bottom-nav';
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
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
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
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <QueryProvider>
          <ToastProvider>
            <TopNav />
            {children}
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
