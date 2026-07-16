'use client';

import type { ProductionRun, SubproductProductionStatus } from '@pos-tercos/types';
import { Button, Dialog, Input, Label, pluralizeUnit } from '@pos-tercos/ui';
import { useState } from 'react';
import { getErrorMessage } from '../../lib/errors';
import { randomUUID } from '../../lib/uuid';
import { produce, uploadEvidence } from './api';

/** Modal para registrar una tanda de producción de un subproducto. */
export function ProduceModal({
  subproduct,
  open,
  onClose,
  onProduced,
}: {
  subproduct: SubproductProductionStatus | null;
  open: boolean;
  onClose: () => void;
  onProduced: () => void;
}) {
  const [qty, setQty] = useState('');
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<ProductionRun | null>(null);

  if (!subproduct) return null;

  const reset = () => {
    setQty('');
    setNotes('');
    setPhoto(null);
    setError(null);
    setDone(null);
    setPending(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const submit = async () => {
    const n = Number(qty);
    if (!Number.isFinite(n) || n <= 0) {
      setError('Ingresá una cantidad mayor a 0.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      // Si hay foto, se sube primero y se pasa su key a la producción.
      const evidenceKey = photo ? await uploadEvidence(photo) : undefined;
      const run = await produce(subproduct.id, {
        quantityProduced: n,
        notes: notes.trim() || undefined,
        evidenceKey,
        idempotencyKey: randomUUID(),
      });
      setDone(run);
      onProduced();
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo registrar la producción'));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={pending ? () => {} : close}
      title={done ? '¡Producción registrada!' : `Producir ${subproduct.name}`}
      maxWidth="max-w-md"
      footer={
        done ? (
          <Button onClick={close}>Listo</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={close} disabled={pending}>
              Cancelar
            </Button>
            <Button onClick={() => void submit()} disabled={pending}>
              {pending ? 'Registrando…' : 'Registrar'}
            </Button>
          </>
        )
      }
    >
      {done ? (
        <div className="space-y-3 text-sm">
          <p className="text-foreground">
            +{done.quantityProduced} {pluralizeUnit(done.unit, done.quantityProduced)} de{' '}
            <b>{done.subproductName}</b>.
          </p>
          {done.consumed.length > 0 ? (
            <div>
              <p className="caps mb-1 text-[0.6875rem] font-semibold tracking-[0.15em] text-muted-foreground">
                Se descontó del inventario
              </p>
              <ul className="space-y-1">
                {done.consumed.map((c) => (
                  <li key={`${c.entityType}-${c.entityId}`} className="flex justify-between gap-2">
                    <span className="text-foreground">{c.name}</span>
                    <span className="tabular-nums text-muted-foreground">
                      −{fmt(c.quantityConsumed)} {pluralizeUnit(c.unit, c.quantityConsumed)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Stock actual: <b className="text-foreground">{fmt(subproduct.currentStock)}</b>{' '}
            {pluralizeUnit(subproduct.unit, subproduct.currentStock)} · una tanda rinde{' '}
            {subproduct.yield} {pluralizeUnit(subproduct.unit, subproduct.yield)}
          </p>
          <div>
            <Label htmlFor="qty">Cantidad producida ({subproduct.unit})</Label>
            <Input
              id="qty"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="notes">Notas (opcional)</Label>
            <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="incidencias, lote…" />
          </div>
          <div>
            <Label htmlFor="photo">Foto de evidencia (opcional)</Label>
            <input
              id="photo"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary"
            />
            {photo ? (
              <p className="mt-1 text-xs text-muted-foreground">📷 {photo.name}</p>
            ) : null}
          </div>
          {error ? (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}
