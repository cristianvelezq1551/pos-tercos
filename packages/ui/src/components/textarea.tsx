import * as React from 'react';
import { cn } from '../lib/utils';

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, rows = 4, ...rest }, ref) => (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(
        'flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground transition-colors duration-150 ease-out',
        'placeholder:text-muted-foreground',
        'hover:border-ink-400',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:border-primary',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/30',
        'motion-reduce:transition-none',
        'resize-y min-h-[80px]',
        className,
      )}
      {...rest}
    />
  ),
);
Textarea.displayName = 'Textarea';
