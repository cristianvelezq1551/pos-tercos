'use client';

export function CheckoutBanners({ offline }: { offline: boolean }) {
  return (
    <>
      {offline ? (
        <p className="rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-sm font-semibold text-warning">
          Sin conexión — esta venta se cobra <strong>offline</strong> y se sincroniza
          sola al volver la red. El recibo sale con número provisional (OFF-N).
        </p>
      ) : null}
      <p className="rounded-md border border-border bg-muted/60 px-3 py-2 text-sm font-medium text-foreground">
        📋 Repasá el pedido en voz alta con el cliente antes de cobrar. La comanda
        y la factura se imprimen al confirmar el pago.
      </p>
    </>
  );
}
