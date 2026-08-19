'use client';

import type { PaymentMethod, PaymentMethodSetting } from '@pos-tercos/types';
import { NumberInput, cn } from '@pos-tercos/ui';
import { X } from 'lucide-react';

export interface Part {
  method: PaymentMethod;
  amount: number | null;
}

/**
 * Fila de una parte del pago: chips de método + monto + quitar. Con una sola
 * parte el monto queda bloqueado (cubre el total) y no se puede quitar.
 */
export function PaymentPartRow({
  part,
  index,
  methods,
  pending,
  single,
  onMethodChange,
  onAmountChange,
  onRemove,
}: {
  part: Part;
  index: number;
  methods: readonly PaymentMethodSetting[];
  pending: boolean;
  single: boolean;
  onMethodChange: (method: PaymentMethod) => void;
  onAmountChange: (value: number | null) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-1 flex-wrap gap-1">
        {methods.map((m) => (
          <button
            key={m.code}
            type="button"
            disabled={pending}
            onClick={() => onMethodChange(m.code)}
            aria-pressed={part.method === m.code}
            className={cn(
              'rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors',
              part.method === m.code
                ? 'border-primary bg-destructive/10 text-primary'
                : 'border-border bg-card text-muted-foreground hover:bg-muted/40',
            )}
          >
            {m.name}
          </button>
        ))}
      </div>
      <NumberInput
        value={part.amount}
        onChange={onAmountChange}
        prefix="$"
        grouping
        min={0}
        placeholder="Monto"
        disabled={pending || single}
        className="w-32 shrink-0"
        aria-label={`Monto de la parte ${index + 1}`}
      />
      <button
        type="button"
        disabled={pending || single}
        onClick={onRemove}
        aria-label={`Quitar parte ${index + 1}`}
        className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive disabled:opacity-30"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}
