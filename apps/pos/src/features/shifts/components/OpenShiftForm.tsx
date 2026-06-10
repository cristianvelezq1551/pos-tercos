'use client';

import { Button, FormField, Input, NumberInput } from '@pos-tercos/ui';
import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent } from 'react';
import { openShift } from '../api/open';

export function OpenShiftForm() {
  const router = useRouter();
  const [openingCash, setOpeningCash] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (openingCash === null || openingCash < 0) {
      setError('Ingresa un monto válido (>= 0)');
      return;
    }

    try {
      await openShift({
        openingCash,
        notes: notes.trim() || undefined,
      });
      startTransition(() => {
        router.replace('/');
        router.refresh();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-md space-y-5 rounded-2xl border border-border bg-card p-6 shadow-sm"
    >
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-foreground">
          Abrir turno
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cuenta la plata que hay en caja antes de empezar a vender.
        </p>
      </div>

      <FormField label="Efectivo inicial (COP)" required>
        <NumberInput
          value={openingCash}
          onChange={setOpeningCash}
          prefix="$"
          grouping
          min={0}
          placeholder="50.000"
          autoFocus
          required
        />
      </FormField>

      <FormField label="Notas (opcional)">
        <Input
          type="text"
          placeholder="Ej. cambio recibido del turno anterior"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={200}
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

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? 'Abriendo turno…' : 'Abrir turno'}
      </Button>
    </form>
  );
}
