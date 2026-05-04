import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError, serverFetchJson } from '../../../../../../lib/api-server';
import type { SavedReconciliationDetail } from '@pos-tercos/types';
import { formatCop, formatDate } from '../../../../../../lib/format';

interface PageProps {
  params: Promise<{ id: string }>;
}

const SOURCE_LABEL: Record<string, string> = {
  NEQUI_CSV: 'Nequi (CSV)',
  BANCOLOMBIA_CSV: 'Bancolombia (CSV)',
};

export default async function SavedReconciliationDetailPage({ params }: PageProps) {
  const { id } = await params;
  let detail: SavedReconciliationDetail;
  try {
    detail = await serverFetchJson<SavedReconciliationDetail>(
      `/reports/payment-reconciliation/history/${id}`,
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const sospechas = detail.unmatchedCsv + detail.unmatchedSale;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/reports/reconciliation"
          className="text-sm text-blue-600 hover:underline"
        >
          ← Volver a reconciliación
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">
          {SOURCE_LABEL[detail.source] ?? detail.source} · {detail.periodFrom} → {detail.periodTo}
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Importado el {formatDate(detail.createdAt, 'datetime')} por{' '}
          {detail.importedByName ?? '(eliminado)'}.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Filas CSV" value={String(detail.csvRowsParsed)} />
        <Stat label="Sales POS" value={String(detail.posSalesEvaluated)} />
        <Stat label="Match" value={String(detail.matched)} tone="good" />
        <Stat label="CSV sin POS" value={String(detail.unmatchedCsv)} tone={detail.unmatchedCsv > 0 ? 'bad' : 'muted'} />
        <Stat label="POS sin CSV" value={String(detail.unmatchedSale)} tone={detail.unmatchedSale > 0 ? 'warn' : 'muted'} />
      </div>

      {sospechas === 0 ? (
        <p className="rounded-md bg-emerald-50 px-4 py-2 text-sm text-emerald-900 ring-1 ring-inset ring-emerald-200">
          ✓ Período limpio: todos los CSV rows tienen su sale POS correspondiente.
        </p>
      ) : (
        <p className="rounded-md bg-amber-50 px-4 py-2 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
          {sospechas} discrepancia{sospechas === 1 ? '' : 's'} detectada{sospechas === 1 ? '' : 's'}. Revisá las filas resaltadas abajo.
        </p>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <Th>Estado</Th>
              <Th>Fecha CSV</Th>
              <Th align="right">Monto CSV</Th>
              <Th>Referencia</Th>
              <Th align="right">Recibo</Th>
              <Th align="right">Sale total</Th>
              <Th>Pagado en</Th>
              <Th>Método</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {detail.report.rows.map((r, idx) => (
              <tr
                key={idx}
                className={
                  r.status === 'matched'
                    ? 'hover:bg-gray-50'
                    : r.status === 'unmatched_csv'
                      ? 'bg-red-50/40 hover:bg-red-50'
                      : 'bg-amber-50/40 hover:bg-amber-50'
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
                  <span className="text-xs text-gray-600">{r.csvReference ?? <Dash />}</span>
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
  );
}

function StatusBadge({ status }: { status: 'matched' | 'unmatched_csv' | 'unmatched_sale' }) {
  const cfg = {
    matched: { label: 'Match', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
    unmatched_csv: { label: 'CSV sin POS', cls: 'bg-red-50 text-red-700 ring-red-600/20' },
    unmatched_sale: { label: 'POS sin CSV', cls: 'bg-amber-50 text-amber-700 ring-amber-600/20' },
  }[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function Stat({ label, value, tone = 'muted' }: { label: string; value: string; tone?: 'good' | 'bad' | 'warn' | 'muted' }) {
  const valueClass = {
    good: 'text-emerald-700',
    bad: 'text-red-700',
    warn: 'text-amber-700',
    muted: 'text-gray-900',
  }[tone];
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`mt-0.5 text-2xl font-bold tabular-nums ${valueClass}`}>{value}</p>
    </div>
  );
}

function Dash() {
  return <span className="text-gray-400">—</span>;
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <th className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  );
}
function Td({ children, align, mono }: { children: React.ReactNode; align?: 'right'; mono?: boolean }) {
  return (
    <td className={`px-4 py-3 text-gray-700 ${align === 'right' ? 'text-right' : 'text-left'} ${mono ? 'tabular-nums' : ''}`}>
      {children}
    </td>
  );
}
