'use client';

import { totalCuadra } from '@pos-tercos/domain';
import type { Invoice } from '@pos-tercos/types';
import { Button, Dialog, FormField, Label, MoneyInput, formatCop } from '@pos-tercos/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { updateInvoiceFreight } from '../api/client';
import { getErrorMessage } from '../../../lib/errors';

/**
 * Corregir el domicilio de una factura ya confirmada.
 *
 * El caso real: el flete no venía en el papel, se le pagó en efectivo al que
 * trajo la mercancía, y el dueño lo recuerda al rato.
 *
 * El total se prellena SUMANDO la diferencia —que es el caso común, el flete se
 * pagó aparte— pero queda editable: si el domicilio ya estaba adentro del total,
 * se corrige a mano y la conciliación de abajo lo confirma en vivo.
 */
export function EditFreightDialog({
  invoice,
  open,
  onClose,
}: {
  invoice: Invoice;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const totalActual = invoice.total ?? 0;
  const fleteActual = invoice.freightAmount;
  const pagada = invoice.paymentStatus === 'PAID';

  const [freight, setFreight] = useState(fleteActual > 0 ? String(fleteActual) : '');
  const [total, setTotal] = useState(String(totalActual));
  const [pocket, setPocket] = useState<'EFECTIVO' | 'CUENTA'>('EFECTIVO');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const freightNum = Number(freight) || 0;
  const totalNum = Number(total) || 0;
  const mercancia = totalNum - freightNum;
  const itemsSum = (invoice.items ?? []).reduce((a, it) => a + it.total, 0);
  const diferenciaItems = mercancia - itemsSum;
  const cuadra = totalCuadra({ total: totalNum, itemsSum, freight: freightNum });
  const deltaTotal = totalNum - totalActual;
  const faltaBolsillo = pagada && deltaTotal !== 0;

  /** Al mover el domicilio, el total lo sigue: es lo que se pagó de más. */
  const cambiarFlete = (v: string) => {
    setFreight(v);
    setTotal(String(totalActual + ((Number(v) || 0) - fleteActual)));
  };

  const guardar = async () => {
    setError(null);
    if (freightNum > totalNum) {
      setError('El domicilio no puede ser mayor al total de la factura.');
      return;
    }
    if (!cuadra) {
      setError('El total no cuadra con los ítems más el domicilio. Revisa los montos.');
      return;
    }
    setSaving(true);
    try {
      await updateInvoiceFreight(invoice.id, {
        freight: freightNum,
        total: totalNum,
        ...(faltaBolsillo ? { pocket } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      onClose();
      router.refresh();
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo guardar el domicilio.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Domicilio de esta compra"
      description="Lo que cobraron por traer la mercancía. No encarece ningún producto: entra como gasto del mes."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={() => void guardar()} disabled={saving || !cuadra}>
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Domicilio o flete">
            <MoneyInput value={freight} onChange={cambiarFlete} disabled={saving} placeholder="0" />
          </FormField>
          <FormField label="Total de la factura">
            <MoneyInput value={total} onChange={setTotal} disabled={saving} />
          </FormField>
        </div>

        <dl className="space-y-1 rounded-md border border-border bg-muted/30 px-3 py-2.5 text-sm tabular-nums">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Mercancía (total − domicilio)</dt>
            <dd className="font-medium text-foreground">{formatCop(mercancia)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Suma de los ítems</dt>
            <dd className={cuadra ? 'font-medium text-foreground' : 'font-medium text-warning'}>
              {formatCop(itemsSum)}
            </dd>
          </div>
          <p className={`pt-1 text-xs ${cuadra ? 'text-success' : 'text-warning'}`}>
            {cuadra
              ? 'Cuadra.'
              : diferenciaItems > 0
                ? `Sobran ${formatCop(diferenciaItems)} sin explicar. Súbelos al domicilio o baja el total.`
                : `Faltan ${formatCop(Math.abs(diferenciaItems))} para cubrir los ítems. Sube el total.`}
          </p>
        </dl>

        {faltaBolsillo && (
          <div className="space-y-2 rounded-md border border-warning-border bg-warning-bg/20 px-3 py-2.5">
            <Label className="text-sm text-foreground">
              {deltaTotal > 0
                ? `Pagaste ${formatCop(deltaTotal)} de más. ¿De dónde salió?`
                : `Vuelven ${formatCop(Math.abs(deltaTotal))}. ¿A dónde van?`}
            </Label>
            <div className="flex gap-2">
              {(['EFECTIVO', 'CUENTA'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPocket(p)}
                  disabled={saving}
                  className={`rounded-md border px-3 py-1.5 text-sm transition ${
                    pocket === p
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {p === 'EFECTIVO' ? 'Efectivo' : 'Cuenta'}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Esta factura ya está pagada, así que hay que decir de qué bolsillo salió la
              diferencia o el saldo de tesorería deja de cuadrar.
            </p>
          </div>
        )}

        <FormField label="Nota" hint="Opcional. Queda en la bitácora.">
          <input
            type="text"
            maxLength={300}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={saving}
            placeholder="Le pagué en efectivo al que trajo el pedido"
            className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </FormField>

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
