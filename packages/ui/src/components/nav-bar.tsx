import * as React from 'react';

import { cn } from '../lib/cn';

export interface NavBarProps extends React.HTMLAttributes<HTMLElement> {
  brand?: React.ReactNode;
  actions?: React.ReactNode;
}

export function NavBar({
  brand,
  actions,
  className,
  children,
  ...props
}: NavBarProps): React.ReactElement {
  return (
    <header
      className={cn('sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur', className)}
      {...props}
    >
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 font-semibold">{brand}</div>
        <nav className="flex items-center gap-4 text-sm">{children}</nav>
        <div className="flex items-center gap-2">{actions}</div>
      </div>
    </header>
  );
}
