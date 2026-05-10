import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';

import { ToastProvider, ToastViewport } from '@feastpot/ui';

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
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
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
            <PushPermissionPrompt />
            <ToastViewport />
          </ToastProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
