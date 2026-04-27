'use client';

import { Button, Input, Label } from '@pos-tercos/ui';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import type { Stockable } from '@pos-tercos/types';
import { createMovement } from '../api/client';

interface AdjustStockFormProps {
  stockable: Stockable;
}

type MovementKind = 'MANUAL_ADJUSTMENT' | 'WASTE' | 'INITIAL';

const TYPE_OPTIONS: Array<{ value: MovementKind; label: string; hint: string }> = [
  {
    value: 'MANUAL_ADJUSTMENT',
    label: 'Ajuste manual',
    hint: 'Corrección por conteo físico o error de captura.',
  },
  {
    value: 'WASTE',
    label: 'Merma',
    hint: 'Pérdida durante limpieza, vencimiento, derrame, etc.',
  },
  {
    value: 'INITIAL',
    label: 'Stock inicial',
    hint: 'Solo al cargar el sistema por primera vez.',
  },
];

export function AdjustStockForm({ stockable }: AdjustStockFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<MovementKind>('MANUAL_ADJUSTMENT');
  const [direction, setDirection] = useState<'IN' | 'OUT'>('IN');
  const [magnitude, setMagnitude] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const projected = useMemo(() => {
    const m = Number(magnitude);
    if (!Number.isFinite(m) || m <= 0) return null;
    const delta = direction === 'IN' ? m : -m;
    return stockable.currentStock + delta;
  }, [magnitude, direction, stockable.currentStock]);

  const wasteForcesNegative = type === 'WASTE';

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const m = Number(magnitude);
    if (!Number.isFinite(m) || m <= 0) {
      setError('La magnitud debe ser un número positivo.');
      return;
    }

    const effectiveDirection = wasteForcesNegative ? 'OUT' : direction;
    const delta = effectiveDirection === 'IN' ? m : -m;

    setSubmitting(true);
    try {
      await createMovement(
        stockable.type === 'INGREDIENT'
          ? {
              entityType: 'INGREDIENT',
              ingredientId: stockable.id,
              delta,
              type,
              notes: notes.trim() || undefined,
            }
          : {
              entityType: 'PRODUCT',
              productId: stockable.id,
              delta,
              type,
              notes: notes.trim() || undefined,
            },
      );
      startTransition(() => {
        router.push('/inventory');
        router.refresh();
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 rounded-lg border border-gray-200 bg-white p-6"
    >
      <section className="rounded-md bg-gray-50 p-4 text-sm">
        <p className="font-medium text-gray-900">{stockable.name}</p>
        <dl className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
          <div>
            <dt className="text-gray-500">Stock actual</dt>
            <dd className="font-mono font-semibold text-gray-900">
              {stockable.currentStock.toLocaleString('es-CO', { maximumFractionDigits: 4 })}{' '}
              {stockable.unitStock}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Threshold</dt>
            <dd className="font-mono text-gray-900">
              {stockable.thresholdMin.toLocaleString('es-CO', { maximumFractionDigits: 4 })}{' '}
              {stockable.unitStock}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Estado</dt>
            <dd>
              {stockable.lowStock ? (
                <span className="font-semibold text-amber-700">Stock crítico</span>
              ) : (
                <span className="font-semibold text-green-700">OK</span>
              )}
            </dd>
          </div>
        </dl>
      </section>

      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          Tipo de movimiento
        </legend>
        <div className="space-y-2">
          {TYPE_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors ${
                type === opt.value
                  ? 'border-blue-300 bg-blue-50/50'
                  : 'border-gray-200 hover:bg-gray-50'
              }`}
            >
              <input
                type="radio"
                name="type"
                checked={type === opt.value}
                onChange={() => {
                  setType(opt.value);
                  if (opt.value === 'WASTE') setDirection('OUT');
                }}
                disabled={submitting}
                className="mt-0.5 h-4 w-4 text-blue-600 focus:ring-blue-500"
              />
              <span>
                <span className="font-medium text-gray-900">{opt.label}</span>
                <span className="block text-xs text-gray-500">{opt.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {!wasteForcesNegative && (
        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Dirección
          </legend>
          <div className="flex gap-3 text-sm">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="direction"
                checked={direction === 'IN'}
                onChange={() => setDirection('IN')}
                disabled={submitting}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500"
              />
              Entrada (+)
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="direction"
                checked={direction === 'OUT'}
                onChange={() => setDirection('OUT')}
                disabled={submitting}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500"
              />
              Salida (−)
            </label>
          </div>
        </fieldset>
      )}

      <div className="space-y-2">
        <Label htmlFor="magnitude">Magnitud ({stockable.unitStock})</Label>
        <Input
          id="magnitude"
          type="number"
          inputMode="decimal"
          step="any"
          min="0"
          required
          disabled={submitting}
          value={magnitude}
          onChange={(e) => setMagnitude(e.target.value)}
          placeholder="100"
        />
        {projected !== null && (
          <p className="text-xs text-gray-600">
            Proyección: <span className="font-mono">{stockable.currentStock.toLocaleString('es-CO', { maximumFractionDigits: 4 })}</span>
            {' '}
            {wasteForcesNegative || direction === 'OUT' ? '−' : '+'} <span className="font-mono">{magnitude}</span>
            {' = '}
            <span
              className={`font-mono font-semibold ${
                projected < stockable.thresholdMin ? 'text-amber-700' : 'text-gray-900'
              }`}
            >
              {projected.toLocaleString('es-CO', { maximumFractionDigits: 4 })} {stockable.unitStock}
            </span>
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notas (opcional)</Label>
        <textarea
          id="notes"
          maxLength={500}
          rows={3}
          disabled={submitting}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Razón del ajuste, referencia a una factura, etc."
          className="flex w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
        />
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => router.push('/inventory')}
          disabled={submitting || pending}
        >
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={submitting || pending}>
          {submitting ? 'Registrando…' : 'Registrar movimiento'}
        </Button>
      </div>
    </form>
  );
}
