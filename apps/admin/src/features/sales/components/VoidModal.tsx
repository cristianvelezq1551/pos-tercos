'use client';

import type { Sale, SaleStatus } from '@pos-tercos/types';
import { Button, Dialog, FormField, Input } from '@pos-tercos/ui';
import { useEffect, useState } from 'react';
import { listSales } from '../api/list';
import { printComanda } from '../api/print';
import { notifyComandaFailed } from '../lib/comanda-events';
import { refundSale, voidSale } from '../api/void';
import { useEnabledPaymentMethods } from '../hooks/useEnabledPaymentMethods';
import { endpointForOutcome, outcomeVerb, type VoidOutcome } from '../lib/void-outcome';
import { VoidOutcomePicker } from './VoidOutcomePicker';
import { VoidableSalesList } from './VoidableSalesList';
import { notifyCajaChanged } from '../../../lib/caja-events';
import { getErrorMessage } from '../../../lib/errors';
import { logError } from '../../../lib/client-log';

const VOIDABLE_LIMIT = 50;
/** Solo se anula un pedido PAGADO que la cocina aún NO inició. */
const VOIDABLE: SaleStatus[] = ['PAGADO'];

export function VoidModal({
  open,
  shiftId,
  onClose,
  onSuccess,
}: {
  open: boolean;
  shiftId: string | null;
  onClose: () => void;
  onSuccess: (sale: Sale) => void;
}) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [pin, setPin] = useState('');
  const [outcome, setOutcome] = useState<VoidOutcome | null>(null);
  // Para nombrar el medio como lo llama el dueño y no por su code ("CASH").
  const metodos = useEnabledPaymentMethods(open, false);
  const nombresDeMedios = Object.fromEntries(metodos.map((m) => [m.code, m.name]));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedId(null);
    setReason('');
    setPin('');
    setOutcome(null);
    setError(null);
    setPending(false);
    setLoading(true);
    listSales({ shiftId: shiftId ?? undefined, limit: VOIDABLE_LIMIT })
      .then((all) =>
        setSales(
          all
            .filter((s) => VOIDABLE.includes(s.status))
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
        ),
      )
      .catch((err) => setError(getErrorMessage(err, 'Error cargando ventas')))
      .finally(() => setLoading(false));
  }, [open, shiftId]);

  const reasonValid = reason.trim().length >= 5 && reason.trim().length <= 200;
  const pinValid = /^\d{6}$/.test(pin);
  // Sin responder la pregunta no se puede confirmar: es lo que decide si la
  // pérdida entra a los libros o desaparece.
  const canConfirm = selectedId !== null && outcome !== null && reasonValid && pinValid && !pending;

  const handleConfirm = async () => {
    if (!canConfirm || !selectedId) return;
    setError(null);
    setPending(true);
    try {
      const anular = endpointForOutcome(outcome!) === 'void';
      const voided = anular
        ? await voidSale(selectedId, { reason: reason.trim() }, pin)
        : await refundSale(selectedId, { reason: reason.trim() }, pin);
      notifyCajaChanged();
      // #8: la cocina recibió la comanda al cobrar — avisarle con el ticket de
      // ANULACIÓN (número gigante) que descarte el pedido. Best-effort.
      //
      // Solo cuando la comida NO salió: si ya se preparó y se entregó, mandarle
      // a la cocina que descarte un pedido que ya no tiene es ruido, y peor,
      // les hace dudar del papel.
      if (anular) {
        void printComanda(voided.id, { cancel: true }).catch((e) => {
          logError('void.cancel-comanda', e, { saleId: voided.id });
          notifyComandaFailed({
            saleId: voided.id,
            receiptNumber: voided.receiptNumber,
            kind: 'anulacion',
          });
        });
      }
      onSuccess(voided);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'Error desconocido'));
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={pending ? () => {} : onClose}
      title="Anular venta"
      description="Selecciona la venta, registra el motivo, e ingresa el PIN del Admin/Dueño."
      maxWidth="max-w-xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={!canConfirm}>
            {pending
              ? outcomeVerb(outcome ?? 'no-salio').gerund
              : outcomeVerb(outcome ?? 'no-salio').action}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="rounded-lg border border-warning-border bg-warning-bg px-3 py-2.5 text-xs leading-relaxed text-warning">
          En los dos casos el pedido pasa a <strong>ANULADA</strong>, sale de la caja y de los
          ingresos, y queda en auditoría. Lo que cambia es el inventario: por eso hay que decir si
          la comida salió. Requiere PIN de Admin/Dueño.
        </div>
        <VoidableSalesList
          sales={sales}
          loading={loading}
          selectedId={selectedId}
          onSelect={setSelectedId}
          nombresDeMedios={nombresDeMedios}
        />

        {selectedId ? (
          <VoidOutcomePicker value={outcome} onChange={setOutcome} disabled={pending} />
        ) : null}

        <FormField
          label="Motivo (5-200 caracteres)"
          hint={`${reason.trim().length}/200 · queda registrado`}
        >
          <Input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej. cliente devolvió por error en el pedido"
            maxLength={200}
          />
        </FormField>

        <FormField label="PIN del Admin/Dueño (6 dígitos)">
          <Input
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="••••••"
            maxLength={6}
            className="font-mono tracking-[0.4em]"
          />
        </FormField>

        {error ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
