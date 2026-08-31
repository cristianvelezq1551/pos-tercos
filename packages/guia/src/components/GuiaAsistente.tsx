'use client';

import { Sparkles } from 'lucide-react';
import { GuiaAsistenteForm } from './GuiaAsistenteForm';

/**
 * El asistente dentro de la página, en su recuadro. Lo usa la guía de cocina;
 * en gestión el mismo formulario vive en la burbuja flotante.
 */
export function GuiaAsistente({ ask }: { ask: (q: string) => Promise<string> }) {
  return (
    <section
      aria-labelledby="asistente-titulo"
      className="rounded-xl border border-primary/30 bg-primary/5 p-4 sm:p-5"
    >
      <h2
        id="asistente-titulo"
        className="flex items-center gap-2 font-display text-lg font-bold text-foreground"
      >
        <Sparkles className="h-5 w-5 shrink-0 text-primary" strokeWidth={2} aria-hidden />
        Pregunta con tus palabras
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Responde con lo que dice esta guía. No ve las ventas ni el inventario: para eso te dice
        dónde mirarlos.
      </p>

      <div className="mt-3">
        <GuiaAsistenteForm ask={ask} />
      </div>
    </section>
  );
}
