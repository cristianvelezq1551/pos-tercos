'use client';

import { IconButton, Money, cn } from '@pos-tercos/ui';
import { Gift, Minus, Plus, X } from 'lucide-react';
import type { CartLine } from '../lib/cart-types';

export function CartLineRow({
  line,
  lineSubtotal,
  lineDiscount,
  lineTotal,
  hasPromo,
  onQty,
  onRemove,
  onNotes,
  onCortesia,
}: {
  line: CartLine;
  lineSubtotal: number;
  lineDiscount: number;
  lineTotal: number;
  hasPromo: boolean;
  onQty: (qty: number) => void;
  onRemove: () => void;
  onNotes: (notes: string) => void;
  onCortesia: () => void;
}) {
  const description = [line.size?.name, ...line.modifiers.map((m) => m.name)]
    .filter(Boolean)
    .join(' · ');

  return (
    <li className="px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{line.productName}</p>
          {description ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          ) : null}
          <p className="mt-1 text-xs text-muted-foreground">
            <Money amount={line.unitPrice} size="xs" weight="normal" className="text-current" /> c/u
          </p>
        </div>
        <div className="flex shrink-0 items-center">
          <IconButton
            aria-label="Marcar como cortesía"
            title="Cortesía (regalar esta línea)"
            variant="ghost"
            size="sm"
            onClick={onCortesia}
            className="text-ink-400 hover:text-primary"
          >
            <Gift className="h-4 w-4" strokeWidth={1.75} />
          </IconButton>
          <IconButton
            aria-label="Quitar línea"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="-mr-1 text-ink-400 hover:text-destructive"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </IconButton>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <div className="inline-flex items-center rounded-lg border border-border">
          <button
            type="button"
            onClick={() => onQty(line.quantity - 1)}
            disabled={line.quantity <= 1}
            className="inline-flex h-8 w-8 items-center justify-center text-ink-600 transition-colors hover:bg-muted/40 disabled:opacity-30"
            aria-label="Restar uno"
          >
            <Minus className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
          <span className="w-8 text-center text-sm font-semibold tabular text-foreground">
            {line.quantity}
          </span>
          <button
            type="button"
            onClick={() => onQty(line.quantity + 1)}
            className="inline-flex h-8 w-8 items-center justify-center text-ink-600 transition-colors hover:bg-muted/40"
            aria-label="Sumar uno"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        </div>
        <div className="text-right">
          {hasPromo ? (
            <>
              <span className="mr-1.5 text-xs text-ink-400 line-through tabular">
                <Money amount={lineSubtotal} size="xs" weight="normal" className="text-current" />
              </span>
              <Money
                amount={lineTotal}
                weight="bold"
                className={cn('text-success')}
              />
              <span className="block text-[10px] font-medium text-success">
                −<Money amount={lineDiscount} size="xs" weight="normal" className="text-current" /> promo
              </span>
            </>
          ) : (
            <Money amount={lineSubtotal} weight="semibold" />
          )}
        </div>
      </div>
      <input
        type="text"
        value={line.notes ?? ''}
        onChange={(e) => onNotes(e.target.value)}
        placeholder="Nota para cocina (ej. sin cebolla)"
        maxLength={200}
        className="mt-2 w-full rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
      />
    </li>
  );
}
