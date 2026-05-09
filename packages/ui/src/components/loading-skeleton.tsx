import * as React from 'react';
import { cn } from '../lib/utils';

export type SkeletonShape = 'text' | 'card' | 'avatar' | 'table-row' | 'block';

export interface LoadingSkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  shape?: SkeletonShape;
  /** Cuántos rows/items renderizar. Default 1. */
  count?: number;
  /** Ancho/alto override. */
  width?: string;
  height?: string;
}

const SHAPE_CLASS: Record<SkeletonShape, string> = {
  text: 'h-4 w-full rounded',
  card: 'h-32 w-full rounded-2xl',
  avatar: 'h-8 w-8 rounded-full',
  'table-row': 'h-10 w-full rounded',
  block: 'h-20 w-full rounded-lg',
};

/**
 * Skeleton con shimmer warm-tinted (usa --color-muted + ink-200 como fases).
 * Para listas, pasar `count` (renderiza N).
 */
export const LoadingSkeleton = React.forwardRef<HTMLDivElement, LoadingSkeletonProps>(
  ({ shape = 'text', count = 1, width, height, className, style, ...rest }, ref) => {
    const items = Array.from({ length: count }, (_, i) => i);
    return (
      <div
        ref={ref}
        role="status"
        aria-label="Cargando…"
        aria-live="polite"
        aria-busy="true"
        className={cn(count > 1 && 'space-y-2', className)}
        {...rest}
      >
        {items.map((i) => (
          <div
            key={i}
            className={cn(
              'animate-pulse bg-gradient-to-r from-muted via-ink-200 to-muted bg-[length:400%_100%] motion-reduce:animate-none',
              SHAPE_CLASS[shape],
            )}
            style={{ width, height, ...style }}
          />
        ))}
        <span className="sr-only">Cargando…</span>
      </div>
    );
  },
);
LoadingSkeleton.displayName = 'LoadingSkeleton';
