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
  /** Decimales del campo money. >0 desactiva los separadores de miles. */
  decimals?: number;
  /** Nota corta junto a la etiqueta (ej. "calculado"). */
  hint?: string;
  disabled?: boolean;
}

export function NumField({
  id,
  label,
  value,
  onChange,
  money,
  decimals = 0,
  hint,
  disabled,
}: NumFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="flex items-baseline gap-1.5">
        {label}
        {hint ? (
          <span className="text-[10px] font-normal text-muted-foreground">{hint}</span>
        ) : null}
      </Label>
      {money ? (
        <NumberInput
          id={id}
          value={value || null}
          onChange={(v) => onChange(v ?? 0)}
          prefix="$"
          grouping={decimals === 0}
          decimals={decimals}
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
