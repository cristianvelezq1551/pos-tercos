'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@pos-tercos/ui';
import type { PurchaseSuggestion } from '@pos-tercos/types';
import { formatCop, formatNumber } from '../../../lib/format';
import { StockableTypeBadge } from '../../../components/StockableTypeBadge';
import {
  acceptSuggestion,
  evaluateSuggestion,
  rejectSuggestion,
} from '../api';
import { getErrorMessage } from '../../../lib/errors';
import { CoverageExplainer } from './CoverageExplainer';
import { SendToSupplierDialog } from './SendToSupplierDialog';

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
  const [sendOpen, setSendOpen] = useState(false);

  const isOpen =
    suggestion.status === 'PENDING' || suggestion.status === 'EVALUATED';

  async function handleEvaluate() {
    setPending('evaluate');
    setError(null);
    try {
      const updated = await evaluateSuggestion(suggestion.id);
      setSuggestion(updated);
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo evaluar con IA.'));
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
      setError(getErrorMessage(e, 'No se pudo resolver la sugerencia.'));
    }
    setPending(null);
  }

  return (
    <div className="max-w-3xl space-y-6">
      <CoverageExplainer suggestion={suggestion} />

      <div className="rounded-lg border border-border bg-card p-5">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <Row label="Insumo / producto" value={suggestion.entityName} />
          <Row
            label="Tipo"
            value={
              <StockableTypeBadge type={suggestion.entityType} size="sm" />
            }
          />
          <Row
            label="Existencias al detectarla"
            value={`${formatNumber(suggestion.currentStock, { decimals: 2 })} ${suggestion.unitStock}`}
            mono
          />
          <Row
            label="Mínimo de alerta"
            value={`${formatNumber(suggestion.thresholdMin, { decimals: 2 })} ${suggestion.unitStock}`}
            mono
          />
          <Row
            label="Sugerido"
            value={`${formatNumber(suggestion.suggestedQty, { decimals: 0 })} ${suggestion.unitPurchase}`}
            mono
          />
          <Row
            label={`Costo est. por ${suggestion.unitPurchase}`}
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
              <dt className="col-span-2 mt-2 text-muted-foreground">Nota:</dt>
              <dd className="col-span-2 -mt-1 rounded-md bg-muted/40 px-3 py-2 text-foreground">
                {suggestion.resolutionNote}
              </dd>
            </>
          )}
        </dl>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">
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
            <p className="rounded-md bg-muted px-4 py-3 text-sm leading-relaxed text-foreground">
              {suggestion.llmRationale}
            </p>
            <p className="text-xs text-muted-foreground">
              {/* El código del modelo (claude-haiku-4-5-20251001) no le dice
                  nada a quien lee; queda en el título por si hace falta. */}
              <span title={suggestion.llmModel ?? undefined}>Analizado por IA</span>
              {suggestion.llmEvaluatedAt
                ? ` · ${new Date(suggestion.llmEvaluatedAt).toLocaleString('es-CO')}`
                : ''}
            </p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Aún no fue evaluada. Al evaluar, el asistente revisa el costo
            estimado contra el histórico de compras y comenta si la cantidad y
            el momento de comprar son razonables.
          </p>
        )}
      </div>

      {isOpen && (
        <div className="space-y-3 rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground">Resolver</h2>

          {/* Camino principal: abrir el chat del proveedor con el pedido escrito. */}
          <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
            <p className="text-sm font-medium text-foreground">Pedir al proveedor por WhatsApp</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Eliges el proveedor (queda preseleccionado el más reciente; puedes cambiarlo a cualquiera
              que haya vendido este item) y se abre su chat con el pedido ya escrito, para que lo
              envíes desde tu WhatsApp. La sugerencia queda aceptada.
            </p>
            <Button size="sm" className="mt-3" onClick={() => setSendOpen(true)} disabled={pending !== null}>
              Preparar pedido al proveedor
            </Button>
          </div>

          {/* Alternativa: resolver manualmente sin enviar (ej. ya pediste por fuera). */}
          <div className="border-t border-border pt-3">
            <p className="text-xs text-muted-foreground">
              ¿Ya hiciste el pedido por otro lado o quieres rechazarla? Resuélvela manualmente:
            </p>
            <label className="mt-2 block text-sm">
              <span className="text-foreground">Nota (opcional)</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                rows={2}
                placeholder="Ej. ya pedido por teléfono / no se va a comprar"
                className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm outline-none focus:border-primary focus:ring-1 focus:ring-ring"
              />
            </label>
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => handleResolve('reject')} disabled={pending !== null}>
                {pending === 'reject' ? 'Rechazando…' : 'Rechazar'}
              </Button>
              <Button variant="outline" onClick={() => handleResolve('accept')} disabled={pending !== null}>
                {pending === 'accept' ? 'Aceptando…' : 'Solo marcar aceptada'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {sendOpen ? (
        <SendToSupplierDialog
          suggestion={suggestion}
          onClose={() => setSendOpen(false)}
          onSuccess={(updated) => {
            setSendOpen(false);
            // El estado local NO se actualiza solo con `router.refresh()`:
            // `useState` ignora el prop nuevo porque el componente no se
            // remonta. Sin esto la pantalla seguía diciendo "Pendiente" y
            // dejaba rechazar —o volver a pedir— algo ya aceptado.
            setSuggestion(updated);
            router.refresh();
          }}
        />
      ) : null}

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
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
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`text-foreground ${mono ? 'tabular-nums' : ''}`}>{value}</dd>
    </>
  );
}
