import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError, serverFetchJson } from '../../../../../../lib/api-server';
import { SavedReconciliationDetailSchema, type SavedReconciliationDetail } from '@pos-tercos/types';
import { formatCop, formatDate } from '../../../../../../lib/format';
import { requireRole } from '../../../../../../lib/guards';

interface PageProps {
  params: Promise<{ id: string }>;
}

const SOURCE_LABEL: Record<string, string> = {
  NEQUI_CSV: 'Nequi (CSV)',
  BANCOLOMBIA_CSV: 'Bancolombia (CSV)',
};

export default async function SavedReconciliationDetailPage({ params }: PageProps) {
  // Reportes financieros: solo el Dueño (defensa en profundidad — el endpoint ya es @OnlyDueno).
  await requireRole(['DUENO']);
  const { id } = await params;
  let detail: SavedReconciliationDetail;
  try {
    detail = await serverFetchJson(
      `/reports/payment-reconciliation/history/${id}`,
      undefined,
      SavedReconciliationDetailSchema,
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const sospechas = detail.unmatchedCsv + detail.unmatchedSale;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/reports/reconciliation" className="text-sm text-primary hover:underline">
          ← Volver a reconciliación
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">
          {SOURCE_LABEL[detail.source] ?? detail.source} · {detail.periodFrom} → {detail.periodTo}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Importado el {formatDate(detail.createdAt, 'datetime')} por{' '}
          {detail.importedByName ?? '(eliminado)'}.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Filas CSV" value={String(detail.csvRowsParsed)} />
        <Stat label="Ventas POS" value={String(detail.posSalesEvaluated)} />
        <Stat label="Coinciden" value={String(detail.matched)} tone="good" />
        <Stat
          label="CSV sin POS"
          value={String(detail.unmatchedCsv)}
          tone={detail.unmatchedCsv > 0 ? 'bad' : 'muted'}
        />
        <Stat
          label="POS sin CSV"
          value={String(detail.unmatchedSale)}
          tone={detail.unmatchedSale > 0 ? 'warn' : 'muted'}
        />
      </div>

      {sospechas === 0 ? (
        <p className="rounded-md bg-success-bg/30 px-4 py-2 text-sm text-success ring-1 ring-inset ring-success-border">
          ✓ Período limpio: cada fila del CSV tiene su venta del POS correspondiente.
        </p>
      ) : (
        <p className="rounded-md bg-warning-bg/30 px-4 py-2 text-sm text-warning ring-1 ring-inset ring-warning-border">
          {sospechas} discrepancia{sospechas === 1 ? '' : 's'} detectada{sospechas === 1 ? '' : 's'}
          . Revisa las filas resaltadas abajo.
        </p>
      )}

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/40">
              <tr>
                <Th>Estado</Th>
                <Th>Fecha CSV</Th>
                <Th align="right">Monto CSV</Th>
                <Th>Referencia</Th>
                <Th align="right">Recibo</Th>
                <Th align="right">Total venta</Th>
                <Th>Pagado en</Th>
                <Th>Método</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {detail.report.rows.map((r, idx) => (
                <tr
                  key={idx}
                  className={
                    r.status === 'matched'
                      ? 'hover:bg-muted/40'
                      : r.status === 'unmatched_csv'
                        ? 'bg-destructive/10 hover:bg-destructive/10'
                        : 'bg-warning-bg/30 hover:bg-warning-bg/30'
                  }
                >
                  <Td>
                    <StatusBadge status={r.status} />
                  </Td>
                  <Td>{r.csvDate ? formatDate(r.csvDate, 'datetime') : <Dash />}</Td>
                  <Td align="right" mono>
                    {r.csvAmount !== null ? formatCop(r.csvAmount) : <Dash />}
                  </Td>
                  <Td>
                    <span className="text-xs text-muted-foreground">
                      {r.csvReference ?? <Dash />}
                    </span>
                  </Td>
                  <Td align="right" mono>
                    {r.receiptNumber !== null ? `#${r.receiptNumber}` : <Dash />}
                  </Td>
                  <Td align="right" mono>
                    {r.saleTotal !== null ? formatCop(r.saleTotal) : <Dash />}
                  </Td>
                  <Td>{r.salePaidAt ? formatDate(r.salePaidAt, 'datetime') : <Dash />}</Td>
                  <Td>{r.paymentMethod ?? <Dash />}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: 'matched' | 'unmatched_csv' | 'unmatched_sale' }) {
  const cfg = {
    matched: { label: 'Coincide', cls: 'bg-success-bg/30 text-success ring-success-border' },
    unmatched_csv: {
      label: 'CSV sin POS',
      cls: 'bg-destructive/10 text-destructive ring-destructive/30',
    },
    unmatched_sale: {
      label: 'POS sin CSV',
      cls: 'bg-warning-bg/30 text-warning ring-warning-border',
    },
  }[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cfg.cls}`}
    >
      {cfg.label}
    </span>
  );
}

function Stat({
  label,
  value,
  tone = 'muted',
}: {
  label: string;
  value: string;
  tone?: 'good' | 'bad' | 'warn' | 'muted';
}) {
  const valueClass = {
    good: 'text-success',
    bad: 'text-destructive',
    warn: 'text-warning',
    muted: 'text-foreground',
  }[tone];
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={`mt-0.5 text-2xl font-bold tabular-nums ${valueClass}`}>{value}</p>
    </div>
  );
}

function Dash() {
  return <span className="text-muted-foreground">—</span>;
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <th
      className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground ${align === 'right' ? 'text-right' : 'text-left'}`}
    >
      {children}
    </th>
  );
}
function Td({
  children,
  align,
  mono,
}: {
  children: React.ReactNode;
  align?: 'right';
  mono?: boolean;
}) {
  return (
    <td
      className={`px-4 py-3 text-foreground ${align === 'right' ? 'text-right' : 'text-left'} ${mono ? 'tabular-nums' : ''}`}
    >
      {children}
    </td>
  );
}
