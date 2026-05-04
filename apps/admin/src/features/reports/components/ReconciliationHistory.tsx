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
      <p className="rounded-md border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
        Aún no hay reports guardados. Tildá "Guardar en historial" al
        procesar el próximo CSV.
      </p>
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <Th>Fuente</Th>
            <Th>Período</Th>
            <Th align="right">Filas CSV</Th>
            <Th align="right">Match</Th>
            <Th align="right">CSV sin POS</Th>
            <Th align="right">POS sin CSV</Th>
            <Th>Importado</Th>
            <Th>Por</Th>
            <Th align="right">Acciones</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {reports.map((r) => {
            const sospechas = r.unmatchedCsv + r.unmatchedSale;
            return (
              <tr key={r.id} className="transition-colors hover:bg-gray-50">
                <Td>
                  <span className="text-xs font-medium text-gray-700">
                    {SOURCE_LABEL[r.source] ?? r.source}
                  </span>
                </Td>
                <Td mono>
                  {r.periodFrom} → {r.periodTo}
                </Td>
                <Td mono align="right">
                  {r.csvRowsParsed}
                </Td>
                <Td mono align="right">
                  <span className="font-medium text-emerald-700">{r.matched}</span>
                </Td>
                <Td mono align="right">
                  {r.unmatchedCsv > 0 ? (
                    <span className="font-medium text-red-700">{r.unmatchedCsv}</span>
                  ) : (
                    r.unmatchedCsv
                  )}
                </Td>
                <Td mono align="right">
                  {r.unmatchedSale > 0 ? (
                    <span className="font-medium text-amber-700">{r.unmatchedSale}</span>
                  ) : (
                    r.unmatchedSale
                  )}
                </Td>
                <Td mono>{formatDate(r.createdAt, 'datetime')}</Td>
                <Td>{r.importedByName ?? '—'}</Td>
                <Td align="right">
                  <Link
                    href={`/reports/reconciliation/history/${r.id}`}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    Ver
                  </Link>
                  {sospechas === 0 && (
                    <span className="ml-2 text-[10px] text-gray-400">limpio</span>
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
