'use client';

import type { KitchenWasteEntry } from '@pos-tercos/types';
import { Badge, EmptyState, formatCop, formatDate } from '@pos-tercos/ui';
import { useState } from 'react';
import { RowNameButton } from './detail/DetailPieces';
import { WasteDetailModal } from './detail/WasteDetailModal';
import { Th, Td } from './table-cells';

/** Lo que se tiró: cuánto, por qué, quién, cuánto costó y con qué foto.
 *  El motivo es texto libre: acá va a una línea y entero en el detalle. */
export function WasteTable({ entries }: { entries: KitchenWasteEntry[] }) {
  const [abierta, setAbierta] = useState<KitchenWasteEntry | null>(null);

  if (entries.length === 0) {
    return (
      <EmptyState title="Sin merma" description="No se registró merma en este rango." size="sm" />
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-muted/40">
            <tr>
              <Th>Cuándo</Th>
              <Th>Qué</Th>
              <Th align="right">Cantidad</Th>
              <Th align="right">Costo</Th>
              <Th>Motivo</Th>
              <Th>Quién</Th>
              <Th>Foto</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {entries.map((e) => (
              <tr key={e.movementId} className="hover:bg-muted/30">
                <Td>
                  <time className="text-xs text-muted-foreground" dateTime={e.createdAt}>
                    {formatDate(e.createdAt, 'datetime')}
                  </time>
                </Td>
                <Td>
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
                </Td>
                <Td mono align="right">
                  {e.quantity} {e.unit}
                  {e.reversedQty > 0 ? (
                    <span className="block text-[0.6875rem] text-muted-foreground">
                      devuelto {e.reversedQty}
                    </span>
                  ) : null}
                </Td>
                <Td mono align="right">
                  {e.costAmount === null ? (
                    <span className="text-ink-300">sin valorizar</span>
                  ) : (
                    <>
                      {formatCop(e.costAmount)}
                      {e.costEstimated ? (
                        <span className="block text-[0.6875rem] text-muted-foreground">
                          estimado
                        </span>
                      ) : null}
                    </>
                  )}
                </Td>
                <Td>
                  <span className="line-clamp-1 max-w-[18rem] text-xs text-muted-foreground">
                    {e.reason ?? '—'}
                  </span>
                </Td>
                <Td>{e.userName ?? <span className="text-ink-300">sistema</span>}</Td>
                <Td>
                  {e.evidenceUrl ? (
                    <a
                      href={e.evidenceUrl}
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

      <WasteDetailModal entry={abierta} onClose={() => setAbierta(null)} />
    </>
  );
}
