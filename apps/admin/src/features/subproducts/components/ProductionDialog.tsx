'use client';

import type { ProductionRun, Subproduct } from '@pos-tercos/types';
import {
  Button,
  Dialog,
  FormField,
  Input,
  NumberInput,
  formatNumber,
  pluralizeUnit,
} from '@pos-tercos/ui';
import { useState } from 'react';
import { produceSubproduct } from '../api/client';
import { getErrorMessage } from '../../../lib/errors';

/**
 * Diálogo para registrar una tanda de producción de un subproducto.
 *
 * Input simple: cuántas unidades del subproducto se van a producir (en
 * `subproduct.unit`). El backend convierte a "veces que se ejecuta la
 * receta" usando `qty / yield` y valida que haya stock de insumos.
 *
 * Errores típicos:
 *  - 409 con detalle ("Stock insuficiente...") cuando algún insumo falta
 *  - 400 cuando el subproducto no tiene receta configurada
 *
 * Idempotency-key se genera al abrir el diálogo: reintentos por red no
 * crean tandas duplicadas.
 */
export function ProductionDialog({
  subproduct,
  open,
  onClose,
  onSuccess,
}: {
  subproduct: Pick<Subproduct, 'id' | 'name' | 'unit' | 'yield'>;
  open: boolean;
  onClose: () => void;
  onSuccess: (run: ProductionRun) => void;
}) {
  const [qty, setQty] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey] = useState(
    () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `prod-${Date.now()}-${Math.random().toString(36).slice(2)}`),
  );

  const submit = async (): Promise<void> => {
    if (qty === null || qty <= 0) {
      setError('Ingresá una cantidad mayor a 0.');
      return;
    }
    setError(null);
    setPending(true);
    try {
      const run = await produceSubproduct(subproduct.id, {
        quantityProduced: qty,
        notes: notes.trim() || undefined,
        idempotencyKey,
      });
      onSuccess(run);
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo registrar la producción.'));
    } finally {
      setPending(false);
    }
  };

  if (!open) return null;

  const recipeRuns = qty !== null && qty > 0 && subproduct.yield > 0
    ? qty / subproduct.yield
    : 0;

  return (
    <Dialog
      open
      onClose={pending ? () => {} : onClose}
      title={`Producir ${subproduct.name}`}
      description={`Registra cuántas unidades preparaste. El sistema descuenta los insumos automáticamente.`}
      maxWidth="max-w-md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending || qty === null || qty <= 0}>
            {pending ? 'Registrando…' : 'Registrar producción'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField
          label={`Cantidad producida (${subproduct.unit})`}
          hint={
            subproduct.yield !== 1
              ? `La receta rinde ${formatNumber(subproduct.yield)} ${pluralizeUnit(subproduct.unit, subproduct.yield)} por preparación.`
              : undefined
          }
          required
        >
          <NumberInput
            value={qty}
            onChange={setQty}
            decimals={4}
            min={0}
            disabled={pending}
            placeholder="50"
          />
        </FormField>

        {recipeRuns > 0 ? (
          <p className="rounded-md border border-info-border bg-info-bg/40 px-3 py-2 text-xs text-info">
            Equivale a <strong>{formatNumber(recipeRuns)}</strong>{' '}
            {recipeRuns === 1 ? 'preparación' : 'preparaciones'} de la receta.
          </p>
        ) : null}

        <FormField label="Notas (opcional)">
          <Input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ej. tanda de la mañana"
            maxLength={500}
            disabled={pending}
          />
        </FormField>

        {error ? (
          <p
            role="alert"
            className="whitespace-pre-line rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
