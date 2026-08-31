'use client';

import { cn } from '@pos-tercos/ui';
import { ChevronDown, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ESTADO_INICIAL, GuiaAsistenteForm, type EstadoAsistente } from './GuiaAsistenteForm';

/**
 * El asistente de la guía, disponible desde cualquier pantalla de gestión.
 *
 * Antes solo existía dentro de `/guia`: para preguntar algo había que salir de
 * lo que se estaba haciendo, y quien no sabe que la guía existe nunca lo
 * encontraba. Como burbuja, la ayuda está donde aparece la duda.
 *
 * Tres estados, y la diferencia entre los dos últimos es la que importa:
 *
 * - **abierta**: se ve la pregunta y la respuesta;
 * - **minimizada**: se aparta para mirar la pantalla de atrás, PERO la
 *   respuesta sigue ahí al volver a abrirla;
 * - **cerrada**: se va del todo, con su respuesta.
 *
 * Al principio cerrar borraba lo leído, así que apartarla un segundo —que es
 * justo para lo que sirve, comparar la respuesta con lo que hay en pantalla—
 * costaba volver a preguntar. Por eso el botón grande MINIMIZA y cerrar del
 * todo es una acción aparte.
 *
 * NO atrapa el foco a propósito (no es un diálogo modal): tiene que poder
 * quedar abierta mientras se lee el reporte que motivó la pregunta.
 */
export function GuiaAsistenteFlotante({ ask }: { ask: (q: string) => Promise<string> }) {
  const [abierto, setAbierto] = useState(false);
  const [cerrado, setCerrado] = useState(false);
  const [estado, setEstado] = useState<EstadoAsistente>(ESTADO_INICIAL);
  const lanzador = useRef<HTMLButtonElement>(null);

  const minimizar = () => {
    setAbierto(false);
    // El foco vuelve al lanzador: si se queda en un nodo que se desmontó, el
    // teclado pierde el hilo y se navega desde el principio de la página.
    lanzador.current?.focus();
  };

  useEffect(() => {
    if (!abierto) return;
    const alTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') minimizar();
    };
    window.addEventListener('keydown', alTecla);
    return () => window.removeEventListener('keydown', alTecla);
  }, [abierto]);

  // Cerrada del todo, hasta recargar. Se conserva un asidero mínimo: dejar la
  // ayuda irrecuperable en la sesión sería peor que no tenerla.
  if (cerrado) {
    return (
      <div className="pointer-events-none fixed bottom-4 right-4 z-40">
        <button
          type="button"
          onClick={() => {
            setCerrado(false);
            setAbierto(true);
          }}
          aria-label="Abrir la ayuda"
          title="Ayuda"
          className="pointer-events-auto inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-lg transition-colors hover:text-foreground"
        >
          <Sparkles className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>
      </div>
    );
  }

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
            <div className="-mr-1 -mt-1 flex shrink-0 items-center">
              <BotonIcono
                onClick={minimizar}
                label="Minimizar (no se pierde la respuesta)"
                title="Minimizar — la respuesta se guarda"
              >
                <ChevronDown className="h-4 w-4" strokeWidth={1.75} />
              </BotonIcono>
              <BotonIcono
                onClick={() => {
                  setAbierto(false);
                  setCerrado(true);
                  setEstado(ESTADO_INICIAL);
                }}
                label="Cerrar la ayuda"
                title="Cerrar del todo"
              >
                <X className="h-4 w-4" strokeWidth={1.75} />
              </BotonIcono>
            </div>
          </div>

          <div className="mt-3">
            <GuiaAsistenteForm ask={ask} autoFocus estado={estado} onEstado={setEstado} />
          </div>
        </section>
      ) : null}

      <button
        ref={lanzador}
        type="button"
        onClick={() => (abierto ? minimizar() : setAbierto(true))}
        aria-expanded={abierto}
        aria-controls="asistente-flotante"
        title={abierto ? 'Minimizar — la respuesta se guarda' : 'Ayuda'}
        className={cn(
          'pointer-events-auto inline-flex h-14 w-14 items-center justify-center gap-2 rounded-full',
          // En celular va SOLO el ícono: con la etiqueta tapaba una franja del
          // ancho de la pantalla mientras se desplaza. Desde `sm` hay sitio de
          // sobra y el texto ayuda a encontrarla.
          'sm:w-auto sm:justify-start sm:pl-4 sm:pr-5',
          'bg-primary text-sm font-semibold text-white shadow-xl transition-colors',
          'hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        <Sparkles className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
        <span className="hidden sm:inline">{abierto ? 'Minimizar' : 'Ayuda'}</span>
        <span className="sr-only sm:hidden">{abierto ? 'Minimizar la ayuda' : 'Abrir la ayuda'}</span>
        {/* Un punto avisa que hay una respuesta guardada esperando: minimizar
            no la borra, y sin la señal parece que sí. */}
        {!abierto && estado.answer ? (
          <span className="h-2 w-2 rounded-full bg-white/80" aria-hidden />
        ) : null}
        {!abierto && estado.answer ? <span className="sr-only">(tienes una respuesta guardada)</span> : null}
      </button>
    </div>
  );
}

function BotonIcono({
  onClick,
  label,
  title,
  children,
}: {
  onClick: () => void;
  label: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={title}
      className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-ink-400 transition-colors hover:bg-muted/40 hover:text-foreground"
    >
      {children}
    </button>
  );
}
