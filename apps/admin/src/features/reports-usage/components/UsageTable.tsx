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
