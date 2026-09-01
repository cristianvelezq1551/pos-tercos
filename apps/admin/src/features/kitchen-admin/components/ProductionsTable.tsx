'use client';

import type { KitchenProductionInput, KitchenProductionRun } from '@pos-tercos/types';
import { EmptyState, formatDate } from '@pos-tercos/ui';
import { useState } from 'react';
import { ProductionDetailModal } from './detail/ProductionDetailModal';
import { RowNameButton } from './detail/DetailPieces';
import { Th, Td } from './table-cells';

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

  if (runs.length === 0) {
    return (
      <EmptyState
        title="Sin producción"
        description="No se registraron tandas en este rango."
        size="sm"
      />
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-muted/40">
            <tr>
              <Th>Cuándo</Th>
              <Th>Subproducto</Th>
              <Th align="right">Cantidad</Th>
              <Th>Quién</Th>
              <Th>Consumió</Th>
              <Th>Nota</Th>
              <Th>Foto</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {runs.map((run) => (
              <tr key={run.runId} className="hover:bg-muted/30">
                <Td>
                  <time className="text-xs text-muted-foreground" dateTime={run.createdAt}>
                    {formatDate(run.createdAt, 'datetime')}
                  </time>
                </Td>
                <Td>
                  <RowNameButton
                    onClick={() => setAbierta(run)}
                    label={`Ver detalle de la tanda de ${run.subproductName}`}
                  >
                    {run.subproductName}
                  </RowNameButton>
                </Td>
                <Td mono align="right">
                  {run.quantityProduced} {run.unit}
                </Td>
                <Td>{run.userName ?? <span className="text-ink-300">sistema</span>}</Td>
                <Td>
                  <span className="text-xs text-muted-foreground">
                    {resumenDeInsumos(run.inputs)}
                  </span>
                </Td>
                <Td>
                  {run.notes ? (
                    <span className="line-clamp-1 max-w-[16rem] text-xs text-muted-foreground">
                      {run.notes}
                    </span>
                  ) : (
                    <span className="text-ink-300">—</span>
                  )}
                </Td>
                <Td>
                  {run.evidenceUrl ? (
                    <a
                      href={run.evidenceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Ver
                    </a>
                  ) : (
                    <span className="text-ink-300">sin foto</span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ProductionDetailModal run={abierta} onClose={() => setAbierta(null)} />
    </>
  );
}
