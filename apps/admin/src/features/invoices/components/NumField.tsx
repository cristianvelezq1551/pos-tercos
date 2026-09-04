'use client';

import { Label, NumberInput } from '@pos-tercos/ui';

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
        // La cantidad de una factura no es entera: "6,17 kg" es lo normal.
        // 4 decimales es lo que guarda el inventario.
        <NumberInput
          id={id}
          value={value || null}
          onChange={(v) => onChange(v ?? 0)}
          decimals={4}
          min={0}
          disabled={disabled}
        />
      )}
    </div>
  );
}
