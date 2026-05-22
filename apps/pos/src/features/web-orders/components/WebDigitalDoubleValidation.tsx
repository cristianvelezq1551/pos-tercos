'use client';

import { Checkbox, FormField, NumberInput } from '@pos-tercos/ui';

export function WebDigitalDoubleValidation({
  digital1,
  digital2,
  doubleVerified,
  onDigital1,
  onDigital2,
  onDoubleVerified,
}: {
  digital1: number | null;
  digital2: number | null;
  doubleVerified: boolean;
  onDigital1: (v: number | null) => void;
  onDigital2: (v: number | null) => void;
  onDoubleVerified: (v: boolean) => void;
}) {
  return (
    <div className="space-y-3 rounded-xl bg-muted/40 p-4">
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Monto 1">
          <NumberInput value={digital1} onChange={onDigital1} prefix="$" autoFocus />
        </FormField>
        <FormField label="Monto 2">
          <NumberInput value={digital2} onChange={onDigital2} prefix="$" />
        </FormField>
      </div>
      <Checkbox
        checked={doubleVerified}
        onChange={(e) => onDoubleVerified(e.target.checked)}
        label="Verifiqué app del negocio + comprobante del cliente"
      />
    </div>
  );
}
