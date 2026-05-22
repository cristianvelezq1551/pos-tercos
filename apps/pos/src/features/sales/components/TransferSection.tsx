'use client';

import { Checkbox, formatCop } from '@pos-tercos/ui';

/**
 * Verificación de pago por transferencia: un solo checkbox. El monto siempre
 * es el total exacto, así que no hace falta re-teclearlo — el cajero confirma
 * que vio la transferencia en la app del banco.
 */
export function TransferSection({
  total,
  verified,
  onVerified,
}: {
  total: number;
  verified: boolean;
  onVerified: (v: boolean) => void;
}) {
  return (
    <div className="rounded-xl bg-muted/40 p-4">
      <Checkbox
        checked={verified}
        onChange={(e) => onVerified(e.target.checked)}
        label={`Confirmo que la transferencia de ${formatCop(total)} llegó a la cuenta`}
        description="Verificá en la app del banco antes de confirmar."
      />
    </div>
  );
}
