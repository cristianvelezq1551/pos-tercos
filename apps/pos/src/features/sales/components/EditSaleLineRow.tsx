'use client';

import { Money, cn } from '@pos-tercos/ui';
import { Lock, Minus, Plus, X } from 'lucide-react';

/** Línea editable del pedido (modelo local del EditSaleModal). */
export interface EditLine {
  productId: string;
  productName: string;
  sizeId: string | null;
  sizeName: string | null;
  quantity: number;
  modifierIds: string[];
  modifierNames: string[];
  notes: string | null;
  unitPrice: number;
  /** Cocina ya la tiene en curso (preparación) — no se puede tocar. */
  locked: boolean;
}

export function EditSaleLineRow({
  line,
  busy,
  onQty,
  onRemove,
}: {
  line: EditLine;
  busy: boolean;
  onQty: (delta: number) => void;
  onRemove: () => void;
}) {
  return (
    <li
      className={cn(
        'flex items-center gap-2 rounded-md px-2.5 py-2 text-sm',
        line.locked ? 'bg-muted/20 opacity-80' : 'bg-muted/40',
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 font-medium text-foreground">
          {line.locked ? (
            <Lock className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
          ) : null}
          <span className="truncate">
            {line.productName}
            {line.sizeName ? ` · ${line.sizeName}` : ''}
          </span>
        </p>
        {line.modifierNames.length > 0 ? (
          <p className="truncate text-[0.6875rem] text-muted-foreground">
            + {line.modifierNames.join(', ')}
          </p>
        ) : null}
        {line.notes ? (
          <p className="truncate text-[0.6875rem] italic text-muted-foreground">
            “{line.notes}”
          </p>
        ) : null}
      </div>

      {line.locked ? (
        <span className="shrink-0 text-sm font-semibold tabular-nums text-muted-foreground">
          ×{line.quantity}
        </span>
      ) : (
        <span className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            disabled={busy || line.quantity <= 1}
            onClick={() => onQty(-1)}
            aria-label={`Quitar uno de ${line.productName}`}
            className="rounded-md border border-border p-1 text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
          >
            <Minus className="h-3.5 w-3.5" aria-hidden />
          </button>
          <span className="w-6 text-center text-sm font-semibold tabular-nums">
            {line.quantity}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => onQty(1)}
            aria-label={`Agregar uno de ${line.productName}`}
            className="rounded-md border border-border p-1 text-muted-foreground transition-colors hover:bg-muted"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
          </button>
        </span>
      )}

      <Money
        amount={line.unitPrice * line.quantity}
        size="sm"
        weight="medium"
        className="w-20 shrink-0 text-right"
      />

      {!line.locked ? (
        <button
          type="button"
          disabled={busy}
          onClick={onRemove}
          aria-label={`Eliminar ${line.productName} del pedido`}
          className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      ) : (
        <span className="w-[1.375rem] shrink-0" aria-hidden />
      )}
    </li>
  );
}
