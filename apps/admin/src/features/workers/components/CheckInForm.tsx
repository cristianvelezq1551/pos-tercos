'use client';

import { Button } from '@pos-tercos/ui';
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
      <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        No hay usuarios activos para registrar asistencia.
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-gray-900">Registrar entrada</h3>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_2fr_auto]">
        <select
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="h-10 rounded-md border border-gray-300 bg-white px-2 text-sm"
        >
          {workers.map((w) => (
            <option key={w.id} value={w.id}>
              {w.fullName} · {w.role}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notas (opcional)"
          maxLength={500}
          className="h-10 rounded-md border border-gray-300 bg-white px-3 text-sm"
        />
        <Button onClick={submit} disabled={pending || !userId}>
          {pending ? 'Registrando…' : 'Check-in'}
        </Button>
      </div>
      {error && (
        <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
    </div>
  );
}
