'use client';

import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '@pos-tercos/types';
import { cn } from '@pos-tercos/ui';

/** Botonera de métodos HABILITADOS por el admin (medios de pago configurables). */
export function PaymentMethodSelector({
  methods,
  selected,
  onSelect,
}: {
  methods: readonly PaymentMethod[];
  selected: PaymentMethod | null;
  onSelect: (method: PaymentMethod) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {methods.map((method) => (
        <button
          key={method}
          type="button"
          onClick={() => onSelect(method)}
          className={cn(
            'rounded-lg border px-3 py-3 text-sm font-semibold transition-[background-color,border-color,box-shadow] duration-150 ease-out',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            selected === method
              ? 'border-primary bg-destructive/10 text-primary shadow-xs'
              : 'border-border bg-card text-foreground hover:border-ink-300 hover:bg-muted/40',
            'motion-reduce:transition-none',
          )}
        >
          {PAYMENT_METHOD_LABELS[method]}
        </button>
      ))}
    </div>
  );
}
