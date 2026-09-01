'use client';

import type { ChecklistDay } from '@pos-tercos/types';
import { Badge, EmptyState } from '@pos-tercos/ui';
import { useState } from 'react';
import { ChecklistDetailModal } from './detail/ChecklistDetailModal';

const ROUTINE_LABEL = { OPEN: 'Apertura', CLOSE: 'Cierre' } as const;

function EstadoDeRutina({ day }: { day: ChecklistDay }) {
  if (day.completedAt) {
    return <Badge tone="success">Cerrada{day.completedByName ? ` · ${day.completedByName}` : ''}</Badge>;
  }
  if (day.doneCount === 0) return <Badge tone="danger">No se hizo</Badge>;
  return (
    <Badge tone="warning">
      {day.doneCount}/{day.totalCount}
    </Badge>
  );
}

/**
 * Histórico del checklist: una línea por rutina con cómo terminó, y el detalle
 * tarea por tarea a un toque. Antes cada día venía con su lista desplegada:
 * un mes de rutinas era un muro de texto donde no se distinguía el día que
 * había que revisar.
 */
export function ChecklistHistoryPanel({ days }: { days: ChecklistDay[] }) {
  const [abierto, setAbierto] = useState<ChecklistDay | null>(null);
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
    <>
      <ul className="space-y-2">
        {withTasks.map((d) => (
          <li key={`${d.day}:${d.type}`} className="rounded-lg border border-border bg-card">
            <button
              type="button"
              onClick={() => setAbierto(d)}
              aria-label={`Ver las tareas de ${ROUTINE_LABEL[d.type]} del ${d.day}`}
              className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg p-3 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-sm font-medium text-foreground">
                  {d.day} · {ROUTINE_LABEL[d.type]}
                </span>
                <span className="text-xs text-muted-foreground">
                  {d.doneCount} de {d.totalCount} tareas
                </span>
                {d.legacy ? (
                  <span className="text-[0.6875rem] text-muted-foreground">
                    · registro viejo, sin autor por tarea
                  </span>
                ) : null}
              </span>
              <EstadoDeRutina day={d} />
            </button>
          </li>
        ))}
      </ul>

      <ChecklistDetailModal day={abierto} onClose={() => setAbierto(null)} />
    </>
  );
}
