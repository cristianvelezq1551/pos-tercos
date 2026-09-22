import { comprobantesDe, type FinancePaidInvoice } from '@pos-tercos/types';
import { Money } from '@pos-tercos/ui';
import Link from 'next/link';
import { PocketBadge } from '../../../components/PocketBadge';
import { EmptyHint } from './EmptyHint';
import { invoicePaymentProofUrl } from '../../invoices';
import { ProofMark } from './ProofMark';
import { formatShortDate } from './format-short-date';

export function PaidInvoicesCard({ rows }: { rows: FinancePaidInvoice[] }) {
  const total = rows.reduce((a, r) => a + r.total, 0);
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <header className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="font-semibold text-foreground">Facturas pagadas</h3>
        <Money amount={total} weight="bold" />
      </header>
      {rows.length === 0 ? (
        <EmptyHint text="Sin pagos a proveedores registrados este mes." />
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.invoiceId} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
              <Link href={`/invoices/${r.invoiceId}`} className="min-w-0 hover:underline">
                <p
                  className="truncate text-sm font-medium text-foreground"
                  title={r.supplierName ?? 'Proveedor sin nombre'}
                >
                  {r.supplierName ?? 'Proveedor sin nombre'}
                </p>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span
                    className="truncate"
                    title={`${r.invoiceNumber ?? 'sin nº'} · pagada ${formatShortDate(r.paidAt)}`}
                  >
                    {r.invoiceNumber ?? 'sin nº'} · pagada {formatShortDate(r.paidAt)}
                  </span>
                  <PocketBadge pago={r} />
                </p>
              </Link>
              <div className="flex shrink-0 items-center gap-2">
                <Money amount={r.total} weight="semibold" />
                <ProofMark
                  count={comprobantesDe(r)}
                  title="Comprobante del pago al proveedor"
                  description={`${r.supplierName ?? 'Proveedor sin nombre'} · ${r.invoiceNumber ?? 'sin nº'}`}
                  proofUrl={(i) => invoicePaymentProofUrl(r.invoiceId, i)}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
