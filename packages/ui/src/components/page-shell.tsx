import * as React from 'react';

import { cn } from '../lib/cn';

export interface PageShellProps extends React.HTMLAttributes<HTMLDivElement> {
  header?: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
}

const widthMap = {
  sm: 'max-w-2xl',
  md: 'max-w-4xl',
  lg: 'max-w-6xl',
  xl: 'max-w-7xl',
  full: 'max-w-none',
} as const;

export function PageShell({
  header,
  footer,
  maxWidth = 'lg',
  className,
  children,
  ...props
}: PageShellProps): React.ReactElement {
  return (
    <div className={cn('flex min-h-screen flex-col bg-background text-foreground', className)} {...props}>
      {header}
      <main className={cn('mx-auto w-full flex-1 px-4 py-6 sm:px-6 lg:px-8', widthMap[maxWidth])}>
        {children}
      </main>
      {footer}
    </div>
  );
}
