'use client';

import { Input, Label, NumberInput } from '@pos-tercos/ui';

function parseNum(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

interface NumFieldProps {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  /** Monto en COP: muestra separadores de miles ($ 100.000) y fuerza enteros. */
  money?: boolean;
  disabled?: boolean;
}

export function NumField({ id, label, value, onChange, money, disabled }: NumFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {money ? (
        <NumberInput
          id={id}
          value={value || null}
          onChange={(v) => onChange(v ?? 0)}
          prefix="$"
          grouping
          min={0}
          disabled={disabled}
        />
      ) : (
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          step="any"
          min="0"
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(parseNum(e.target.value))}
        />
      )}
    </div>
  );
}
