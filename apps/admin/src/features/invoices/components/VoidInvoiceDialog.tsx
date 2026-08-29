'use client';

import type { Invoice, VoidInvoicePreview } from '@pos-tercos/types';
import { Button, Dialog, Input, Label, PinField, isValidPin } from '@pos-tercos/ui';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getVoidPreview, voidInvoice } from '../api/client';
import { getErrorMessage } from '../../../lib/errors';
import { VoidImpactTable } from './VoidImpactTable';

const MOTIVO_MINIMO = 5;

/**
 * Anular una factura confirmada.
 *
 * El diálogo muestra el impacto ANTES de decidir: qué insumo baja, en cuánto
 * queda y —lo más importante— cuáles quedan en negativo, porque esos son los
 * que la caja va a dejar de vender hasta que se cargue la factura corregida.
 * Sin ese aviso, anular se siente inofensivo y no lo es.
 */
export function VoidInvoiceDialog({
  invoice,
  onClose,
}: {
  invoice: Invoice;
  onClose: () => void;
}) {
  const router = useRouter();
  const [preview, setPreview] = useState<VoidInvoicePreview | null>(null);
  const [cargando, setCargando] = useState(true);
  const [reason, setReason] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let vivo = true;
    getVoidPreview(invoice.id)
      .then((p) => {
        if (vivo) setPreview(p);
      })
      .catch((e) => {
        if (vivo) setError(getErrorMessage(e, 'No se pudo calcular el impacto.'));
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });
    return () => {
      vivo = false;
    };
  }, [invoice.id]);

  const submit = async (): Promise<void> => {
    setError(null);
    setPending(true);
    try {
      await voidInvoice(invoice.id, reason.trim(), pin);
      onClose();
      router.refresh();
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo anular la factura.'));
      setPending(false);
    }
  };

  const bloqueada = preview?.blockedReason ?? null;
  const puedeAnular =
    !cargando && !bloqueada && reason.trim().length >= MOTIVO_MINIMO && isValidPin(pin) && !pending;

  return (
    <Dialog
      open
      onClose={pending ? () => {} : onClose}
      title="Anular esta factura"
      description="Deshace la entrada de mercancía y la saca de los reportes, como si nunca se hubiera cargado."
      maxWidth="max-w-2xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Volver
          </Button>
          <Button variant="destructive" onClick={submit} disabled={!puedeAnular}>
            {pending ? 'Anulando…' : 'Anular con PIN'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {cargando && <p className="text-sm text-muted-foreground">Calculando el impacto…</p>}

        {bloqueada && (
          <p className="rounded-md border border-warning-border bg-warning-bg/30 px-3 py-2 text-sm text-warning">
            {bloqueada}
          </p>
        )}

        {preview && !bloqueada && (
          <>
            <VoidImpactTable preview={preview} />
            <p className="text-xs text-muted-foreground">
              La factura no se borra: queda marcada como anulada, con tu nombre y el motivo. Los
              movimientos de inventario tampoco — se agregan los que deshacen la entrada.
              {preview.daysLeft > 0 && ` Quedan ${preview.daysLeft} día(s) de plazo para anularla.`}
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="void-reason">¿Por qué la anulas?</Label>
              <Input
                id="void-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ej.: la cargué dos veces / el proveedor facturó otra cantidad"
                maxLength={300}
                disabled={pending}
              />
              <p className="text-xs text-muted-foreground">Queda en la bitácora y en la factura.</p>
            </div>

            <PinField value={pin} onChange={setPin} disabled={pending} />
          </>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
