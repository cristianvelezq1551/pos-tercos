import type { InventoryUsageReport, InventoryUsageRow } from '@pos-tercos/types';
import { StockableTypeBadge } from '../../../components/StockableTypeBadge';
import { formatCop, formatNumber } from '../../../lib/format';

interface UsageTableProps {
  report: InventoryUsageReport;
}

export function UsageTable({ report }: UsageTableProps) {
  if (report.rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-input bg-card p-12 text-center">
        <p className="text-sm font-medium text-foreground">
          Sin movimientos de inventario en el período seleccionado.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <UsageSummaryCards report={report} />
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-muted/40">
            <tr>
              <Th>Tipo</Th>
              <Th>Insumo / producto</Th>
              <Th align="right">Vendido</Th>
              <Th align="right">Producción</Th>
              <Th align="right">Merma</Th>
              <Th align="right">Ajustes</Th>
              <Th align="right">% merma</Th>
              <Th align="right">$ perdido</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {report.rows.map((r) => (
              <UsageRow key={`${r.entityType}:${r.entityId}`} row={r} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        El consumo por ventas y producción sale de las recetas (teórico). La merma son
        pérdidas declaradas; los ajustes negativos son faltantes detectados en conteo
        físico. &ldquo;$ perdido&rdquo; valoriza merma + faltantes con el último costo de
        compra — los subproductos no se valorizan (su costo es FIFO de producción).
      </p>
    </div>
  );
}

function UsageSummaryCards({ report }: { report: InventoryUsageReport }) {
  const worst = report.rows.find((r) => (r.wasteCost ?? 0) > 0);
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Pérdida estimada del período
        </p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-destructive">
          {formatCop(report.totalWasteCost)}
        </p>
      </div>
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Dónde se pierde más
        </p>
        <p className="mt-1 truncate text-lg font-semibold text-foreground">
          {worst ? worst.name : '—'}
        </p>
        {worst?.wasteCost ? (
          <p className="text-xs text-muted-foreground">{formatCop(worst.wasteCost)} perdidos</p>
        ) : null}
      </div>
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Sin costo conocido
        </p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
          {report.unknownCostCount}
        </p>
        <p className="text-xs text-muted-foreground">
          ítems con pérdida pero sin factura que les dé costo
        </p>
      </div>
    </div>
  );
}

function UsageRow({ row }: { row: InventoryUsageRow }) {
  return (
    <tr className="transition-colors hover:bg-muted/40">
      <Td>
        <StockableTypeBadge type={row.entityType} size="sm" iconOnly />
      </Td>
      <Td>
        <span className="font-medium text-foreground">{row.name}</span>{' '}
        <span className="text-xs text-muted-foreground">({row.unit})</span>
      </Td>
      <Td mono align="right">{formatQty(row.sales)}</Td>
      <Td mono align="right">{formatQty(row.productionOut)}</Td>
      <Td mono align="right">
        <span className={row.waste > 0 ? 'text-amber-400' : undefined}>{formatQty(row.waste)}</span>
      </Td>
      <Td mono align="right">
        <span className={row.adjustments < 0 ? 'text-destructive' : undefined}>
          {row.adjustments > 0 ? '+' : ''}
          {formatQty(row.adjustments)}
        </span>
      </Td>
      <Td mono align="right">
        {row.wastePct === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className={wastePctClass(row.wastePct)}>
            {formatNumber(row.wastePct * 100, { decimals: 1 })}%
          </span>
        )}
      </Td>
      <Td mono align="right">
        {row.wasteCost === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className={row.wasteCost > 0 ? 'font-medium text-destructive' : undefined}>
            {formatCop(row.wasteCost)}
          </span>
        )}
      </Td>
    </tr>
  );
}

/** Umbrales orientativos para comida rápida: <2% normal, 2-5% mirar, >5% problema. */
function wastePctClass(pct: number): string {
  if (pct >= 0.05) return 'font-medium text-destructive';
  if (pct >= 0.02) return 'text-amber-400';
  return 'text-emerald-400';
}

function formatQty(n: number): string {
  return formatNumber(n, { decimals: Number.isInteger(n) ? 0 : 2 });
}

function Th({
  children,
  align = 'left',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <th
      scope="col"
      className={`px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
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
      className={`px-3 py-2.5 ${align === 'right' ? 'text-right' : 'text-left'} ${
        mono ? 'tabular-nums' : ''
      }`}
    >
      {children}
    </td>
  );
}
