import type { SavedReconciliation } from '@pos-tercos/types';
import Link from 'next/link';
import { formatDate } from '../../../lib/format';

const SOURCE_LABEL: Record<string, string> = {
  NEQUI_CSV: 'Nequi',
  BANCOLOMBIA_CSV: 'Bancolombia',
};

export function ReconciliationHistory({
  reports,
}: {
  reports: SavedReconciliation[];
}) {
  if (reports.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-input bg-card p-6 text-center text-sm text-muted-foreground">
        Aún no hay reportes guardados. Marca "Guardar en historial" al
        procesar el próximo CSV.
      </p>
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <table className="min-w-full divide-y divide-border text-sm">
        <thead className="bg-muted/40">
          <tr>
            <Th>Fuente</Th>
            <Th>Período</Th>
            <Th align="right">Filas CSV</Th>
            <Th align="right">Coinciden</Th>
            <Th align="right">CSV sin POS</Th>
            <Th align="right">POS sin CSV</Th>
            <Th>Importado</Th>
            <Th>Por</Th>
            <Th align="right">Acciones</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {reports.map((r) => {
            const sospechas = r.unmatchedCsv + r.unmatchedSale;
            return (
              <tr key={r.id} className="transition-colors hover:bg-muted/40">
                <Td>
                  <span className="text-xs font-medium text-foreground">
                    {SOURCE_LABEL[r.source] ?? r.source}
                  </span>
                </Td>
                <Td mono>
                  {r.periodFrom} → {r.periodTo}
                </Td>
                <Td mono align="right">
                  {r.csvRowsParsed}
                </Td>
                <Td align="right">
                  <CountPill value={r.matched} tone="success" />
                </Td>
                <Td align="right">
                  <CountPill value={r.unmatchedCsv} tone="destructive" neutralWhenZero />
                </Td>
                <Td align="right">
                  <CountPill value={r.unmatchedSale} tone="warning" neutralWhenZero />
                </Td>
                <Td mono>{formatDate(r.createdAt, 'datetime')}</Td>
                <Td>{r.importedByName ?? '—'}</Td>
                <Td align="right">
                  <Link
                    href={`/reports/reconciliation/history/${r.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    Ver
                  </Link>
                  {sospechas === 0 && (
                    <span className="ml-2 text-[10px] text-muted-foreground">limpio</span>
                  )}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const PILL_TONE: Record<string, string> = {
  success: 'border-success-border bg-success-bg/50 text-success',
  destructive: 'border-destructive/40 bg-destructive/10 text-destructive',
  warning: 'border-warning-border bg-warning-bg/40 text-warning',
  neutral: 'border-border bg-muted/40 text-muted-foreground',
};

function CountPill({
  value,
  tone,
  neutralWhenZero,
}: {
  value: number;
  tone: 'success' | 'destructive' | 'warning';
  neutralWhenZero?: boolean;
}) {
  const effective = neutralWhenZero && value === 0 ? 'neutral' : tone;
  return (
    <span
      className={`inline-flex min-w-[2rem] items-center justify-center rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums ${PILL_TONE[effective]}`}
    >
      {value}
    </span>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <th className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground ${align === 'right' ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  );
}
function Td({ children, align, mono }: { children: React.ReactNode; align?: 'right'; mono?: boolean }) {
  return (
    <td className={`px-4 py-3 text-foreground ${align === 'right' ? 'text-right' : 'text-left'} ${mono ? 'tabular-nums' : ''}`}>
      {children}
    </td>
  );
}
