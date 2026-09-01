'use client';

import type { KitchenWasteEntry } from '@pos-tercos/types';
import { Badge, Dialog, formatCop, formatDate } from '@pos-tercos/ui';
import { DetailRow, EvidenceLink } from './DetailPieces';

/**
 * Qué se tiró y por qué. El motivo es texto libre del cocinero: en la tabla se
 * recorta a una línea y acá se lee entero, que es donde el dueño decide si eso
 * se puede evitar.
 */
export function WasteDetailModal({
  entry,
  onClose,
}: {
  entry: KitchenWasteEntry | null;
  onClose: () => void;
}) {
  if (!entry) return null;
  const anulada = entry.reversedQty > 0;

  return (
    <Dialog
      open
      onClose={onClose}
      title={entry.name}
      description={`Merma del ${formatDate(entry.createdAt, 'datetime')}`}
      maxWidth="max-w-lg"
    >
      <div className="space-y-4">
        {anulada ? (
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            Se anuló: volvieron {entry.reversedQty} {entry.unit} al inventario con su costo
            original.
          </p>
        ) : null}

        <dl>
          <DetailRow label="Cantidad" className="tabular-nums">
            {entry.quantity} {entry.unit}
            {anulada ? (
              <Badge tone="neutral" size="sm" className="ml-2">
                anulada
              </Badge>
            ) : null}
          </DetailRow>
          <DetailRow label="Costo" className="tabular-nums">
            {entry.costAmount === null ? (
              <span className="text-muted-foreground">Todavía no se pudo valorizar</span>
            ) : (
              <>
                {formatCop(entry.costAmount)}
                {entry.costEstimated ? (
                  <span className="ml-2 text-xs text-muted-foreground">
                    estimado · lo corrige la próxima factura
                  </span>
                ) : null}
              </>
            )}
          </DetailRow>
          <DetailRow label="Motivo" className={entry.reason ? undefined : 'text-muted-foreground'}>
            {entry.reason ?? 'Sin motivo registrado'}
          </DetailRow>
          <DetailRow label="Quién">{entry.userName ?? 'Sistema'}</DetailRow>
          <DetailRow label="Foto">
            <EvidenceLink url={entry.evidenceUrl} />
          </DetailRow>
        </dl>
      </div>
    </Dialog>
  );
}
