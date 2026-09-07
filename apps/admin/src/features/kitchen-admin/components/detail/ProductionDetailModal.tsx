'use client';

import type { KitchenProductionRun } from '@pos-tercos/types';
import { Button, Dialog, EmptyState, formatDate } from '@pos-tercos/ui';
import { DetailRow, DetailSection, EvidenceLink } from './DetailPieces';

/**
 * Qué pasó en UNA tanda. Los insumos consumidos son la razón de ser de este
 * detalle: una tanda puede tener diez y en la tabla no cabían — apilados en la
 * celda "Consumió" estiraban la fila y el resto de las columnas se perdía.
 */
export function ProductionDetailModal({
  run,
  onClose,
  onAnular,
}: {
  run: KitchenProductionRun | null;
  onClose: () => void;
  onAnular: (run: KitchenProductionRun) => void;
}) {
  if (!run) return null;
  const anulada = run.voidedAt !== null;

  return (
    <Dialog
      open
      onClose={onClose}
      title={run.subproductName}
      description={`Tanda del ${formatDate(run.createdAt, 'datetime')}`}
      maxWidth="max-w-lg"
      footer={
        anulada ? null : (
          <div className="flex justify-end">
            <Button variant="destructive" onClick={() => onAnular(run)}>
              Anular tanda
            </Button>
          </div>
        )
      }
    >
      <div className="space-y-5">
        {anulada ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-foreground">
            <span className="font-medium">Tanda anulada.</span> Los insumos
            volvieron al inventario y el subproducto dejó de contar.
            {run.voidReason ? ` Motivo: ${run.voidReason}` : ''}
            {run.voidedByName ? ` · La anuló ${run.voidedByName}.` : ''}
          </p>
        ) : null}

        <dl>
          <DetailRow label="Se produjo" className="tabular-nums">
            {run.quantityProduced} {run.unit}
          </DetailRow>
          <DetailRow label="Quién">{run.userName ?? 'Sistema'}</DetailRow>
          <DetailRow label="Nota" className={run.notes ? undefined : 'text-muted-foreground'}>
            {run.notes ?? 'Sin nota'}
          </DetailRow>
          <DetailRow label="Foto">
            <EvidenceLink url={run.evidenceUrl} />
          </DetailRow>
        </dl>

        <DetailSection title={`Consumió (${run.inputs.length})`}>
          {run.inputs.length === 0 ? (
            <EmptyState
              title="Sin consumos registrados"
              description="La tanda no descontó insumos."
              size="sm"
            />
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {run.inputs.map((i) => (
                <li
                  key={`${i.entityType}:${i.entityId}`}
                  className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm"
                >
                  <span className="min-w-0 truncate text-foreground">{i.name}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {i.quantity} {i.unit}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </DetailSection>
      </div>
    </Dialog>
  );
}
