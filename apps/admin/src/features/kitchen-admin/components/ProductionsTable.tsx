'use client';

import type { KitchenProductionInput, KitchenProductionRun } from '@pos-tercos/types';
import {
  DataTable,
  DateTimeCell,
  EmptyState,
  type DataTableColumn,
} from '@pos-tercos/ui';
import { useState } from 'react';
import { ProductionDetailModal } from './detail/ProductionDetailModal';
import { VoidProductionDialog } from './detail/VoidProductionDialog';
import { RowNameButton } from './detail/DetailPieces';

/**
 * Una fila por TANDA. Los insumos consumidos se RESUMEN acá y se leen enteros
 * en el detalle: apilados en la celda estiraban la fila a diez renglones y
 * hundían el resto de las columnas.
 */
function resumenDeInsumos(inputs: KitchenProductionInput[]): string {
  if (inputs.length === 0) return '—';
  const [primero, ...resto] = inputs;
  return resto.length === 0 ? primero.name : `${primero.name} +${resto.length} más`;
}

export function ProductionsTable({ runs }: { runs: KitchenProductionRun[] }) {
  const [abierta, setAbierta] = useState<KitchenProductionRun | null>(null);
  const [anulando, setAnulando] = useState<KitchenProductionRun | null>(null);

  const columns: DataTableColumn<KitchenProductionRun>[] = [
    {
      key: 'subproduct',
      header: 'Subproducto',
      primary: true,
      cell: (run) => (
        <div className="flex items-baseline gap-2">
          <RowNameButton
            onClick={() => setAbierta(run)}
            label={`Ver detalle de la tanda de ${run.subproductName}`}
          >
            {run.subproductName}
          </RowNameButton>
          {run.voidedAt ? (
            <span className="shrink-0 rounded border border-destructive/40 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-destructive">
              Anulada
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'when',
      header: 'Cuándo',
      cell: (run) => <DateTimeCell value={run.createdAt} />,
    },
    {
      key: 'qty',
      header: 'Cantidad',
      align: 'right',
      numeric: true,
      cell: (run) =>
        run.voidedAt ? (
          <span className="text-muted-foreground line-through">
            {run.quantityProduced} {run.unit}
          </span>
        ) : (
          `${run.quantityProduced} ${run.unit}`
        ),
    },
    {
      key: 'who',
      header: 'Quién',
      cell: (run) => run.userName ?? <span className="text-muted-foreground">sistema</span>,
    },
    {
      key: 'inputs',
      header: 'Consumió',
      cell: (run) => (
        <span className="text-xs text-muted-foreground">{resumenDeInsumos(run.inputs)}</span>
      ),
    },
    {
      key: 'notes',
      header: 'Nota',
      hideOnMobile: true,
      cell: (run) =>
        run.notes ? (
          <span className="line-clamp-1 max-w-[16rem] text-xs text-muted-foreground">
            {run.notes}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: 'photo',
      header: 'Foto',
      hideOnMobile: true,
      cell: (run) =>
        run.evidenceUrl ? (
          <a
            href={run.evidenceUrl}
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
        rows={runs}
        columns={columns}
        rowKey={(run) => run.runId}
        className="rounded-lg"
        emptyState={
          <EmptyState
            title="Sin producción"
            description="No se registraron tandas en este rango."
            size="sm"
          />
        }
      />

      <ProductionDetailModal
        run={abierta}
        onClose={() => setAbierta(null)}
        onAnular={(run) => {
          // Se cierra el detalle antes de abrir la anulación: dos diálogos
          // encimados dejan al lector sin saber cuál está respondiendo.
          setAbierta(null);
          setAnulando(run);
        }}
      />

      {anulando ? (
        <VoidProductionDialog
          run={anulando}
          open
          onClose={() => setAnulando(null)}
          onVoided={() => setAnulando(null)}
        />
      ) : null}
    </>
  );
}
