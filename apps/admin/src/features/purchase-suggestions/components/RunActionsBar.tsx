'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@pos-tercos/ui';
import { evaluateAllPending, runScan } from '../api';

/**
 * Barra de acciones admin para sugerencias:
 *  - Scan manual (corre detector ahora, además del cron horario).
 *  - Evaluar todas las PENDING (LLM batch). Cuesta $$ — solo Dueño.
 */
export function RunActionsBar() {
  const router = useRouter();
  const [pending, setPending] = useState<'scan' | 'eval' | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleScan() {
    setPending('scan');
    setError(null);
    try {
      const r = await runScan();
      setFeedback(
        `Scan ok: ${r.scannedCount} stockables · ${r.createdCount} sugerencias nuevas · ${r.staledCount} marcadas vencidas`,
      );
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
    setPending(null);
  }

  async function handleEvalAll() {
    setPending('eval');
    setError(null);
    setFeedback(null);
    try {
      const r = await evaluateAllPending();
      setFeedback(
        r.failed > 0
          ? `Evaluadas ${r.evaluated} · ${r.failed} fallaron (revisar logs)`
          : `Evaluadas ${r.evaluated} sugerencias`,
      );
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
    setPending(null);
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={handleScan}
          disabled={pending !== null}
        >
          {pending === 'scan' ? 'Escaneando…' : 'Scan manual'}
        </Button>
        <Button
          size="sm"
          onClick={handleEvalAll}
          disabled={pending !== null}
        >
          {pending === 'eval' ? 'Evaluando…' : 'Evaluar pendientes (IA)'}
        </Button>
      </div>
      {feedback && (
        <p className="text-xs text-emerald-700 sm:order-first sm:mr-3">
          {feedback}
        </p>
      )}
      {error && (
        <p className="text-xs text-red-700 sm:order-first sm:mr-3">{error}</p>
      )}
    </div>
  );
}
