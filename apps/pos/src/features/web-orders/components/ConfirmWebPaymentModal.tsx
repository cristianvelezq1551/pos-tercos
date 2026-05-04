'use client';

import {
  DIGITAL_PAYMENT_METHODS,
  type PaymentMethod,
  type PublicWebOrder,
  type Sale,
} from '@pos-tercos/types';
import { Button, Dialog, Input, Label } from '@pos-tercos/ui';
import { useEffect, useMemo, useState } from 'react';
import { COP } from '../../catalog/lib/format';
import { confirmPayment } from '../../sales/api/confirm-payment';
import { fetchSaleById } from '../api/get-sale';
import { openWhatsAppForSale } from '../lib/whatsapp';

const METHODS: { method: PaymentMethod; label: string }[] = [
  { method: 'CASH', label: 'Efectivo' },
  { method: 'NEQUI', label: 'Nequi' },
  { method: 'DAVIPLATA', label: 'DaviPlata' },
  { method: 'QR_BANCOLOMBIA', label: 'QR Bancolombia' },
  { method: 'TRANSFER', label: 'Transferencia' },
];

const DIGITAL_SET = new Set<PaymentMethod>(DIGITAL_PAYMENT_METHODS);

export function ConfirmWebPaymentModal({
  order,
  open,
  onClose,
  onConfirmed,
}: {
  order: PublicWebOrder | null;
  open: boolean;
  onClose: () => void;
  onConfirmed: (sale: Sale) => void;
}) {
  const [fullSale, setFullSale] = useState<Sale | null>(null);
  const [loadingSale, setLoadingSale] = useState(false);
  const [method, setMethod] = useState<PaymentMethod | null>('NEQUI');
  const [digital1, setDigital1] = useState('');
  const [digital2, setDigital2] = useState('');
  const [doubleVerified, setDoubleVerified] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !order) return;
    setMethod('NEQUI');
    setDigital1('');
    setDigital2('');
    setDoubleVerified(false);
    setError(null);
    setPending(false);
    setLoadingSale(true);
    fetchSaleById(order.id)
      .then(setFullSale)
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Error cargando la venta'),
      )
      .finally(() => setLoadingSale(false));
  }, [open, order?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const isDigital = method !== null && DIGITAL_SET.has(method);
  const total = order?.total ?? 0;
  const d1 = useMemo(() => Number(digital1) || 0, [digital1]);
  const d2 = useMemo(() => Number(digital2) || 0, [digital2]);

  const validation = useMemo(() => {
    if (!order || !method) return { ok: false, reason: 'Elegí un método' };
    if (method === 'CASH') {
      // CASH para web es raro (no hay efectivo) pero soportado por backend.
      return { ok: true, reason: null };
    }
    if (d1 !== total) return { ok: false, reason: `Monto 1 debe ser ${COP.format(total)}` };
    if (d2 !== total) return { ok: false, reason: `Monto 2 debe ser ${COP.format(total)}` };
    if (d1 !== d2) return { ok: false, reason: 'Los dos montos no coinciden' };
    if (!doubleVerified) {
      return { ok: false, reason: 'Confirmá doble verificación' };
    }
    return { ok: true, reason: null };
  }, [order, method, d1, d2, doubleVerified, total]);

  if (!order) return null;

  const handleConfirm = async () => {
    if (!validation.ok || !method || pending) return;
    setError(null);
    setPending(true);
    try {
      const paid = await confirmPayment(order.id, {
        method,
        amountReceived: total,
        digitalDoubleVerified: isDigital ? true : undefined,
      });
      // Acoplado al click: post-confirm abrimos WhatsApp con "ya está
      // en cocina". El backend audit registra el click. Si el browser
      // bloquea el popup, no falla la confirmación — el cajero puede
      // mensajear manual desde el chat existente.
      openWhatsAppForSale(paid, 'confirmed');
      onConfirmed(paid);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={pending ? () => {} : onClose}
      title={`Confirmar pago · #${order.receiptNumber}`}
      description={`${order.customerName} · ${order.customerPhone}`}
      maxWidth="max-w-xl"
    >
      <div className="space-y-5">
        <section className="rounded-md bg-gray-50 px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">
              {order.type === 'WEB_PICKUP' ? 'Recoger en tienda' : 'Domicilio'}
              {order.deliveryAddress ? ` · ${order.deliveryAddress}` : ''}
            </span>
            <span className="text-lg font-bold tabular-nums">{COP.format(total)}</span>
          </div>
          {order.customerPaidAt ? (
            <p className="mt-1 text-xs text-emerald-700">
              ✓ Cliente declaró pago: {new Date(order.customerPaidAt).toLocaleTimeString('es-CO')}
            </p>
          ) : (
            <p className="mt-1 text-xs text-amber-700">
              ⚠ Cliente todavía no confirmó pago. Verificá antes de confirmar.
            </p>
          )}
        </section>

        {loadingSale ? (
          <p className="text-sm text-gray-500">Cargando ítems…</p>
        ) : fullSale && fullSale.items ? (
          <section className="rounded-md border border-gray-200 p-3 text-sm">
            <p className="text-xs font-semibold uppercase text-gray-500">Ítems</p>
            <ul className="mt-2 space-y-1">
              {fullSale.items.map((it) => (
                <li key={it.id} className="flex justify-between gap-2">
                  <span>
                    <span className="font-mono font-bold">×{it.quantity}</span>{' '}
                    <span className="font-medium">{it.productName ?? 'producto'}</span>
                    {it.sizeName ? <span className="text-gray-500"> · {it.sizeName}</span> : null}
                  </span>
                  <span className="tabular-nums">{COP.format(it.lineTotal)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section>
          <Label>Método de pago verificado</Label>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {METHODS.map((m) => (
              <button
                key={m.method}
                type="button"
                onClick={() => setMethod(m.method)}
                className={`rounded-md border px-3 py-2 text-sm font-medium transition ${
                  method === m.method
                    ? 'border-blue-600 bg-blue-50 text-blue-900'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </section>

        {isDigital ? (
          <section className="space-y-3 rounded-md bg-gray-50 p-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="d1">Monto 1</Label>
                <Input
                  id="d1"
                  type="number"
                  min="0"
                  step="1"
                  inputMode="decimal"
                  value={digital1}
                  onChange={(e) => setDigital1(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="d2">Monto 2</Label>
                <Input
                  id="d2"
                  type="number"
                  min="0"
                  step="1"
                  inputMode="decimal"
                  value={digital2}
                  onChange={(e) => setDigital2(e.target.value)}
                />
              </div>
            </div>
            <label className="flex cursor-pointer items-start gap-2 rounded-md border border-gray-200 bg-white p-3">
              <input
                type="checkbox"
                checked={doubleVerified}
                onChange={(e) => setDoubleVerified(e.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              <span className="text-xs text-gray-700">
                Verifiqué app del negocio + comprobante del cliente.
              </span>
            </label>
          </section>
        ) : null}

        {!validation.ok && method ? (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {validation.reason}
          </p>
        ) : null}
        {error ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!validation.ok || pending}>
            {pending ? 'Confirmando…' : `Confirmar ${COP.format(total)}`}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
