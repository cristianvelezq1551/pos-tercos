import type { VoidInvoicePreview } from '@pos-tercos/types';
import { DataTable, type DataTableColumn } from '@pos-tercos/ui';
import { AlertTriangle } from 'lucide-react';

type Linea = VoidInvoicePreview['lines'][number];

/**
 * Qué le pasa al inventario si se anula.
 *
 * El aviso de lo que queda en negativo va primero y en rojo a propósito: es la
 * única consecuencia que se siente el mismo día en el local. Un insumo en
 * negativo hace que la caja rechace el cobro de todo producto que lo use.
 */
export function VoidImpactTable({ preview }: { preview: VoidInvoicePreview }) {
  const columns: DataTableColumn<Linea>[] = [
    { key: 'name', header: 'Ítem', primary: true, cell: (l) => l.name },
    {
      key: 'current',
      header: 'Ahora',
      align: 'right',
      numeric: true,
      cell: (l) => `${formatear(l.currentStock)} ${l.unit}`,
    },
    {
      key: 'delta',
      header: 'Se devuelve',
      align: 'right',
      numeric: true,
      cell: (l) => <span className="text-destructive">{formatear(l.delta)}</span>,
    },
    {
      key: 'resulting',
      header: 'Queda en',
      align: 'right',
      numeric: true,
      cell: (l) => (
        <span className={l.resultingStock < 0 ? 'font-semibold text-destructive' : ''}>
          {formatear(l.resultingStock)} {l.unit}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      {preview.goesNegative.length > 0 && (
        <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
          <p>
            <span className="font-semibold">
              {preview.goesNegative.length === 1
                ? 'Un insumo queda en negativo'
                : `${preview.goesNegative.length} insumos quedan en negativo`}
            </span>{' '}
            ({preview.goesNegative.join(', ')}). La caja va a rechazar el cobro de los productos que
            los usen hasta que cargues la factura corregida.
          </p>
        </div>
      )}

      <DataTable
        rows={preview.lines}
        columns={columns}
        rowKey={(l) => `${l.entityType}-${l.entityId}`}
        className="rounded-lg"
      />
    </div>
  );
}

function formatear(n: number): string {
  return n.toLocaleString('es-CO', { maximumFractionDigits: 4 });
}
