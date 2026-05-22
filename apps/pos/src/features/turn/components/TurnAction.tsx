'use client';

import { Button, Dialog, Input } from '@pos-tercos/ui';
import { useEffect, useState } from 'react';
import {
  advanceTurn,
  getDisplayState,
  resetTurn,
  setTurn,
} from '../api/client';

const POLL_MS = 8000;

export function TurnAction() {
  const [open, setOpen] = useState(false);
  const [turn, setTurnState] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const state = await getDisplayState();
        if (!cancelled) setTurnState(state.currentTurn);
      } catch {
        // silencio: la pantalla pública es la fuente de verdad. El POS solo refleja.
      }
    };
    void tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const run = async (action: () => Promise<{ currentTurn: number }>) => {
    setPending(true);
    setError(null);
    try {
      const res = await action();
      setTurnState(res.currentTurn);
      setDraft('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setPending(false);
    }
  };

  const handleSet = () => {
    const value = Number(draft);
    if (!Number.isInteger(value) || value < 1 || value > 9999) {
      setError('Ingresa un número entero entre 1 y 9999.');
      return;
    }
    void run(() => setTurn(value));
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        title="Cambiar turno mostrado en pantalla pública"
      >
        Turno · #{turn ?? '—'}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Turno en pantalla"
        description="Controla el número que se muestra en la pantalla pública. Cambia en vivo."
        maxWidth="max-w-md"
      >
        <div className="space-y-5 px-6 py-5">
          <div className="rounded-2xl border border-border bg-card px-5 py-6 text-center">
            <p className="caps text-[0.625rem] tracking-[0.3em] text-muted-foreground">
              Turno actual
            </p>
            <p className="mt-2 font-display text-6xl font-extrabold tabular text-foreground">
              #{turn ?? '—'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              size="lg"
              disabled={pending || (turn ?? 1) <= 1}
              onClick={() => void run(() => setTurn(Math.max(1, (turn ?? 1) - 1)))}
            >
              ← Anterior
            </Button>
            <Button
              variant="default"
              size="lg"
              disabled={pending}
              onClick={() => void run(advanceTurn)}
            >
              Siguiente →
            </Button>
          </div>
          <Button
            variant="outline"
            size="lg"
            className="w-full"
            disabled={pending}
            onClick={() => void run(resetTurn)}
          >
            Reiniciar a #1
          </Button>

          <div className="space-y-2">
            <label className="caps text-[0.6875rem] tracking-[0.2em] text-muted-foreground">
              Fijar turno manualmente
            </label>
            <div className="flex gap-2">
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={9999}
                placeholder="Ej: 42"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={pending}
              />
              <Button
                variant="secondary"
                size="default"
                disabled={pending || !draft}
                onClick={handleSet}
              >
                Fijar
              </Button>
            </div>
          </div>

          {error ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      </Dialog>
    </>
  );
}
