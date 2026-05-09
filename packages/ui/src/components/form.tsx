import * as React from 'react';

import { cn } from '../lib/cn';

export const Form = React.forwardRef<HTMLFormElement, React.FormHTMLAttributes<HTMLFormElement>>(
  ({ className, ...props }, ref) => (
    <form ref={ref} className={cn('space-y-4', className)} {...props} />
  ),
);
Form.displayName = 'Form';

export const FormField = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement => (
  <div className={cn('space-y-2', className)} {...props} />
);

export const FormLabel = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label ref={ref} className={cn('text-sm font-medium leading-none', className)} {...props} />
));
FormLabel.displayName = 'FormLabel';

export const FormMessage = ({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>): React.ReactElement | null =>
  children ? (
    <p className={cn('text-sm font-medium text-destructive', className)} {...props}>
      {children}
    </p>
  ) : null;
