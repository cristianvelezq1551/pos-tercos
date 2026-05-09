import type { ReactNode } from 'react';
import { cn } from '../lib/utils';

export type OrderHeroTone = 'ready' | 'preparing';

export interface OrderHeroProps {
  receiptNumber: number;
  customerName: string | null;
  tone?: OrderHeroTone;
  /** Slot derecho — pensado para `<ProductThumbStack>`. */
  thumbs?: ReactNode;
  className?: string;
}

const TONE_LABEL: Record<OrderHeroTone, string> = {
  ready: 'Listo para recoger',
  preparing: 'Preparando tu pedido',
};

const TONE_COLOR: Record<OrderHeroTone, string> = {
  ready: 'text-success',
  preparing: 'text-muted-foreground',
};

/**
 * Bloque hero del pedido visible. Pensado para TV de 50": número render
 * gigante + nombre del cliente + thumb-stack opcional a la derecha.
 * Sin estado, sin lógica — composición pura. Server Component-ready.
 */
export function OrderHero({
  receiptNumber,
  customerName,
  tone = 'ready',
  thumbs,
  className,
}: OrderHeroProps) {
  return (
    <section
      className={cn(
        'relative flex w-full items-center justify-between gap-12 rounded-[2rem] border border-border bg-card px-16 py-14 shadow-xl',
        tone === 'ready' && 'border-success/40',
        className,
      )}
    >
      <div className="flex min-w-0 flex-col">
        <span
          className={cn(
            'caps font-display text-2xl font-extrabold tracking-[0.45em]',
            TONE_COLOR[tone],
          )}
        >
          {TONE_LABEL[tone]}
        </span>
        <span
          className="mt-2 block font-display font-black leading-[0.9] tabular text-foreground"
          style={{ fontSize: 'clamp(8rem, 16vw, 16rem)' }}
        >
          #{receiptNumber}
        </span>
        {customerName ? (
          <span
            className="mt-6 block truncate font-display font-bold text-foreground"
            style={{ fontSize: 'clamp(2.5rem, 5vw, 5rem)' }}
            title={customerName}
          >
            {customerName}
          </span>
        ) : null}
      </div>

      {thumbs ? <div className="shrink-0">{thumbs}</div> : null}
    </section>
  );
}
