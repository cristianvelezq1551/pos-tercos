'use client';

import type { Invoice } from '@pos-tercos/types';
import { Badge, formatCop } from '@pos-tercos/ui';
import { CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { InvoicePaymentActions } from './InvoicePaymentActions';

/** Sección de "Pago al proveedor" en /invoices/[id]. Wrapper client-side
 *  porque InvoicePaymentActions abre diálogos + refresca al cambiar. */
export function InvoicePaymentSection({
  invoice,
  canManage,
  canViewProof,
}: {
  invoice: Invoice;
  /** Puede marcar pagada / desmarcar (Dueño o el admin que creó la factura). */
  canManage: boolean;
  /** Puede ver el comprobante (cualquier admin). */
  canViewProof: boolean;
}) {
  const router = useRouter();
  const refresh = (): void => router.refresh();

  if (invoice.status !== 'CONFIRMED' || invoice.paymentStatus === null) {
    return null;
  }

  const isPaid = invoice.paymentStatus === 'PAID';
  const paidAtLabel = invoice.paidAt
    ? new Date(invoice.paidAt).toLocaleDateString('es-CO', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : null;
  const pocketLabel =
    invoice.paymentPocket === 'EFECTIVO'
      ? 'Efectivo'
      : invoice.paymentPocket === 'CUENTA'
        ? 'Cuenta (transferencia)'
        : invoice.paymentPocket === 'MIXTO'
          ? `Mixto — ${formatCop(invoice.paymentCashAmount ?? 0)} efectivo · ${formatCop(invoice.paymentBankAmount ?? 0)} cuenta`
          : null;

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Pago al proveedor
          </h2>
          <div className="mt-2 flex flex-wrap items-baseline gap-2">
            {isPaid ? (
              <Badge tone="success" size="sm">
                <CheckCircle2 className="mr-1 h-3 w-3" /> Pagada
              </Badge>
            ) : (
              <Badge tone="warning" size="sm">Por pagar</Badge>
            )}
            <span className="text-lg font-semibold tabular-nums text-foreground">
              {formatCop(invoice.total ?? 0)}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {isPaid
              ? `Pagada el ${paidAtLabel}${invoice.paymentActorName ? ` por ${invoice.paymentActorName}` : ''}${pocketLabel ? ` · ${pocketLabel}` : ''}${invoice.paymentNote ? ` · ${invoice.paymentNote}` : ''}`
              : 'Subí el comprobante de la transferencia para marcarla pagada y sacarla de la lista de pendientes.'}
          </p>
        </div>
        {canManage || canViewProof ? (
          <InvoicePaymentActions
            invoice={invoice}
            onChanged={refresh}
            canManage={canManage}
            canViewProof={canViewProof}
          />
        ) : null}
      </div>
    </section>
  );
}
