'use client';

import { cn } from '@pos-tercos/ui';
import { Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { GuiaAsistenteForm } from './GuiaAsistenteForm';

/**
 * El asistente de la guía, disponible desde cualquier pantalla de gestión.
 *
 * Antes solo existía dentro de `/guia`: para preguntar algo había que salir de
 * lo que se estaba haciendo, y quien no sabe que la guía existe nunca lo
 * encontraba. Como burbuja, la ayuda está donde aparece la duda.
 *
 * NO atrapa el foco a propósito (no es un diálogo modal): se consulta MIRANDO
 * la pantalla de atrás, así que tiene que poder quedar abierta mientras se lee
 * el reporte que motivó la pregunta.
 */
export function GuiaAsistenteFlotante({ ask }: { ask: (q: string) => Promise<string> }) {
  const [abierto, setAbierto] = useState(false);
  const lanzador = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const alTecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setAbierto(false);
      // El foco vuelve al lanzador: si se queda en un nodo que se desmontó, el
      // teclado pierde el hilo y se navega desde el principio de la página.
      lanzador.current?.focus();
    };
    window.addEventListener('keydown', alTecla);
    return () => window.removeEventListener('keydown', alTecla);
  }, [abierto]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex flex-col items-end gap-2 p-4 sm:inset-x-auto sm:right-4 sm:p-0 sm:pb-4">
      {abierto ? (
        <section
          id="asistente-flotante"
          role="dialog"
          aria-label="Pregunta con tus palabras"
          className={cn(
            'pointer-events-auto w-full max-w-[26rem] overflow-y-auto rounded-2xl border border-border',
            'bg-card p-4 shadow-2xl',
            // Alto acotado al viewport: una respuesta larga tiene que poder
            // desplazarse DENTRO de la burbuja, no empujarla fuera de pantalla.
            'max-h-[min(32rem,70dvh)]',
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 font-display text-base font-bold text-foreground">
                <Sparkles className="h-4 w-4 shrink-0 text-primary" strokeWidth={2} aria-hidden />
                Pregunta con tus palabras
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Responde con lo que dice la guía. No ve las ventas ni el inventario: para eso te
                dice dónde mirarlos.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setAbierto(false);
                lanzador.current?.focus();
              }}
              aria-label="Cerrar la ayuda"
              className="-mr-1 -mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-400 transition-colors hover:bg-muted/40 hover:text-foreground"
            >
              <X className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>

          <div className="mt-3">
            {/* `key` fuerza un formulario nuevo en cada apertura: reabrir con la
                respuesta anterior todavía puesta se lee como si fuera la de la
                pregunta que se va a hacer ahora. */}
            <GuiaAsistenteForm key={String(abierto)} ask={ask} autoFocus />
          </div>
        </section>
      ) : null}

      <button
        ref={lanzador}
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-controls="asistente-flotante"
        className={cn(
          'pointer-events-auto inline-flex h-14 items-center gap-2 rounded-full pl-4 pr-5',
          'bg-primary text-sm font-semibold text-white shadow-xl transition-colors',
          'hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        <Sparkles className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
        {abierto ? 'Cerrar' : 'Ayuda'}
      </button>
    </div>
  );
}
