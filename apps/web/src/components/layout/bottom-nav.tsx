'use client';

import { Home, Search, ShoppingBag, User } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@feastpot/ui';

interface NavItem {
  href: string;
  label: string;
  Icon: typeof Home;
  /** Match if the current path equals or starts-with this prefix. */
  match: (path: string) => boolean;
}

const ITEMS: NavItem[] = [
  { href: '/', label: 'Home', Icon: Home, match: (p) => p === '/' },
  { href: '/search', label: 'Search', Icon: Search, match: (p) => p.startsWith('/search') },
  { href: '/orders', label: 'Orders', Icon: ShoppingBag, match: (p) => p.startsWith('/orders') },
  { href: '/account', label: 'Account', Icon: User, match: (p) => p.startsWith('/account') },
];

/**
 * Fixed bottom navigation (mobile primary). Driven off `usePathname()` so the
 * active state survives client-side route changes without a re-render hack.
 */
export function BottomNav() {
  const pathname = usePathname() ?? '/';

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-4">
        {ITEMS.map(({ href, label, Icon, match }) => {
          const active = match(pathname);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-16 flex-col items-center justify-center gap-1 text-xs',
                  active ? 'text-brand' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-5 w-5" aria-hidden />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
