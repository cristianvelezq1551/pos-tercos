'use client';

import type { ChecklistDayItem } from '@pos-tercos/types';
import { Check } from 'lucide-react';

/**
 * Una tarea de la rutina. Muestra quién la marcó: con dos cocineros en el
 * turno, "hecha" sin autor no le sirve a nadie.
 *
 * La FILA ENTERA es el botón. Con el `Checkbox` de la librería el área de toque
 * era la etiqueta: 17 px de alto en celular, para la acción que más se repite
 * en la app (diez o quince ítems, dos veces al día). Se falla el toque, se
 * vuelve a intentar, y marcar la rutina se vuelve una pelea.
 */
export function ChecklistTaskRow({
  item,
  busy,
  onToggle,
}: {
  item: ChecklistDayItem;
  busy: boolean;
  onToggle: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        disabled={busy}
        aria-pressed={item.done}
        className="flex w-full min-h-14 items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-colors active:bg-muted/60 disabled:opacity-50"
      >
        <span
          aria-hidden
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
            item.done ? 'border-success bg-success text-white' : 'border-border'
          }`}
        >
          {item.done ? <Check className="h-5 w-5" strokeWidth={3} /> : null}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={`block text-sm font-medium ${
              item.done ? 'text-muted-foreground line-through' : 'text-foreground'
            }`}
          >
            {item.label}
          </span>
          {item.done && item.doneByName ? (
            <span className="mt-0.5 block text-[0.6875rem] text-muted-foreground">
              {item.doneByName}
              {item.doneAt
                ? ` · ${new Date(item.doneAt).toLocaleTimeString('es-CO', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}`
                : ''}
            </span>
          ) : null}
        </span>
      </button>
    </li>
  );
}
