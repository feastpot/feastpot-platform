import * as React from 'react';

import { cn } from '../lib/cn';

export interface BottomNavItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  onSelect?: () => void;
}

export interface BottomNavProps extends React.HTMLAttributes<HTMLElement> {
  items: BottomNavItem[];
}

export function BottomNav({ items, className, ...props }: BottomNavProps): React.ReactElement {
  return (
    <nav
      className={cn(
        'fixed bottom-0 inset-x-0 z-40 border-t bg-background/95 backdrop-blur md:hidden',
        className,
      )}
      {...props}
    >
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {items.map((item) => (
          <li key={item.key}>
            <button
              type="button"
              onClick={item.onSelect}
              className={cn(
                'flex h-14 w-full flex-col items-center justify-center gap-0.5 text-xs',
                item.active ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
