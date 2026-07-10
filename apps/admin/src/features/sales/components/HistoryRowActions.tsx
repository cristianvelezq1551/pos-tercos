'use client';

import type { Sale } from '@pos-tercos/types';
import { Button } from '@pos-tercos/ui';
import {
  EDITABLE_STATUSES,
  PAYMENT_CHANGE_STATUSES,
  PRINTABLE_STATUSES,
  REFUNDABLE_STATUSES,
} from '../lib/history-row-config';

type ReprintState = 'idle' | 'pending' | 'ok' | 'error';

/** Fila de acciones de un pedido en el historial, gateadas por su estado. */
export function HistoryRowActions({
  sale,
  busy,
  reprint,
  onEdit,
  onChangePayment,
  onRefund,
  onDelete,
  onReprint,
}: {
  sale: Sale;
  busy: boolean;
  reprint: ReprintState;
  onEdit: () => void;
  onChangePayment: () => void;
  onRefund: () => void;
  onDelete: () => void;
  onReprint: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {EDITABLE_STATUSES.has(sale.status) ? (
        <Button variant="outline" size="sm" onClick={onEdit} title="Editar productos del pedido">
          Editar
        </Button>
      ) : null}
      {PAYMENT_CHANGE_STATUSES.has(sale.status) ? (
        <Button
          variant="outline"
          size="sm"
          onClick={onChangePayment}
          title="Cambiar método de pago registrado"
        >
          Pago
        </Button>
      ) : null}
      {/* Reembolso = devolver un pedido ya retirado (pérdida). */}
      {REFUNDABLE_STATUSES.has(sale.status) ? (
        <Button
          variant="destructive"
          size="sm"
          onClick={onRefund}
          title="Reembolsar (pedido ya retirado)"
        >
          Reembolsar
        </Button>
      ) : null}
      {/* Eliminar = cancelar un pedido sin pagar. */}
      {sale.status === 'PENDIENTE_PAGO' ? (
        <Button
          variant="destructive"
          size="sm"
          disabled={busy}
          onClick={onDelete}
          title="Eliminar pedido sin pagar"
        >
          {busy ? '…' : 'Eliminar'}
        </Button>
      ) : null}
      {PRINTABLE_STATUSES.has(sale.status) ? (
        <Button
          variant="outline"
          size="sm"
          onClick={onReprint}
          disabled={reprint === 'pending'}
          title="Reimprimir recibo"
        >
          {reprint === 'pending'
            ? '…'
            : reprint === 'ok'
              ? '✓'
              : reprint === 'error'
                ? 'Error'
                : 'Recibo'}
        </Button>
      ) : null}
    </div>
  );
}
