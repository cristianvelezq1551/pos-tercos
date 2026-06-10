'use client';

import type { PayrollPayment } from '@pos-tercos/types';
import { Badge, Button } from '@pos-tercos/ui';
import { CheckCircle2, Eye, Undo2, XCircle } from 'lucide-react';
import { useState } from 'react';
import { isPaymentDayToday } from '../api/client';
import { MarkPaidDialog } from './MarkPaidDialog';
import { ProofDialog } from './ProofDialog';
import { UnmarkDialog } from './UnmarkDialog';

/** Acciones de control de pago. Compacto = solo íconos con tooltip (para el
 *  panel del empleado); por defecto = botones con texto (para Nómina del pago).
 *  Solo visible para Dueño (gate del caller). Sat/Sun → permite "Marcar pagado";
 *  "Desmarcar" funciona cualquier día (para corregir errores). El estado
 *  CANCELLED se sigue renderizando si aparece en datos históricos, pero ya
 *  no se puede crear desde la UI: si no querés pagar, simplemente no lo marcás. */
export function PaymentActions({
  userId,
  periodStart,
  periodEnd,
  workerName,
  total,
  payment,
  onChanged,
  compact = false,
}: {
  userId: string;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string;   // YYYY-MM-DD
  workerName: string;
  total: number;       // total actual (snapshot al marcar)
  payment: PayrollPayment | null;
  /** Disparado tras éxito (refresh server-side o local). */
  onChanged: () => void;
  /** true = botones icon-only (panel empleado); false = texto + ícono. */
  compact?: boolean;
}) {
  const [modal, setModal] = useState<'paid' | 'unmark' | 'proof' | null>(null);

  const isWeekend = isPaymentDayToday();
  const todayYmd = new Date().toISOString().slice(0, 10);
  const pagoEnded = periodEnd <= todayYmd;
  /** Sub-pago sin nada que pagar: trabajador no contratado en ese período,
   *  ya terminó contrato, o días + novedades suman 0. Nada que marcar. */
  const nothingToPay = payment === null && total <= 0;
  const canMarkPaid = isWeekend && pagoEnded && !nothingToPay;

  const close = (): void => setModal(null);
  const refreshAndClose = (): void => {
    close();
    onChanged();
  };

  const markPaidTooltip = !pagoEnded
    ? `El pago cierra el ${periodEnd}`
    : !isWeekend
      ? 'Solo se habilita sábado o domingo'
      : 'Subir comprobante y marcar pagado';

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {/* Badge / estado */}
      {payment ? (
        payment.status === 'PAID' ? (
          <Badge tone="success" size="sm">
            <CheckCircle2 className="mr-1 h-3 w-3" /> Pagado
          </Badge>
        ) : (
          <Badge tone="danger" size="sm" title={payment.note ?? undefined}>
            <XCircle className="mr-1 h-3 w-3" /> Cancelado
          </Badge>
        )
      ) : nothingToPay ? (
        <Badge tone="neutral" size="sm" title="El empleado no estaba contratado o no hay monto a pagar en este período.">
          No aplica
        </Badge>
      ) : (
        <Badge tone="neutral" size="sm">Pendiente</Badge>
      )}

      {/* Acciones */}
      {nothingToPay ? null : payment === null ? (
        compact ? (
          <Button
            size="sm"
            variant="default"
            onClick={() => setModal('paid')}
            disabled={!canMarkPaid}
            title={markPaidTooltip}
            aria-label="Marcar pagado"
            className="-my-1 h-7 px-2"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button
            size="sm"
            variant="default"
            onClick={() => setModal('paid')}
            disabled={!canMarkPaid}
            title={markPaidTooltip}
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Marcar pagado
          </Button>
        )
      ) : (
        <>
          {payment.status === 'PAID' && payment.hasProof ? (
            compact ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setModal('proof')}
                title="Ver comprobante"
                aria-label="Ver comprobante"
                className="-my-1 h-7 px-2"
              >
                <Eye className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setModal('proof')}>
                <Eye className="h-3.5 w-3.5" /> Ver comprobante
              </Button>
            )
          ) : null}
          {compact ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setModal('unmark')}
              title="Desmarcar pago"
              aria-label="Desmarcar"
              className="-my-1 h-7 px-2"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setModal('unmark')}>
              Desmarcar
            </Button>
          )}
        </>
      )}

      {modal === 'paid' && (
        <MarkPaidDialog
          userId={userId}
          periodStart={periodStart}
          workerName={workerName}
          total={total}
          onClose={close}
          onSuccess={refreshAndClose}
        />
      )}
      {modal === 'unmark' && payment && (
        <UnmarkDialog
          userId={userId}
          periodStart={periodStart}
          workerName={workerName}
          prevStatus={payment.status}
          onClose={close}
          onSuccess={refreshAndClose}
        />
      )}
      {modal === 'proof' && payment && (
        <ProofDialog
          paymentId={payment.id}
          workerName={workerName}
          payment={payment}
          onClose={close}
        />
      )}
    </div>
  );
}
