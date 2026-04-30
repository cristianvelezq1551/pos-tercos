'use client';

import { Button, Input, Label } from '@pos-tercos/ui';
import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent } from 'react';
import { openShift } from '../api/open';

export function OpenShiftForm() {
  const router = useRouter();
  const [openingCash, setOpeningCash] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsed = Number(openingCash.replace(/[\s.,]/g, (m) => (m === ',' ? '.' : '')));
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError('Ingresá un monto válido (>= 0)');
      return;
    }

    try {
      await openShift({
        openingCash: parsed,
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
      className="w-full max-w-md space-y-5 rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
    >
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Abrir turno</h1>
        <p className="mt-1 text-sm text-gray-600">
          Contá la plata que hay en caja antes de empezar a vender.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="openingCash">Efectivo inicial (COP)</Label>
        <Input
          id="openingCash"
          type="number"
          min="0"
          step="100"
          inputMode="decimal"
          placeholder="50000"
          value={openingCash}
          onChange={(e) => setOpeningCash(e.target.value)}
          autoFocus
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notas (opcional)</Label>
        <Input
          id="notes"
          type="text"
          placeholder="Ej. cambio recibido del turno anterior"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={200}
        />
      </div>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Abriendo turno…' : 'Abrir turno'}
      </Button>
    </form>
  );
}
