import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-semibold tracking-[0.005em] transition-[background-color,box-shadow,transform,color,border-color] duration-150 ease-out disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-sm hover:bg-red-700 hover:shadow-md active:bg-red-800 active:shadow-xs active:translate-y-px',
        destructive:
          'bg-destructive text-destructive-foreground shadow-sm hover:bg-red-700 active:bg-red-800',
        outline:
          'border border-border bg-card text-foreground shadow-xs hover:bg-muted hover:border-ink-300 active:translate-y-px',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-ink-200 active:bg-ink-300',
        ghost:
          'text-foreground hover:bg-muted hover:text-foreground active:bg-ink-200',
        link: 'text-primary underline-offset-4 hover:underline focus-visible:ring-offset-0',
        success:
          'bg-success text-success-foreground shadow-sm hover:opacity-90 active:translate-y-px',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3 text-xs',
        lg: 'h-11 rounded-lg px-6 text-base',
        xl: 'h-14 rounded-xl px-8 text-lg', // POS/KDS botones de tap grande
        icon: 'h-10 w-10 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
