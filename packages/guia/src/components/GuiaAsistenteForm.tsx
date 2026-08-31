'use client';

import { Button, Textarea } from '@pos-tercos/ui';
import { useState } from 'react';

const EJEMPLOS = [
  '¿Cómo registro una merma si mi repollo salió defectuoso?',
  'Se me quemó una tanda de pollo, ¿qué hago?',
  'La caja dice agotado pero yo tengo producto',
  '¿Dónde veo cuánto perdí en mermas este mes?',
];

/**
 * La pregunta y la respuesta. Vive aparte del marco porque se muestra en dos
 * lugares —el panel de la guía y la burbuja flotante— y tienen que comportarse
 * EXACTAMENTE igual: dos copias de esto se separan al primer retoque.
 *
 * Responde SOLO con lo que dice la guía: no ve datos del negocio. Si el
 * proveedor de IA no está configurado o falla, el error lo dice y remite a la
 * guía escrita — nunca inventa una respuesta ni finge que funcionó.
 */
export function GuiaAsistenteForm({
  ask,
  autoFocus = false,
}: {
  ask: (q: string) => Promise<string>;
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (pregunta: string) => {
    const texto = pregunta.trim();
    if (texto.length < 5 || pending) return;
    setPending(true);
    setError(null);
    setAnswer(null);
    try {
      setAnswer(await ask(texto));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo responder.');
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Textarea
        value={q}
        onChange={(e) => setQ(e.target.value)}
        rows={2}
        maxLength={300}
        autoFocus={autoFocus}
        placeholder="Ej: se me dañó el repollo, ¿cómo lo registro?"
        aria-label="Tu pregunta"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit(q);
        }}
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          className="min-h-11"
          disabled={q.trim().length < 5 || pending}
          onClick={() => void submit(q)}
        >
          {pending ? 'Pensando…' : 'Preguntar'}
        </Button>
        {!answer && !pending ? (
          <span className="text-xs text-muted-foreground">o toca un ejemplo de abajo</span>
        ) : null}
      </div>

      {!answer && !error && !pending ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {EJEMPLOS.map((e) => (
            <li key={e}>
              <button
                type="button"
                onClick={() => {
                  setQ(e);
                  void submit(e);
                }}
                className="min-h-11 rounded-full border border-border bg-card px-3 text-left text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground active:bg-muted"
              >
                {e}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-warning-border bg-warning-bg px-3 py-2 text-sm text-warning"
        >
          {error}
        </p>
      ) : null}

      {answer ? (
        <div className="mt-3 rounded-lg border border-border bg-card p-4">
          <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{answer}</p>
          <p className="mt-3 border-t border-border pt-2 text-[0.6875rem] text-muted-foreground">
            Respuesta armada desde esta guía. Si no coincide con lo que ves en pantalla, gana la
            pantalla: avísale al dueño para corregir el texto.
          </p>
        </div>
      ) : null}
    </>
  );
}
