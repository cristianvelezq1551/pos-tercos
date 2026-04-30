'use client';

import {
  DIGITAL_PAYMENT_METHODS,
  type PaymentMethod,
} from '@pos-tercos/types';
import { Button, Dialog, Input, Label } from '@pos-tercos/ui';
import { useEffect, useMemo, useState } from 'react';
import { COP } from '../../catalog/lib/format';
import { confirmPayment } from '../api/confirm-payment';
import { createSale } from '../api/create';
import type { CartLine } from '../lib/cart-types';
import { cartLinesToCreateItems } from '../store/cart-store';

const METHODS: { method: PaymentMethod; label: string }[] = [
  { method: 'CASH', label: 'Efectivo' },
  { method: 'NEQUI', label: 'Nequi' },
  { method: 'DAVIPLATA', label: 'DaviPlata' },
  { method: 'QR_BANCOLOMBIA', label: 'QR Bancolombia' },
  { method: 'TRANSFER', label: 'Transferencia' },
];

const DIGITAL_SET = new Set<PaymentMethod>(DIGITAL_PAYMENT_METHODS);

export interface CheckoutSuccess {
  saleId: string;
  receiptNumber: number;
  total: number;
  paymentMethod: PaymentMethod;
  changeDue: number;
}

export function CheckoutModal({
  open,
  total,
  items,
  onClose,
  onSuccess,
}: {
  open: boolean;
  total: number;
  items: readonly CartLine[];
  onClose: () => void;
  onSuccess: (s: CheckoutSuccess) => void;
}) {
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [cashReceived, setCashReceived] = useState('');
  const [digitalAmount1, setDigitalAmount1] = useState('');
  const [digitalAmount2, setDigitalAmount2] = useState('');
  const [doubleVerified, setDoubleVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Idempotency key generado UNA vez al abrir el modal — si el cajero le da
  // múltiples veces a Confirmar (network flake) el backend cachea la 1ra
  // response y devuelve la misma sale.
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');

  useEffect(() => {
    if (open) {
      setIdempotencyKey(crypto.randomUUID());
      setMethod(null);
      setCashReceived('');
      setDigitalAmount1('');
      setDigitalAmount2('');
      setDoubleVerified(false);
      setError(null);
      setPending(false);
    }
  }, [open]);

  const isDigital = method !== null && DIGITAL_SET.has(method);
  const cashReceivedNum = useMemo(() => Number(cashReceived) || 0, [cashReceived]);
  const digital1Num = useMemo(() => Number(digitalAmount1) || 0, [digitalAmount1]);
  const digital2Num = useMemo(() => Number(digitalAmount2) || 0, [digitalAmount2]);

  const changeDue = method === 'CASH' ? Math.max(0, cashReceivedNum - total) : 0;

  const validation = useMemo(() => {
    if (!method) return { ok: false, reason: 'Elegí un método de pago' };
    if (method === 'CASH') {
      if (cashReceivedNum < total) {
        return { ok: false, reason: `Recibido < total (faltan ${COP.format(total - cashReceivedNum)})` };
      }
      return { ok: true, reason: null };
    }
    // digital
    if (digital1Num !== total) return { ok: false, reason: `Monto 1 debe ser igual al total ${COP.format(total)}` };
    if (digital2Num !== total) return { ok: false, reason: `Monto 2 debe ser igual al total ${COP.format(total)}` };
    if (digital1Num !== digital2Num) return { ok: false, reason: 'Los dos montos no coinciden' };
    if (!doubleVerified) {
      return {
        ok: false,
        reason: 'Confirmá que verificaste app del negocio + comprobante del cliente',
      };
    }
    return { ok: true, reason: null };
  }, [method, cashReceivedNum, digital1Num, digital2Num, doubleVerified, total]);

  const handleConfirm = async () => {
    if (!validation.ok || !method || pending) return;
    setError(null);
    setPending(true);
    try {
      const sale = await createSale(
        { type: 'COUNTER', items: cartLinesToCreateItems(items) },
        idempotencyKey,
      );
      const amountReceived = method === 'CASH' ? cashReceivedNum : total;
      const paid = await confirmPayment(sale.id, {
        method,
        amountReceived,
        digitalDoubleVerified: isDigital ? true : undefined,
      });
      onSuccess({
        saleId: paid.id,
        receiptNumber: paid.receiptNumber,
        total: paid.total,
        paymentMethod: method,
        changeDue,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={pending ? () => {} : onClose}
      title="Cobrar venta"
      description={`Total ${COP.format(total)} · ${items.length} ${items.length === 1 ? 'línea' : 'líneas'}`}
      maxWidth="max-w-lg"
    >
      <div className="space-y-5">
        <div>
          <Label>Método de pago</Label>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {METHODS.map((m) => (
              <button
                key={m.method}
                type="button"
                onClick={() => setMethod(m.method)}
                className={`rounded-md border px-3 py-3 text-sm font-medium transition ${
                  method === m.method
                    ? 'border-blue-600 bg-blue-50 text-blue-900'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {method === 'CASH' ? (
          <div className="space-y-3 rounded-md bg-gray-50 p-4">
            <div className="space-y-2">
              <Label htmlFor="received">Recibido</Label>
              <Input
                id="received"
                type="number"
                min="0"
                step="100"
                inputMode="decimal"
                value={cashReceived}
                onChange={(e) => setCashReceived(e.target.value)}
                autoFocus
                placeholder={total.toString()}
              />
            </div>
            <div className="flex items-center justify-between border-t border-gray-200 pt-3">
              <span className="text-sm text-gray-600">Cambio</span>
              <span
                className={`text-lg font-semibold tabular-nums ${
                  cashReceivedNum >= total ? 'text-emerald-700' : 'text-gray-400'
                }`}
              >
                {COP.format(changeDue)}
              </span>
            </div>
          </div>
        ) : null}

        {isDigital ? (
          <div className="space-y-3 rounded-md bg-gray-50 p-4">
            <p className="text-xs text-gray-600">
              Doble validación: ingresá el monto cobrado <strong>dos veces</strong>. El total
              debe coincidir exactamente con la venta.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="d1">Monto 1</Label>
                <Input
                  id="d1"
                  type="number"
                  min="0"
                  step="1"
                  inputMode="decimal"
                  value={digitalAmount1}
                  onChange={(e) => setDigitalAmount1(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="d2">Monto 2 (verificación)</Label>
                <Input
                  id="d2"
                  type="number"
                  min="0"
                  step="1"
                  inputMode="decimal"
                  value={digitalAmount2}
                  onChange={(e) => setDigitalAmount2(e.target.value)}
                />
              </div>
            </div>
            {digital1Num > 0 && digital2Num > 0 ? (
              <p
                className={`text-xs ${
                  digital1Num === digital2Num && digital1Num === total
                    ? 'text-emerald-700'
                    : 'text-amber-700'
                }`}
              >
                {digital1Num === digital2Num && digital1Num === total
                  ? '✓ Montos coinciden y matchean el total'
                  : `✗ ${digital1Num !== digital2Num ? 'No coinciden entre sí' : `No matchean total ${COP.format(total)}`}`}
              </p>
            ) : null}
            <label className="flex cursor-pointer items-start gap-2 rounded-md border border-gray-200 bg-white p-3">
              <input
                type="checkbox"
                checked={doubleVerified}
                onChange={(e) => setDoubleVerified(e.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              <span className="text-xs text-gray-700">
                Verifiqué el monto en la app del negocio (Nequi/DaviPlata/Bancolombia) <strong>y</strong> en el comprobante que me mostró el cliente.
              </span>
            </label>
          </div>
        ) : null}

        {error ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}

        {!validation.ok && method ? (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {validation.reason}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!validation.ok || pending}>
            {pending ? 'Cobrando…' : `Confirmar ${COP.format(total)}`}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
