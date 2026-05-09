import { Loader2 } from 'lucide-react';
import * as React from 'react';

import { cn } from '../lib/cn';

export interface LoadingSpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}

const sizeMap = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-10 w-10' } as const;

export function LoadingSpinner({
  size = 'md',
  label,
  className,
  ...props
}: LoadingSpinnerProps): React.ReactElement {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('flex items-center justify-center gap-2 text-muted-foreground', className)}
      {...props}
    >
      <Loader2 className={cn('animate-spin', sizeMap[size])} />
      {label ? <span className="text-sm">{label}</span> : <span className="sr-only">Loading…</span>}
    </div>
  );
}
