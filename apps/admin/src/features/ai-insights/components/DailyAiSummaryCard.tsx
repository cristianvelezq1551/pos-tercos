'use client';

import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { fetchDailySummary } from '../api/client';

/** Tarjeta on-demand: resumen del día en lenguaje natural para el dueño. */
export function DailyAiSummaryCard() {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchDailySummary();
      setText(res.text);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar el resumen');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Sparkles className="h-5 w-5 text-primary" strokeWidth={1.75} />
          Resumen del día (IA)
        </h2>
        <button
          type="button"
          onClick={() => void run()}
          disabled={loading}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Generando…' : text ? 'Regenerar' : 'Generar'}
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : text ? (
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
          {text}
        </p>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          Generá un resumen ejecutivo del día: ventas, anulaciones, descuadres, demoras de
          cocina y una sugerencia.
        </p>
      )}
    </section>
  );
}
