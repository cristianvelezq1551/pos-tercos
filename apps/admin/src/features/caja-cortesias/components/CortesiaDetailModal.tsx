'use client';

import type { CortesiaRequest } from '@pos-tercos/types';
import { Dialog, Money, cn, formatDate } from '@pos-tercos/ui';
import { CORTESIA_STATUS_LABEL, CORTESIA_STATUS_TONE } from '../lib/status';

/**
 * Detalle de una cortesía, con el mismo gesto que un pedido cobrado: se toca la
 * fila y se ve qué salió. Lo que el cajero necesita responder acá es "¿qué se
 * regaló, a cuenta de qué y cuánto valía?".
 */
export function CortesiaDetailModal({
  cortesia,
  onClose,
}: {
  cortesia: CortesiaRequest | null;
  onClose: () => void;
}) {
  if (!cortesia) return null;
  const reversed = cortesia.status === 'REVERSED';

  return (
    <Dialog
      open
      onClose={onClose}
      title="Cortesía"
      description={
        cortesia.requestedByName
          ? `Registrada por ${cortesia.requestedByName}`
          : 'Pedido regalado'
      }
      maxWidth="max-w-md"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className={cn('font-semibold', CORTESIA_STATUS_TONE[cortesia.status])}>
            {CORTESIA_STATUS_LABEL[cortesia.status]}
          </span>
          <span>· {formatDate(cortesia.createdAt, 'short')}</span>
        </div>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Lo que salió
          </h3>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="font-medium text-foreground">
              {cortesia.quantity}× {cortesia.productName ?? 'Producto'}
              {cortesia.sizeName ? ` · ${cortesia.sizeName}` : ''}
            </span>
            <Money
              amount={cortesia.salePrice}
              className={cn('shrink-0 text-sm', reversed ? '' : 'line-through text-muted-foreground')}
            />
          </div>
        </section>

        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Motivo
          </h3>
          <p className="text-sm text-foreground">{cortesia.reason}</p>
        </section>

        <section className="border-t border-border pt-3 text-sm">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-muted-foreground">
              {reversed ? 'Valor del pedido' : 'Valor regalado'}
            </span>
            <Money amount={cortesia.salePrice} weight="semibold" className="text-base" />
          </div>
          <p className="pt-1 text-xs text-muted-foreground">
            {reversed
              ? 'La cortesía fue anulada: el stock volvió y no cuenta como pérdida.'
              : 'No se cobró: el negocio no recibió esta plata y el producto salió del inventario.'}
          </p>
        </section>

        {reversed && cortesia.resolverNote ? (
          <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Motivo de la anulación:</span>{' '}
            {cortesia.resolverNote}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
