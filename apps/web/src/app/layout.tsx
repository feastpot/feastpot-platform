import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';

import { ToastProvider, ToastViewport } from '@feastpot/ui';

import { BottomNav } from '@/components/layout/bottom-nav';
import { TopNav } from '@/components/layout/top-nav';
import { QueryProvider } from '@/providers/query-provider';

import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'Feastpot', template: '%s · Feastpot' },
  description: 'UK diaspora bulk food marketplace.',
  manifest: '/manifest.json',
  applicationName: 'Feastpot',
  appleWebApp: {
    capable: true,
    title: 'Feastpot',
    statusBarStyle: 'default',
  },
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
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
            <ToastViewport />
          </ToastProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
