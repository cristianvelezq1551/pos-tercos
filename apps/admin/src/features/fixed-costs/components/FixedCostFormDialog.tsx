'use client';

import type { FixedCost, FixedCostFrequency } from '@pos-tercos/types';
import { FIXED_COST_CATEGORIES } from '@pos-tercos/types';
import { Button, Dialog, FormField, Input, MoneyInput, Select } from '@pos-tercos/ui';
import { useState } from 'react';
import { createFixedCost, updateFixedCost } from '../api/client';
import { getErrorMessage } from '../../../lib/errors';

export function FixedCostFormDialog({
  initial,
  onClose,
  onSaved,
}: {
  initial: FixedCost | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = initial !== null;
  const [name, setName] = useState(initial?.name ?? '');
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '');
  const [frequency, setFrequency] = useState<FixedCostFrequency>(initial?.frequency ?? 'MONTHLY');
  const [category, setCategory] = useState(initial?.category ?? 'Otros');
  const [startedAt, setStartedAt] = useState(initial?.startedAt ?? '');
  const [endedAt, setEndedAt] = useState(initial?.endedAt ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOneTime = frequency === 'ONE_TIME';
  const canSubmit =
    name.trim().length > 0 &&
    Number(amount) > 0 &&
    (!isOneTime || startedAt.length > 0) &&
    !pending;

  const handleSave = async (): Promise<void> => {
    setError(null);
    setPending(true);
    try {
      const payload = {
        name: name.trim(),
        amount: Number(amount),
        frequency,
        category: category.trim(),
        startedAt: startedAt || null,
        endedAt: endedAt || null,
        notes: notes.trim() || null,
      };
      if (isEdit && initial) {
        await updateFixedCost(initial.id, { ...payload, isActive });
      } else {
        await createFixedCost(payload);
      }
      onSaved();
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo guardar.'));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={isEdit ? `Editar "${initial?.name}"` : 'Nuevo costo o gasto'}
      description="Entra al estado financiero. Mensual = cada mes; Anual = ÷12; Puntual = una vez, en su fecha (ej. una reparación)."
      maxWidth="max-w-md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!canSubmit}>
            {pending ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <FormField label="Nombre" required>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej. Arriendo local, Internet, Contador"
            disabled={pending}
          />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Monto" required>
            <MoneyInput value={amount} onChange={setAmount} disabled={pending} placeholder="0" />
          </FormField>
          <FormField label="Frecuencia" required>
            <Select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as FixedCostFrequency)}
              disabled={pending}
            >
              <option value="MONTHLY">Mensual</option>
              <option value="ANNUAL">Anual (se prorratea ÷12)</option>
              <option value="ONE_TIME">Puntual (gasto único)</option>
            </Select>
          </FormField>
        </div>
        <FormField label="Categoría">
          <Select value={category} onChange={(e) => setCategory(e.target.value)} disabled={pending}>
            {FIXED_COST_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </FormField>
        {isOneTime ? (
          <FormField label="Fecha del gasto" required hint="Define en qué mes pega al estado financiero">
            <Input type="date" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} disabled={pending} />
          </FormField>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Vigente desde" hint="Opcional">
              <Input type="date" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} disabled={pending} />
            </FormField>
            <FormField label="Vigente hasta" hint="Opcional">
              <Input type="date" value={endedAt} onChange={(e) => setEndedAt(e.target.value)} disabled={pending} />
            </FormField>
          </div>
        )}
        <FormField label="Notas" hint="Opcional">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} disabled={pending} />
        </FormField>
        {isEdit && (
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              disabled={pending}
              className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
            />
            Activo (cuenta en el cálculo del mes)
          </label>
        )}
        {error ? (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
