'use client';

import { FormField, Money, NumberInput } from '@pos-tercos/ui';

export function CashSection({
  total,
  cashReceived,
  onChange,
}: {
  total: number;
  cashReceived: number | null;
  onChange: (v: number | null) => void;
}) {
  const cashNum = cashReceived ?? 0;
  const changeDue = Math.max(0, cashNum - total);

  return (
    <div className="space-y-3 rounded-xl bg-muted/40 p-4">
      <FormField label="Recibido">
        <NumberInput
          value={cashReceived}
          onChange={onChange}
          prefix="$"
          min={0}
          placeholder={total.toString()}
          autoFocus
        />
      </FormField>
      <div className="flex items-center justify-between border-t border-border pt-3">
        <span className="text-sm text-muted-foreground">Cambio</span>
        <Money
          amount={changeDue}
          size="xl"
          weight="bold"
          className={cashNum >= total ? 'text-success' : 'text-ink-300'}
        />
      </div>
    </div>
  );
}
