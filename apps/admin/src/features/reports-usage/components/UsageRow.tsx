import type { InventoryUsageRow } from '@pos-tercos/types';
import { StockableTypeBadge } from '../../../components/StockableTypeBadge';
import { formatCop, formatNumber } from '../../../lib/format';

/** Las celdas de una fila, para que las arme el DataTable (que en teléfono
 *  las rinde como tarjeta en vez de una tabla de nueve columnas). */
export const usageCells = {
  type: (row: InventoryUsageRow) => <StockableTypeBadge type={row.entityType} size="sm" iconOnly />,
  name: (row: InventoryUsageRow) => (
    <>
      <span className="font-medium text-foreground">{row.name}</span>{' '}
      <span className="text-xs text-muted-foreground">({row.unit})</span>
    </>
  ),
  sales: (row: InventoryUsageRow) => formatQty(row.sales),
  production: (row: InventoryUsageRow) => formatQty(row.productionOut),
  waste: (row: InventoryUsageRow) => (
    <span className={row.waste > 0 ? 'text-amber-400' : undefined}>{formatQty(row.waste)}</span>
  ),
  adjustments: (row: InventoryUsageRow) => (
    <span className={row.adjustments < 0 ? 'text-destructive' : undefined}>
      {row.adjustments > 0 ? '+' : ''}
      {formatQty(row.adjustments)}
    </span>
  ),
  wastePct: (row: InventoryUsageRow) =>
    row.wastePct === null ? (
      <span className="text-muted-foreground">—</span>
    ) : (
      <span className={wastePctClass(row.wastePct)} title={explicaPct(row)}>
        {formatNumber(row.wastePct * 100, { decimals: 1 })}%
      </span>
    ),
  wasteCost: (row: InventoryUsageRow) => <WasteCost row={row} />,
  shortageCost: (row: InventoryUsageRow) => <ShortageCost row={row} />,
};

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
      <span
        className="text-muted-foreground"
        title="El costeo todavía no puede valorizarlo: falta cargar la compra de la que salió"
      >
        sin valorizar
      </span>
    );
  }
  // Desde §7.v43 esta cifra es el costo REAL del lote que salió, no un
  // estimado: la misma que la línea "Faltantes" del estado financiero. La
  // tilde queda SOLO cuando de verdad se estimó (faltó sobre inventario ya en
  // negativo), igual que en la columna de merma — ponerla siempre hacía leer
  // como aproximado un número exacto que además sí baja el resultado del mes.
  return (
    <span
      className="text-amber-400"
      title={
        row.shortageCostEstimated
          ? 'Parte de este costo es estimado: faltó sobre existencias en negativo. Se corrige solo al cargar la factura de esa compra.'
          : undefined
      }
    >
      {row.shortageCostEstimated ? '~' : ''}
      {formatCop(row.shortageCost)}
    </span>
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

/**
 * El porcentaje con sus dos números a la vista. Un "40 %" suelto no dice sobre
 * qué se calculó, y era la primera pregunta al verlo.
 */
function explicaPct(row: InventoryUsageRow): string {
  const salio = row.sales + row.productionOut + Math.max(0, row.waste);
  return `Se tiraron ${formatNumber(Math.max(0, row.waste), { maxDecimals: 2 })} ${row.unit} de ${formatNumber(salio, { maxDecimals: 2 })} que salieron del inventario (${formatNumber(row.sales, { maxDecimals: 2 })} por ventas + ${formatNumber(row.productionOut, { maxDecimals: 2 })} por producción + la merma).`;
}
