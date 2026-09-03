import type { InventoryUsageReport, InventoryUsageRow } from '@pos-tercos/types';
import { DataTable, type DataTableColumn } from '@pos-tercos/ui';
import { usageCells } from './UsageRow';
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

  const num = { align: 'right', numeric: true } as const;
  const columns: DataTableColumn<InventoryUsageRow>[] = [
    { key: 'name', header: 'Insumo / producto', primary: true, cell: usageCells.name },
    { key: 'type', header: 'Tipo', cell: usageCells.type },
    { key: 'sales', header: 'Vendido', ...num, cell: usageCells.sales },
    { key: 'production', header: 'Producción', ...num, cell: usageCells.production },
    { key: 'waste', header: 'Merma', ...num, cell: usageCells.waste },
    { key: 'adjustments', header: 'Ajustes', ...num, cell: usageCells.adjustments },
    { key: 'wastePct', header: '% merma', ...num, cell: usageCells.wastePct },
    { key: 'wasteCost', header: '$ merma', ...num, cell: usageCells.wasteCost },
    { key: 'shortageCost', header: '$ faltante', ...num, cell: usageCells.shortageCost },
  ];

  return (
    <div className="space-y-5">
      <UsageSummaryCards report={report} />
      <DataTable
        rows={report.rows}
        columns={columns}
        rowKey={(r) => `${r.entityType}:${r.entityId}`}
        className="rounded-lg"
      />
      <UsageLegend />
    </div>
  );
}

function UsageLegend() {
  return (
    <p className="text-xs text-muted-foreground">
      El consumo por ventas y producción sale de las recetas (teórico).{' '}
      <strong className="text-foreground">Merma</strong> es lo que alguien declaró como
      tirado; <strong className="text-foreground">faltante</strong> es lo que apareció de
      menos al contar físicamente, que no lo declaró nadie. Los{' '}
      <strong className="text-foreground">ajustes</strong> son correcciones tecleadas a
      mano: arreglan un dato mal cargado y no son una pérdida, por eso van aparte y no
      cuestan.{' '}
      El <strong className="text-foreground">% de merma</strong> es qué parte de todo lo que
      SALIÓ del inventario se tiró:{' '}
      <em>merma ÷ (vendido + producción + merma)</em>. Si de 250 g de sal que salieron, 100
      se botaron, el porcentaje es 40 %. No se compara contra lo comprado a propósito: lo
      que está en la bodega todavía no se pudo perder.{' '}
      <strong className="text-foreground">$ merma</strong> y{' '}
      <strong className="text-foreground">$ faltante</strong> son los dos el costo real del
      lote que salió, y los dos bajan el resultado del mes: son las mismas cifras que las
      líneas Mermas y Faltantes del estado financiero. Un{' '}
      <strong className="text-foreground">~</strong> delante significa que esa parte se
      estimó porque se consumió sobre existencias en negativo; se corrige sola al cargar la
      factura de esa compra.
    </p>
  );
}
