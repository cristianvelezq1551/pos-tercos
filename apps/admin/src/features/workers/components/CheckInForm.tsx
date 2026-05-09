'use client';

import { Button, Input, Select } from '@pos-tercos/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { checkIn } from '../api';

export interface WorkerOption {
  id: string;
  fullName: string;
  role: string;
}

interface CheckInFormProps {
  workers: WorkerOption[];
}

export function CheckInForm({ workers }: CheckInFormProps) {
  const router = useRouter();
  const [userId, setUserId] = useState<string>(workers[0]?.id ?? '');
  const [notes, setNotes] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!userId) return;
    setPending(true);
    setError(null);
    try {
      await checkIn(userId, notes ? { notes } : {});
      setNotes('');
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
    setPending(false);
  };

  if (workers.length === 0) {
    return (
      <p
        role="alert"
        className="rounded-xl border border-warning-border bg-warning-bg px-3 py-2 text-sm text-warning"
      >
        No hay usuarios activos para registrar asistencia.
      </p>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <h3 className="font-display text-base font-bold tracking-tight text-foreground">
        Registrar entrada
      </h3>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_2fr_auto]">
        <Select value={userId} onChange={(e) => setUserId(e.target.value)} disabled={pending}>
          {workers.map((w) => (
            <option key={w.id} value={w.id}>
              {w.fullName} · {w.role}
            </option>
          ))}
        </Select>
        <Input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notas (opcional)"
          maxLength={500}
          disabled={pending}
        />
        <Button onClick={submit} disabled={pending || !userId}>
          {pending ? 'Registrando…' : 'Check-in'}
        </Button>
      </div>
      {error ? (
        <p
          role="alert"
          className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
