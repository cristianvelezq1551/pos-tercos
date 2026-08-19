'use client';

import { PAYMENT_METHOD_LABELS, type CashMovement } from '@pos-tercos/types';
import { Money, cn } from '@pos-tercos/ui';
import { Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';

/**
 * Fila de un movimiento con corrección: editar carga el form de la sección;
 * eliminar pide confirmación en dos toques (sin modal).
 */
export function CashMovementRow({
  movement: m,
  editing,
  busy,
  onEdit,
  onDelete,
}: {
  movement: CashMovement;
  editing: boolean;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <li
      className={cn(
        'flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-xs',
        editing ? 'bg-destructive/10 ring-1 ring-primary/40' : 'bg-muted/40',
      )}
    >
      <span className="min-w-0 flex-1 truncate">
        <span
          className={cn('font-semibold', m.type === 'IN' ? 'text-success' : 'text-destructive')}
        >
          {m.type === 'IN' ? 'Entrada' : 'Salida'}
        </span>
        {m.method !== 'CASH' ? (
          <span className="text-muted-foreground"> · {PAYMENT_METHOD_LABELS[m.method]}</span>
        ) : null}
        <span className="text-muted-foreground"> · {m.reason}</span>
      </span>
      <Money
        amount={m.type === 'IN' ? m.amount : -m.amount}
        size="xs"
        weight="semibold"
        withSign
        className="shrink-0"
      />
      {confirming ? (
        <span className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            disabled={busy}
            onClick={() => void onDelete().finally(() => setConfirming(false))}
            className="rounded-md bg-destructive/15 px-2 py-1 font-semibold text-destructive transition-colors hover:bg-destructive/25"
          >
            ¿Eliminar?
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded-md px-1.5 py-1 text-muted-foreground hover:bg-muted"
          >
            No
          </button>
        </span>
      ) : (
        <span className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            disabled={busy}
            onClick={onEdit}
            aria-label={`Editar movimiento: ${m.reason}`}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirming(true)}
            aria-label={`Eliminar movimiento: ${m.reason}`}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </button>
        </span>
      )}
    </li>
  );
}
