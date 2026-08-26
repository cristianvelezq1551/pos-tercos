'use client';

import type { ReconciliationReport, ReconciliationSource } from '@pos-tercos/types';
import { Button, Input, Label } from '@pos-tercos/ui';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatCop, formatDate } from '../../../lib/format';
import { importReconciliation } from '../api/reconciliation';
import { getErrorMessage } from '../../../lib/errors';

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
      setError('Selecciona un archivo CSV.');
      return;
    }
    setError(null);
    setPending(true);
    setReport(null);
    try {
      const data = await importReconciliation(source, file, save);
      setReport(data);
      if (save) {
        // Refrescar SSR para que el historial se actualice abajo.
        router.refresh();
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Error desconocido'));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-lg border border-border bg-card p-4"
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
                      ? 'border-primary bg-destructive/10 text-primary'
                      : 'border-border hover:border-input'
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
            <p className="text-[11px] text-muted-foreground">
              Formato esperado: encabezado + columnas fecha, monto y referencia (CSV simple).
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
          <span className="text-foreground">Guardar este reporte en el historial</span>
        </label>
        {error ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
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
        <Stat label="Ventas POS" value={String(report.posSalesEvaluated)} />
        <Stat label="Coinciden" value={String(report.summary.matched)} tone="good" />
        <Stat
          label="Sospechas"
          value={String(report.summary.unmatchedCsv + report.summary.unmatchedSale)}
          tone={report.summary.unmatchedCsv + report.summary.unmatchedSale > 0 ? 'bad' : 'muted'}
        />
      </section>

      <p className="text-xs text-muted-foreground">
        Periodo CSV: {formatDate(report.periodFrom, 'datetime')} →{' '}
        {formatDate(report.periodTo, 'datetime')}
      </p>

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
              {report.rows.map((r, idx) => (
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

function StatusBadge({ status }: { status: ReconciliationReport['rows'][number]['status'] }) {
  const map = {
    matched: { label: '✓ Coincide', cls: 'bg-success-bg text-success' },
    unmatched_csv: { label: '⚠ CSV sin POS', cls: 'bg-destructive/15 text-destructive' },
    unmatched_sale: { label: '? POS sin CSV', cls: 'bg-warning-bg text-warning' },
  } as const;
  const m = map[status];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${m.cls}`}>{m.label}</span>;
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
    tone === 'good' ? 'text-success' : tone === 'bad' ? 'text-destructive' : 'text-foreground';
  return (
    <div className="rounded-md bg-muted/40 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={`mt-0.5 text-base font-bold tabular-nums ${cls}`}>{value}</p>
    </div>
  );
}

function Dash() {
  return <span className="text-ink-500">—</span>;
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <th
      scope="col"
      className={`px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground ${
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
      className={`px-3 py-2 text-foreground ${align === 'right' ? 'text-right' : 'text-left'} ${
        mono ? 'tabular-nums' : ''
      }`}
    >
      {children}
    </td>
  );
}
