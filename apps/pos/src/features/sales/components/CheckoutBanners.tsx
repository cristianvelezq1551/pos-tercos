'use client';

import type { ComandaState } from '../hooks/useCheckoutSale';

export function CheckoutBanners({
  offline,
  comandaState,
}: {
  offline: boolean;
  comandaState: ComandaState;
}) {
  return (
    <>
      {offline ? (
        <p className="rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-sm font-semibold text-warning">
          Sin conexión — esta venta se cobra <strong>offline</strong> y se sincroniza
          sola al volver la red. El recibo sale con número provisional (OFF-N).
        </p>
      ) : null}
      <p className="rounded-md border border-border bg-muted/60 px-3 py-2 text-sm font-medium text-foreground">
        📋 Repasá el pedido en voz alta con el cliente antes de cobrar.
      </p>
      {comandaState === 'ok' ? (
        <p className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-xs font-medium text-success">
          ✓ Comanda enviada a cocina
        </p>
      ) : comandaState === 'error' ? (
        <p className="rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-xs font-medium text-warning">
          La comanda no se imprimió (¿print-agent apagado?). La venta sigue
          normal — avisale a cocina de palabra.
        </p>
      ) : null}
    </>
  );
}
