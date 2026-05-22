'use client';

import { Checkbox, FormField, NumberInput, cn, formatCop } from '@pos-tercos/ui';

export function DigitalSection({
  total,
  digital1,
  digital2,
  doubleVerified,
  onDigital1,
  onDigital2,
  onDoubleVerified,
}: {
  total: number;
  digital1: number | null;
  digital2: number | null;
  doubleVerified: boolean;
  onDigital1: (v: number | null) => void;
  onDigital2: (v: number | null) => void;
  onDoubleVerified: (v: boolean) => void;
}) {
  const d1 = digital1 ?? 0;
  const d2 = digital2 ?? 0;

  return (
    <div className="space-y-3 rounded-xl bg-muted/40 p-4">
      <p className="text-xs text-muted-foreground">
        Doble validación: ingresa el monto cobrado <strong>dos veces</strong>. El total
        debe coincidir exactamente con la venta.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Monto 1">
          <NumberInput
            value={digital1}
            onChange={onDigital1}
            prefix="$"
            min={0}
            autoFocus
          />
        </FormField>
        <FormField label="Monto 2 (verificación)">
          <NumberInput value={digital2} onChange={onDigital2} prefix="$" min={0} />
        </FormField>
      </div>
      {d1 > 0 && d2 > 0 ? (
        <p
          className={cn(
            'text-xs font-medium',
            d1 === d2 && d1 === total ? 'text-success' : 'text-warning',
          )}
        >
          {d1 === d2 && d1 === total
            ? '✓ Montos coinciden y matchean el total'
            : d1 !== d2
              ? '✗ No coinciden entre sí'
              : `✗ No matchean total ${formatCop(total)}`}
        </p>
      ) : null}
      <Checkbox
        checked={doubleVerified}
        onChange={(e) => onDoubleVerified(e.target.checked)}
        label="Verifiqué el monto en la app del negocio y en el comprobante del cliente"
        description="Nequi / DaviPlata / Bancolombia"
      />
    </div>
  );
}
