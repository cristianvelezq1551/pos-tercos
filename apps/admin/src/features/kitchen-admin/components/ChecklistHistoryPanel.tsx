import type { ChecklistDay } from '@pos-tercos/types';
import { Badge, BUSINESS_TIME_ZONE, EmptyState } from '@pos-tercos/ui';

const ROUTINE_LABEL = { OPEN: 'Apertura', CLOSE: 'Cierre' } as const;

/** Histórico del checklist: por día y rutina, qué se cumplió y qué faltó. */
export function ChecklistHistoryPanel({ days }: { days: ChecklistDay[] }) {
  const withTasks = days.filter((d) => d.totalCount > 0);
  if (withTasks.length === 0) {
    return (
      <EmptyState
        title="Sin rutinas en el rango"
        description="No había tareas configuradas en esos días."
        size="sm"
      />
    );
  }

  return (
    <ul className="space-y-2">
      {withTasks.map((d) => (
        <li key={`${d.day}:${d.type}`} className="rounded-lg border border-border bg-card p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground">
              {d.day} · {ROUTINE_LABEL[d.type]}
            </span>
            <span className="flex items-center gap-2">
              {d.legacy ? (
                <span className="text-[0.6875rem] text-muted-foreground">
                  registro viejo, sin autor por tarea
                </span>
              ) : null}
              {d.completedAt ? (
                <Badge tone="success">
                  Cerrada{d.completedByName ? ` · ${d.completedByName}` : ''}
                </Badge>
              ) : d.doneCount === 0 ? (
                <Badge tone="danger">No se hizo</Badge>
              ) : (
                <Badge tone="warning">
                  {d.doneCount}/{d.totalCount}
                </Badge>
              )}
            </span>
          </div>

          <ul className="mt-2 space-y-1">
            {d.items.map((item) => (
              <li key={item.itemId} className="flex flex-wrap items-baseline gap-2 text-xs">
                <span className={item.done ? 'text-success' : 'text-destructive'}>
                  {item.done ? '✓' : '✗'}
                </span>
                <span className={item.done ? 'text-ink-600' : 'text-foreground'}>{item.label}</span>
                {item.doneByName ? (
                  <span className="text-muted-foreground">
                    {item.doneByName}
                    {item.doneAt
                      ? ` · ${new Date(item.doneAt).toLocaleTimeString('es-CO', {
                          timeZone: BUSINESS_TIME_ZONE,
                          hour: '2-digit',
                          minute: '2-digit',
                        })}`
                      : ''}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
