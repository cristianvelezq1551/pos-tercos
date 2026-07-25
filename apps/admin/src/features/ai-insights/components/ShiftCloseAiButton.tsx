'use client';

import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { fetchCloseAnalysis } from '../api/client';
import { getErrorMessage } from '../../../lib/errors';

/** Botón on-demand que pide a la IA explicar el cierre/descuadre de una caja. */
export function ShiftCloseAiButton({ shiftId }: { shiftId: string }) {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchCloseAnalysis(shiftId);
      setText(res.text);
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo generar el análisis'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Sparkles className="h-4 w-4 text-primary" strokeWidth={1.75} />
          Asistente de cierre (IA)
        </h3>
        <button
          type="button"
          onClick={() => void run()}
          disabled={loading}
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted/40 disabled:opacity-50"
        >
          {loading ? 'Analizando…' : text ? 'Regenerar' : 'Analizar cierre'}
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : text ? (
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
          {text}
        </p>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          Pedile a la IA que explique cómo quedó la caja y la causa probable de la diferencia.
        </p>
      )}
    </div>
  );
}
