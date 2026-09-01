'use client';

import type { ChecklistDay } from '@pos-tercos/types';
import { BUSINESS_TIME_ZONE, Dialog } from '@pos-tercos/ui';

const ROUTINE_LABEL = { OPEN: 'Apertura', CLOSE: 'Cierre' } as const;

function hora(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('es-CO', {
    timeZone: BUSINESS_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * La rutina de un día, tarea por tarea: qué se marcó, quién y a qué hora.
 * En el histórico la lista iba desplegada en cada día y treinta días de
 * rutina eran un muro; acá se abre solo el día que se está investigando.
 */
export function ChecklistDetailModal({
  day,
  onClose,
}: {
  day: ChecklistDay | null;
  onClose: () => void;
}) {
  if (!day) return null;
  const faltaron = day.totalCount - day.doneCount;

  return (
    <Dialog
      open
      onClose={onClose}
      title={`${ROUTINE_LABEL[day.type]} · ${day.day}`}
      description={
        day.completedAt
          ? `Cerrada a las ${hora(day.completedAt)}${day.completedByName ? ` por ${day.completedByName}` : ''}`
          : faltaron === day.totalCount
            ? 'No se marcó ninguna tarea'
            : `Quedaron ${faltaron} de ${day.totalCount} sin marcar`
      }
      maxWidth="max-w-lg"
    >
      <div className="space-y-3">
        {day.legacy ? (
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Registro anterior a las marcas por tarea: se sabe qué se cumplió, pero no quién marcó
            cada una.
          </p>
        ) : null}

        <ul className="divide-y divide-border rounded-lg border border-border">
          {day.items.map((item) => (
            <li key={item.itemId} className="flex items-baseline gap-3 px-3 py-2 text-sm">
              <span
                aria-hidden
                className={item.done ? 'text-success' : 'text-destructive'}
              >
                {item.done ? '✓' : '✗'}
              </span>
              <span className="sr-only">{item.done ? 'Cumplida:' : 'Sin marcar:'}</span>
              <span className="min-w-0 flex-1 text-foreground">{item.label}</span>
              {item.doneByName ? (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {item.doneByName}
                  {item.doneAt ? ` · ${hora(item.doneAt)}` : ''}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </Dialog>
  );
}
