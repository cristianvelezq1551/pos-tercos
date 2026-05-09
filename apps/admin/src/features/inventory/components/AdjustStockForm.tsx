'use client';

import {
  Badge,
  Button,
  FormField,
  NumberInput,
  RadioGroup,
  Quantity,
  Textarea,
} from '@pos-tercos/ui';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import type { Stockable } from '@pos-tercos/types';
import { createMovement } from '../api/client';

interface AdjustStockFormProps {
  stockable: Stockable;
}

type MovementKind = 'MANUAL_ADJUSTMENT' | 'WASTE' | 'INITIAL';

const TYPE_OPTIONS = [
  {
    value: 'MANUAL_ADJUSTMENT',
    label: 'Ajuste manual',
    description: 'Corrección por conteo físico o error de captura.',
  },
  {
    value: 'WASTE',
    label: 'Merma',
    description: 'Pérdida durante limpieza, vencimiento, derrame, etc.',
  },
  {
    value: 'INITIAL',
    label: 'Stock inicial',
    description: 'Solo al cargar el sistema por primera vez.',
  },
];

export function AdjustStockForm({ stockable }: AdjustStockFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<MovementKind>('MANUAL_ADJUSTMENT');
  const [direction, setDirection] = useState<'IN' | 'OUT'>('IN');
  const [magnitude, setMagnitude] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const projected = useMemo(() => {
    if (magnitude === null || magnitude <= 0) return null;
    const delta = direction === 'IN' ? magnitude : -magnitude;
    return stockable.currentStock + delta;
  }, [magnitude, direction, stockable.currentStock]);

  const wasteForcesNegative = type === 'WASTE';

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (magnitude === null || magnitude <= 0) {
      setError('La magnitud debe ser un número positivo.');
      return;
    }

    const effectiveDirection = wasteForcesNegative ? 'OUT' : direction;
    const delta = effectiveDirection === 'IN' ? magnitude : -magnitude;

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
      className="space-y-6 rounded-2xl border border-border bg-card p-6"
    >
      <section className="rounded-xl bg-muted/40 p-4 text-sm">
        <p className="font-display text-base font-bold text-foreground">{stockable.name}</p>
        <dl className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Stock actual</dt>
            <dd className="font-semibold text-foreground">
              <Quantity value={stockable.currentStock} unit={stockable.unitStock} decimals={4} />
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Threshold</dt>
            <dd>
              <Quantity value={stockable.thresholdMin} unit={stockable.unitStock} decimals={4} />
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Estado</dt>
            <dd>
              {stockable.lowStock ? (
                <Badge tone="warning" size="sm" withDot>
                  Stock crítico
                </Badge>
              ) : (
                <Badge tone="success" size="sm">
                  OK
                </Badge>
              )}
            </dd>
          </div>
        </dl>
      </section>

      <fieldset className="space-y-2">
        <legend className="caps text-[0.6875rem] text-muted-foreground">Tipo de movimiento</legend>
        <RadioGroup
          name="type"
          value={type}
          onChange={(v) => {
            setType(v as MovementKind);
            if (v === 'WASTE') setDirection('OUT');
          }}
          options={TYPE_OPTIONS}
          layout="card"
        />
      </fieldset>

      {!wasteForcesNegative ? (
        <fieldset className="space-y-2">
          <legend className="caps text-[0.6875rem] text-muted-foreground">Dirección</legend>
          <RadioGroup
            name="direction"
            value={direction}
            onChange={(v) => setDirection(v as 'IN' | 'OUT')}
            options={[
              { value: 'IN', label: 'Entrada (+)' },
              { value: 'OUT', label: 'Salida (−)' },
            ]}
            layout="inline"
          />
        </fieldset>
      ) : null}

      <FormField
        label={`Magnitud (${stockable.unitStock})`}
        hint={
          projected !== null ? (
            <>
              Proyección:{' '}
              <Quantity value={stockable.currentStock} decimals={4} className="text-current" />
              {' '}
              {wasteForcesNegative || direction === 'OUT' ? '−' : '+'}{' '}
              <span className="tabular">{magnitude}</span>
              {' = '}
              <span
                className={`tabular font-semibold ${
                  projected < stockable.thresholdMin ? 'text-warning' : 'text-foreground'
                }`}
              >
                <Quantity
                  value={projected}
                  unit={stockable.unitStock}
                  decimals={4}
                  className="text-current"
                />
              </span>
            </>
          ) : undefined
        }
        required
      >
        <NumberInput
          value={magnitude}
          onChange={setMagnitude}
          decimals={4}
          min={0}
          disabled={submitting}
          suffix={stockable.unitStock}
          placeholder="100"
        />
      </FormField>

      <FormField label="Notas (opcional)">
        <Textarea
          maxLength={500}
          rows={3}
          disabled={submitting}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Razón del ajuste, referencia a una factura, etc."
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

      <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
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
