'use client';

import type { KitchenWasteEntry } from '@pos-tercos/types';
import {
  Badge,
  DataTable,
  DateTimeCell,
  EmptyState,
  formatCop,
  type DataTableColumn,
} from '@pos-tercos/ui';
import { useState } from 'react';
import { RowNameButton } from './detail/DetailPieces';
import { WasteDetailModal } from './detail/WasteDetailModal';

/** Lo que se tiró: cuánto, por qué, quién, cuánto costó y con qué foto.
 *  El motivo es texto libre: acá va a una línea y entero en el detalle. */
export function WasteTable({ entries }: { entries: KitchenWasteEntry[] }) {
  const [abierta, setAbierta] = useState<KitchenWasteEntry | null>(null);

  const columns: DataTableColumn<KitchenWasteEntry>[] = [
    {
      key: 'what',
      header: 'Qué',
      primary: true,
      cell: (e) => (
        <>
          <RowNameButton
            onClick={() => setAbierta(e)}
            label={`Ver detalle de la merma de ${e.name}`}
          >
            {e.name}
          </RowNameButton>
          {e.reversedQty > 0 ? (
            <Badge tone="neutral" size="sm" className="ml-2">
              anulada
            </Badge>
          ) : null}
        </>
      ),
    },
    {
      key: 'when',
      header: 'Cuándo',
      cell: (e) => <DateTimeCell value={e.createdAt} />,
    },
    {
      key: 'qty',
      header: 'Cantidad',
      align: 'right',
      numeric: true,
      cell: (e) => (
        <>
          {e.quantity} {e.unit}
          {e.reversedQty > 0 ? (
            <span className="block text-[0.6875rem] text-muted-foreground">
              devuelto {e.reversedQty}
            </span>
          ) : null}
        </>
      ),
    },
    {
      key: 'cost',
      header: 'Costo',
      align: 'right',
      numeric: true,
      cell: (e) =>
        e.costAmount === null ? (
          <span className="text-muted-foreground">sin valorizar</span>
        ) : (
          <>
            {formatCop(e.costAmount)}
            {e.costEstimated ? (
              <span className="block text-[0.6875rem] text-muted-foreground">estimado</span>
            ) : null}
          </>
        ),
    },
    {
      key: 'reason',
      header: 'Motivo',
      cell: (e) => (
        <span className="line-clamp-1 max-w-[18rem] text-xs text-muted-foreground">
          {e.reason ?? '—'}
        </span>
      ),
    },
    {
      key: 'who',
      header: 'Quién',
      cell: (e) => e.userName ?? <span className="text-muted-foreground">sistema</span>,
    },
    {
      key: 'photo',
      header: 'Foto',
      hideOnMobile: true,
      cell: (e) =>
        e.evidenceUrl ? (
          <a
            href={e.evidenceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-primary hover:underline"
          >
            Ver
          </a>
        ) : (
          <span className="text-muted-foreground">sin foto</span>
        ),
    },
  ];

  return (
    <>
      <DataTable
        rows={entries}
        columns={columns}
        rowKey={(e) => e.movementId}
        className="rounded-lg"
        emptyState={
          <EmptyState title="Sin merma" description="No se registró merma en este rango." size="sm" />
        }
      />

      <WasteDetailModal entry={abierta} onClose={() => setAbierta(null)} />
    </>
  );
}
