'use client';

import type { Sale } from '@pos-tercos/types';
import { Button, Dialog, Input, Label } from '@pos-tercos/ui';
import { useEffect, useState } from 'react';
import { COP } from '../../catalog/lib/format';
import { listSales } from '../api/list';
import { voidSale } from '../api/void';

const VOIDABLE_LIMIT = 20;

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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedId(null);
    setReason('');
    setPin('');
    setError(null);
    setPending(false);
    setLoading(true);
    listSales({ shiftId: shiftId ?? undefined, status: 'PAGADO', limit: VOIDABLE_LIMIT })
      .then(setSales)
      .catch((err) => setError(err instanceof Error ? err.message : 'Error cargando ventas'))
      .finally(() => setLoading(false));
  }, [open, shiftId]);

  const reasonValid = reason.trim().length >= 5 && reason.trim().length <= 200;
  const pinValid = /^\d{6}$/.test(pin);
  const canConfirm = selectedId !== null && reasonValid && pinValid && !pending;

  const handleConfirm = async () => {
    if (!canConfirm || !selectedId) return;
    setError(null);
    setPending(true);
    try {
      const voided = await voidSale(selectedId, { reason: reason.trim() }, pin);
      onSuccess(voided);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={pending ? () => {} : onClose}
      title="Anular venta"
      description="Selecciona la venta, registrá el motivo, e ingresa el PIN del Admin/Dueño."
      maxWidth="max-w-xl"
    >
      <div className="space-y-5">
        <div>
          <Label>Ventas pagadas del turno actual ({sales.length})</Label>
          {loading ? (
            <p className="mt-2 text-sm text-gray-500">Cargando…</p>
          ) : sales.length === 0 ? (
            <p className="mt-2 rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-500">
              No hay ventas pagadas para anular.
            </p>
          ) : (
            <div className="mt-2 max-h-56 overflow-y-auto rounded-md border border-gray-200">
              <ul className="divide-y divide-gray-100">
                {sales.map((s) => (
                  <li key={s.id}>
                    <label
                      className={`flex cursor-pointer items-center justify-between px-3 py-2 text-sm transition ${
                        selectedId === s.id
                          ? 'bg-blue-50 text-blue-900'
                          : 'hover:bg-gray-50'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="sale"
                          checked={selectedId === s.id}
                          onChange={() => setSelectedId(s.id)}
                          className="h-4 w-4"
                        />
                        <span>
                          <span className="font-medium">#{s.receiptNumber}</span>
                          <span className="ml-2 text-xs text-gray-500">
                            {s.paidAt
                              ? new Date(s.paidAt).toLocaleTimeString('es-CO', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : '—'}{' '}
                            · {s.paymentMethod}
                          </span>
                        </span>
                      </span>
                      <span className="tabular-nums font-semibold">
                        {COP.format(s.total)}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="reason">Motivo (5-200 caracteres)</Label>
          <Input
            id="reason"
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej. cliente devolvió por error en el pedido"
            maxLength={200}
          />
          <p className="text-[11px] text-gray-500">
            {reason.trim().length}/200 · queda en audit log
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="pin">PIN del Admin/Dueño (6 dígitos)</Label>
          <Input
            id="pin"
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="••••••"
            maxLength={6}
            className="font-mono tracking-widest"
          />
        </div>

        {error ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="bg-red-600 hover:bg-red-700 disabled:bg-red-300"
          >
            {pending ? 'Anulando…' : 'Anular venta'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
