import * as React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'default', className = '', ...props }, ref) => {
    return <button ref={ref} data-variant={variant} className={className} {...props} />;
  },
);
Button.displayName = 'Button';
