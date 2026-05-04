'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@pos-tercos/ui';
import type { PurchaseSuggestion } from '@pos-tercos/types';
import { formatCop, formatNumber } from '../../../lib/format';
import {
  acceptSuggestion,
  evaluateSuggestion,
  rejectSuggestion,
} from '../api';

interface SuggestionDetailProps {
  initial: PurchaseSuggestion;
}

export function SuggestionDetail({ initial }: SuggestionDetailProps) {
  const router = useRouter();
  const [suggestion, setSuggestion] = useState<PurchaseSuggestion>(initial);
  const [pending, setPending] = useState<
    'evaluate' | 'accept' | 'reject' | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const isOpen =
    suggestion.status === 'PENDING' || suggestion.status === 'EVALUATED';

  async function handleEvaluate() {
    setPending('evaluate');
    setError(null);
    try {
      const updated = await evaluateSuggestion(suggestion.id);
      setSuggestion(updated);
    } catch (e) {
      setError((e as Error).message);
    }
    setPending(null);
  }

  async function handleResolve(kind: 'accept' | 'reject') {
    setPending(kind);
    setError(null);
    try {
      const fn = kind === 'accept' ? acceptSuggestion : rejectSuggestion;
      const updated = await fn(suggestion.id, note ? { note } : {});
      setSuggestion(updated);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
    setPending(null);
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <Row label="Item" value={suggestion.entityName} />
          <Row
            label="Tipo"
            value={
              suggestion.entityType === 'INGREDIENT' ? '🌾 Insumo' : '📦 Producto'
            }
          />
          <Row
            label="Stock actual"
            value={`${formatNumber(suggestion.currentStock, { decimals: 2 })}`}
            mono
          />
          <Row
            label="Threshold mínimo"
            value={`${formatNumber(suggestion.thresholdMin, { decimals: 2 })}`}
            mono
          />
          <Row
            label="Sugerido"
            value={`${formatNumber(suggestion.suggestedQty, { decimals: 0 })} ${suggestion.unitPurchase}`}
            mono
          />
          <Row
            label="Costo unitario est."
            value={
              suggestion.estUnitCost === null
                ? '—'
                : formatCop(suggestion.estUnitCost)
            }
            mono
          />
          <Row
            label="Total estimado"
            value={
              suggestion.estTotal === null ? '—' : formatCop(suggestion.estTotal)
            }
            mono
          />
          <Row
            label="Detectada"
            value={new Date(suggestion.createdAt).toLocaleString('es-CO')}
            mono
          />
          {suggestion.resolvedAt && (
            <>
              <Row
                label="Resuelta por"
                value={suggestion.resolvedByName ?? '—'}
              />
              <Row
                label="Resuelta el"
                value={new Date(suggestion.resolvedAt).toLocaleString('es-CO')}
                mono
              />
            </>
          )}
          {suggestion.resolutionNote && (
            <>
              <dt className="col-span-2 mt-2 text-gray-500">Nota:</dt>
              <dd className="col-span-2 -mt-1 rounded-md bg-gray-50 px-3 py-2 text-gray-800">
                {suggestion.resolutionNote}
              </dd>
            </>
          )}
        </dl>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">
            Análisis del asistente IA
          </h2>
          {isOpen && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleEvaluate}
              disabled={pending !== null}
            >
              {pending === 'evaluate'
                ? 'Evaluando…'
                : suggestion.llmRationale
                  ? 'Re-evaluar'
                  : 'Evaluar con IA'}
            </Button>
          )}
        </div>
        {suggestion.llmRationale ? (
          <div className="mt-3 space-y-2">
            <p className="rounded-md bg-purple-50 px-4 py-3 text-sm leading-relaxed text-gray-800">
              {suggestion.llmRationale}
            </p>
            <p className="text-xs text-gray-500">
              {suggestion.llmModel} ·{' '}
              {suggestion.llmEvaluatedAt
                ? new Date(suggestion.llmEvaluatedAt).toLocaleString('es-CO')
                : ''}
            </p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-gray-500">
            Aún no fue evaluada. Al evaluar, el asistente revisa el costo
            estimado contra el histórico de compras y comenta si la cantidad +
            timing son razonables.
          </p>
        )}
      </div>

      {isOpen && (
        <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">Resolver</h2>
          <label className="block text-sm">
            <span className="text-gray-700">Nota (opcional)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Ej. ya pedí por whatsapp / espero a viernes"
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => handleResolve('reject')}
              disabled={pending !== null}
            >
              {pending === 'reject' ? 'Rechazando…' : 'Rechazar'}
            </Button>
            <Button
              onClick={() => handleResolve('accept')}
              disabled={pending !== null}
            >
              {pending === 'accept' ? 'Aceptando…' : 'Aceptar'}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <Button variant="ghost" onClick={() => router.push('/purchase-suggestions')}>
        ← Volver al listado
      </Button>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <>
      <dt className="text-gray-500">{label}</dt>
      <dd className={`text-gray-900 ${mono ? 'tabular-nums' : ''}`}>{value}</dd>
    </>
  );
}
