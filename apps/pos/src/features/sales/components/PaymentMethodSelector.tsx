'use client';

import type { PaymentMethod } from '@pos-tercos/types';
import { cn } from '@pos-tercos/ui';

const METHODS: { method: PaymentMethod; label: string }[] = [
  { method: 'CASH', label: 'Efectivo' },
  { method: 'NEQUI', label: 'Nequi' },
  { method: 'DAVIPLATA', label: 'DaviPlata' },
  { method: 'QR_BANCOLOMBIA', label: 'QR Bancolombia' },
  { method: 'TRANSFER', label: 'Transferencia' },
];

export function PaymentMethodSelector({
  selected,
  onSelect,
}: {
  selected: PaymentMethod | null;
  onSelect: (method: PaymentMethod) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {METHODS.map((m) => (
        <button
          key={m.method}
          type="button"
          onClick={() => onSelect(m.method)}
          className={cn(
            'rounded-lg border px-3 py-3 text-sm font-semibold transition-[background-color,border-color,box-shadow] duration-150 ease-out',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            selected === m.method
              ? 'border-primary bg-destructive/10 text-primary shadow-xs'
              : 'border-border bg-card text-foreground hover:border-ink-300 hover:bg-muted/40',
            'motion-reduce:transition-none',
          )}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
