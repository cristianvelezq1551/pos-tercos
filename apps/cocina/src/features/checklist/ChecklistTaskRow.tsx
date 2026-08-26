'use client';

import type { ChecklistDayItem } from '@pos-tercos/types';
import { Checkbox } from '@pos-tercos/ui';

/** Una tarea de la rutina. Muestra quién la marcó: con dos cocineros en el
 *  turno, "hecha" sin autor no le sirve a nadie. */
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
    <li className="rounded-lg border border-border bg-card px-3 py-2.5">
      <Checkbox checked={item.done} onChange={onToggle} disabled={busy} label={item.label} />
      {item.done && item.doneByName ? (
        <p className="mt-1 pl-7 text-[0.6875rem] text-muted-foreground">
          {item.doneByName}
          {item.doneAt
            ? ` · ${new Date(item.doneAt).toLocaleTimeString('es-CO', {
                hour: '2-digit',
                minute: '2-digit',
              })}`
            : ''}
        </p>
      ) : null}
    </li>
  );
}
