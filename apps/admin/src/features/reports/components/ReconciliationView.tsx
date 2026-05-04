'use client';

import type { ReconciliationReport, ReconciliationSource } from '@pos-tercos/types';
import { Button, Input, Label } from '@pos-tercos/ui';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatCop, formatDate } from '../../../lib/format';

const SOURCE_LABEL: Record<ReconciliationSource, string> = {
  NEQUI_CSV: 'Nequi (CSV)',
  BANCOLOMBIA_CSV: 'Bancolombia (CSV)',
};

export function ReconciliationView() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<ReconciliationSource>('NEQUI_CSV');
  const [save, setSave] = useState(true);
  const [report, setReport] = useState<ReconciliationReport | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const file = fileInput.current?.files?.[0];
    if (!file) {
      setError('Seleccioná un archivo CSV.');
      return;
    }
    setError(null);
    setPending(true);
    setReport(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const qs = new URLSearchParams({ source });
      if (save) qs.set('save', 'true');
      const res = await fetch(
        `/api/reports/payment-reconciliation/import?${qs.toString()}`,
        { method: 'POST', body: fd, credentials: 'include' },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? `Error ${res.status}`);
      }
      const data = (await res.json()) as ReconciliationReport;
      setReport(data);
      if (save) {
        // Refrescar SSR para que el historial se actualice abajo.
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-lg border border-gray-200 bg-white p-4"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Fuente</Label>
            <div className="flex gap-2">
              {(Object.keys(SOURCE_LABEL) as ReconciliationSource[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSource(s)}
                  className={`rounded-md border px-3 py-2 text-sm font-medium transition ${
                    source === s
                      ? 'border-blue-600 bg-blue-50 text-blue-900'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {SOURCE_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="csv">CSV</Label>
            <Input id="csv" ref={fileInput} type="file" accept=".csv,text/csv" disabled={pending} />
            <p className="text-[11px] text-gray-500">
              Formato esperado: header + cols `fecha, monto, referencia` (CSV simple).
              Otros proveedores se agregan en FASE 14.
            </p>
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={save}
            onChange={(e) => setSave(e.target.checked)}
            disabled={pending}
            className="h-4 w-4"
          />
          <span className="text-gray-700">
            Guardar este reporte en el historial (FASE 14.D)
          </span>
        </label>
        {error ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? 'Procesando…' : 'Procesar reconciliación'}
        </Button>
      </form>

      {report ? <ReportDisplay report={report} /> : null}
    </div>
  );
}

function ReportDisplay({ report }: { report: ReconciliationReport }) {
  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Fuente" value={SOURCE_LABEL[report.source]} />
        <Stat label="Filas CSV" value={String(report.csvRowsParsed)} />
        <Stat label="Sales POS" value={String(report.posSalesEvaluated)} />
        <Stat label="Matched" value={String(report.summary.matched)} tone="good" />
        <Stat
          label="Sospechas"
          value={String(report.summary.unmatchedCsv + report.summary.unmatchedSale)}
          tone={
            report.summary.unmatchedCsv + report.summary.unmatchedSale > 0 ? 'bad' : 'muted'
          }
        />
      </section>

      <p className="text-xs text-gray-500">
        Periodo CSV: {formatDate(report.periodFrom, 'datetime')} →{' '}
        {formatDate(report.periodTo, 'datetime')}
      </p>

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
            {report.rows.map((r, idx) => (
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

function StatusBadge({ status }: { status: ReconciliationReport['rows'][number]['status'] }) {
  const map = {
    matched: { label: '✓ Match', cls: 'bg-emerald-100 text-emerald-800' },
    unmatched_csv: { label: '⚠ CSV sin POS', cls: 'bg-red-100 text-red-800' },
    unmatched_sale: { label: '? POS sin CSV', cls: 'bg-amber-100 text-amber-800' },
  } as const;
  const m = map[status];
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${m.cls}`}>{m.label}</span>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'good' | 'bad' | 'muted';
}) {
  const cls =
    tone === 'good'
      ? 'text-emerald-700'
      : tone === 'bad'
        ? 'text-red-700'
        : 'text-gray-900';
  return (
    <div className="rounded-md bg-gray-50 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`mt-0.5 text-base font-bold tabular-nums ${cls}`}>{value}</p>
    </div>
  );
}

function Dash() {
  return <span className="text-gray-300">—</span>;
}

function Th({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: 'right';
}) {
  return (
    <th
      scope="col"
      className={`px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
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
      className={`px-3 py-2 text-gray-700 ${align === 'right' ? 'text-right' : 'text-left'} ${
        mono ? 'tabular-nums' : ''
      }`}
    >
      {children}
    </td>
  );
}
