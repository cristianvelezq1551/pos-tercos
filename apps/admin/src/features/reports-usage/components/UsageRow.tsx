import type { InventoryUsageRow } from '@pos-tercos/types';
import { StockableTypeBadge } from '../../../components/StockableTypeBadge';
import { formatCop, formatNumber } from '../../../lib/format';

export function UsageRow({ row }: { row: InventoryUsageRow }) {
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
        <WasteCost row={row} />
      </Td>
      <Td mono align="right">
        <ShortageCost row={row} />
      </Td>
    </tr>
  );
}

function WasteCost({ row }: { row: InventoryUsageRow }) {
  if (row.wasteCost === null) {
    return (
      <span
        className="text-muted-foreground"
        title="Merma recién registrada: el costo aparece en el próximo refresco."
      >
        calculando…
      </span>
    );
  }
  if (row.wasteCost <= 0) return <span className="text-muted-foreground">—</span>;
  return (
    <span
      className="font-medium text-destructive"
      title={
        row.wasteCostEstimated
          ? 'Parte de este costo es estimado: se mermó sobre existencias en negativo. Se corrige solo al cargar la factura de esa compra.'
          : undefined
      }
    >
      {row.wasteCostEstimated ? '~' : ''}
      {formatCop(row.wasteCost)}
    </span>
  );
}

function ShortageCost({ row }: { row: InventoryUsageRow }) {
  if (row.shortageQty <= 0) return <span className="text-muted-foreground">—</span>;
  if (row.shortageCost === null) {
    return (
      <span className="text-muted-foreground" title="Sin factura que le dé un costo de referencia">
        sin costo
      </span>
    );
  }
  return <span className="text-amber-400">~{formatCop(row.shortageCost)}</span>;
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
