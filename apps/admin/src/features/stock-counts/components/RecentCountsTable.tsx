import type { StockCount } from '@pos-tercos/types';
import { StockableTypeBadge } from '../../../components/StockableTypeBadge';
import { formatNumber } from '../../../lib/format';
import { formatDate } from '@pos-tercos/ui';

interface RecentCountsTableProps {
  counts: StockCount[];
}

export function RecentCountsTable({ counts }: RecentCountsTableProps) {
  if (counts.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-input bg-card p-6 text-center text-sm text-muted-foreground">
        Todavía no hay conteos registrados.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="min-w-full divide-y divide-border text-sm">
        <thead className="bg-muted/40">
          <tr>
            <Th>Fecha</Th>
            <Th>Ítem</Th>
            <Th align="right">Contado</Th>
            <Th align="right">Ledger</Th>
            <Th align="right">Diferencia</Th>
            <Th>Quién</Th>
            <Th>Nota</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {counts.map((c) => (
            <tr key={c.id} className="transition-colors hover:bg-muted/40">
              <Td mono>{formatDate(c.createdAt, 'datetime')}</Td>
              <Td>
                <span className="inline-flex items-center gap-2">
                  <StockableTypeBadge type={c.entityType} size="sm" iconOnly />
                  <span className="font-medium text-foreground">{c.name}</span>
                </span>
              </Td>
              <Td mono align="right">
                {formatNumber(c.countedQty)}
              </Td>
              <Td mono align="right">
                {formatNumber(c.ledgerQty)}
              </Td>
              <Td mono align="right">
                <span
                  className={
                    c.difference === 0
                      ? 'text-emerald-400'
                      : c.difference < 0
                        ? 'font-medium text-destructive'
                        : 'text-amber-400'
                  }
                >
                  {c.difference > 0 ? '+' : ''}
                  {formatNumber(c.difference)}
                </span>
              </Td>
              <Td>{c.userName ?? '—'}</Td>
              <Td>{c.notes ?? ''}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th
      scope="col"
      className={`px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground ${align === 'right' ? 'text-right' : 'text-left'}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = 'left',
  mono = false,
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
  mono?: boolean;
}) {
  return (
    <td
      className={`px-3 py-2.5 ${align === 'right' ? 'text-right' : 'text-left'} ${mono ? 'tabular-nums' : ''}`}
    >
      {children}
    </td>
  );
}
