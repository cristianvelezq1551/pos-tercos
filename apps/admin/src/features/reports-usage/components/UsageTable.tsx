import type { InventoryUsageReport } from '@pos-tercos/types';
import { UsageRow } from './UsageRow';
import { UsageSummaryCards } from './UsageSummaryCards';

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
              <Th align="right">$ merma</Th>
              <Th align="right">$ faltante</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {report.rows.map((r) => (
              <UsageRow key={`${r.entityType}:${r.entityId}`} row={r} />
            ))}
          </tbody>
        </table>
      </div>
      <UsageLegend />
    </div>
  );
}

function UsageLegend() {
  return (
    <p className="text-xs text-muted-foreground">
      El consumo por ventas y producción sale de las recetas (teórico). La merma son
      pérdidas declaradas; los ajustes negativos son faltantes detectados en conteo físico.{' '}
      <strong className="text-foreground">$ merma</strong> es el costo real de lo que se
      tiró, al precio del lote que se consumió: es la misma cifra que la línea Mermas del
      estado financiero. <strong className="text-foreground">$ faltante</strong> es
      aproximado (se estima al último precio de compra) y no entra al estado financiero: un
      ajuste de inventario corrige las existencias, no se contabiliza como gasto.
    </p>
  );
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
