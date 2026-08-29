'use client';

import type { PurchaseList } from '@pos-tercos/types';
import { Button } from '@pos-tercos/ui';
import { Sparkles } from 'lucide-react';

interface Props {
  list: PurchaseList;
  /** Hay otra acción en curso: no se encima una revisión. */
  disabled: boolean;
  reviewing: boolean;
  onReview: () => void;
}

/**
 * La segunda opinión sobre la lista: si las cantidades alcanzan o se va a
 * quedar corto. La IA cruza lo que se va a comprar contra el mínimo y contra el
 * consumo real de los últimos 30 días — sin ese último dato solo repetiría la
 * cuenta del mínimo, que la tabla ya muestra.
 */
export function AiReviewSection({ list, disabled, reviewing, onReview }: Props) {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">¿Las cantidades alcanzan?</h2>
        <Button
          size="sm"
          variant="ghost"
          type="button"
          disabled={disabled || list.items.length === 0}
          onClick={onReview}
        >
          <Sparkles className="mr-1 h-3.5 w-3.5" strokeWidth={1.75} />
          {reviewing ? 'Revisando…' : list.aiRationale ? 'Revisar otra vez' : 'Revisar con IA'}
        </Button>
      </div>

      {list.aiRationale ? (
        <div className="mt-3 space-y-2">
          <p className="rounded-md bg-muted px-4 py-3 text-sm leading-relaxed text-foreground">
            {list.aiRationale}
          </p>
          <p className="text-xs text-muted-foreground">
            <span title={list.aiModel ?? undefined}>Revisado por IA</span>
            {list.aiEvaluatedAt
              ? ` · ${new Date(list.aiEvaluatedAt).toLocaleString('es-CO')}`
              : ''}
          </p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          La IA compara lo que vas a comprar contra el mínimo y contra lo que consumiste en los
          últimos 30 días, y te dice en cuáles te vas a quedar corto.
        </p>
      )}
    </section>
  );
}
