'use client';

import { Button, FormField, Input, NumberInput } from '@pos-tercos/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition, type FormEvent } from 'react';
import {
  enqueueOfflineShiftOpen,
  offlineDb,
  useConnectivity,
  type OfflineShiftOpen,
} from '../../offline';
import { openShift } from '../api/open';
import { getErrorMessage } from '../../../lib/errors';

export function OpenShiftForm() {
  const router = useRouter();
  const status = useConnectivity();
  const [openingCash, setOpeningCash] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // B.4b: apertura offline ya registrada (la página recargó y volvió acá).
  const [offlinePending, setOfflinePending] = useState<OfflineShiftOpen | null>(null);

  useEffect(() => {
    void offlineDb
      .getShiftOpen()
      .then((s) => {
        if (s && s.status !== 'synced') setOfflinePending(s);
      })
      .catch(() => undefined);
  }, []);

  const openOffline = async (cash: number): Promise<void> => {
    await enqueueOfflineShiftOpen({ openingCash: cash, notes: notes.trim() || undefined });
    // Navegación DURA: offline el router de Next no puede hacer el fetch RSC;
    // el service worker sirve la página cacheada.
    window.location.assign('/caja');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (openingCash === null || openingCash < 0) {
      setError('Ingresa un monto válido (>= 0)');
      return;
    }

    // B.4b: sin conexión, la caja se abre LOCAL y se sincroniza al volver la
    // red (antes que las ventas). El fondo inicial queda registrado igual.
    if (status === 'offline') {
      try {
        await openOffline(openingCash);
      } catch (err) {
        setError(getErrorMessage(err, 'No se pudo registrar la apertura offline'));
      }
      return;
    }

    try {
      await openShift({
        openingCash,
        notes: notes.trim() || undefined,
      });
      startTransition(() => {
        router.replace('/caja');
        router.refresh();
      });
    } catch (err) {
      // El servidor no respondió (se cayó la red entre el heartbeat y el
      // submit): mismo camino offline.
      if (err instanceof Error && err.name === 'NetworkError') {
        try {
          await openOffline(openingCash);
          return;
        } catch {
          /* cae al mensaje de error normal */
        }
      }
      setError(getErrorMessage(err, 'Error desconocido'));
    }
  };

  if (offlinePending) {
    return (
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-foreground">
          Caja abierta sin internet
        </h1>
        <p className="text-sm text-muted-foreground">
          Ya registraste la apertura con{' '}
          <strong className="text-foreground">
            ${offlinePending.openingCash.toLocaleString('es-CO')}
          </strong>{' '}
          de fondo. Se sincroniza sola al volver la conexión — puedes vender normalmente.
        </p>
        {offlinePending.status === 'failed' && offlinePending.failReason ? (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-500">
            Último intento de sincronización: {offlinePending.failReason}
          </p>
        ) : null}
        <Button size="lg" className="w-full" onClick={() => window.location.assign('/caja')}>
          Ir a vender
        </Button>
      </div>
    );
  }

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
          Cuenta el dinero que hay en caja antes de empezar a vender.
        </p>
      </div>

      {status === 'offline' ? (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-500">
          Sin conexión: la caja se abre en este dispositivo y se sincroniza sola
          cuando vuelva internet.
        </p>
      ) : null}

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
        {pending ? 'Abriendo turno…' : status === 'offline' ? 'Abrir turno (offline)' : 'Abrir turno'}
      </Button>
    </form>
  );
}
