'use client';

import { Minus, Plus } from 'lucide-react';

/** Stepper de cantidad (mínimo 1). */
export function PickerQuantity({
  quantity,
  onChange,
}: {
  quantity: number;
  onChange: (q: number) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-sm font-medium text-foreground">Cantidad</p>
      <div className="inline-flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(Math.max(1, quantity - 1))}
          disabled={quantity <= 1}
          aria-label="Quitar uno"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-muted disabled:opacity-30"
        >
          <Minus className="h-4 w-4" strokeWidth={2} />
        </button>
        <span className="w-8 text-center text-base font-semibold tabular-nums text-foreground">
          {quantity}
        </span>
        <button
          type="button"
          onClick={() => onChange(quantity + 1)}
          aria-label="Sumar uno"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-muted"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
