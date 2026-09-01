'use client';

import { IconButton, Money, cn } from '@pos-tercos/ui';
import { Minus, Pencil, Plus, X } from 'lucide-react';
import { useState } from 'react';
import type { CartLine } from '../lib/cart-types';
import { LineEditorModal } from './LineEditorModal';

/**
 * Una línea del carrito, apretada a propósito.
 *
 * Antes ocupaba cinco renglones y en la pantalla del mostrador no entraban más
 * de tres productos. Ahora el nombre y el total comparten renglón, las
 * opciones y el precio unitario van juntos en letra chica, y lo demás vive en
 * el editor de la línea.
 *
 * Los tres íconos sin nombre (duplicar, nota, quitar) se fueron: un papelito
 * no le dice a nadie que ahí se escribe "sin cebolla". Queda un botón
 * **Editar** escrito, y la nota —cuando existe— se LEE en la fila en vez de
 * esconderse dentro de un campo.
 */
export function CartLineRow({
  line,
  lineSubtotal,
  lineDiscount,
  lineTotal,
  hasPromo,
  onQty,
  onSeparar,
  onRemove,
  onNotes,
}: {
  line: CartLine;
  lineSubtotal: number;
  lineDiscount: number;
  lineTotal: number;
  hasPromo: boolean;
  onQty: (qty: number) => void;
  onSeparar: () => void;
  onRemove: () => void;
  onNotes: (notes: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const nota = line.notes?.trim();

  const detalle = [
    ...[line.size?.name, ...line.modifiers.map((m) => m.name)].filter(Boolean),
    `$${Math.round(line.unitPrice).toLocaleString('es-CO')} c/u`,
  ].join(' · ');

  return (
    <li className="px-3 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
          {line.productName}
        </p>
        <span className="shrink-0 text-right">
          {hasPromo ? (
            <>
              <span className="mr-1 text-[11px] text-ink-400 line-through tabular">
                <Money amount={lineSubtotal} size="xs" weight="normal" className="text-current" />
              </span>
              <Money amount={lineTotal} weight="bold" className={cn('text-success')} />
            </>
          ) : (
            <Money amount={lineSubtotal} weight="semibold" />
          )}
        </span>
      </div>

      <div className="mt-0.5 flex items-center justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{detalle}</p>
        {hasPromo ? (
          <span className="shrink-0 text-[10px] font-medium text-success">
            −<Money amount={lineDiscount} size="xs" weight="normal" className="text-current" />{' '}
            promo
          </span>
        ) : null}
      </div>

      {/* La nota se LEE en la fila: escondida dentro de un campo, el cajero no
          podía repasar de un vistazo qué le pidió el cliente. */}
      {nota ? (
        <p className="mt-1 truncate text-[11px] font-medium text-primary" title={nota}>
          Nota: {nota}
        </p>
      ) : null}

      <div className="mt-1.5 flex items-center gap-1">
        <div className="inline-flex items-center rounded-lg border border-border">
          <button
            type="button"
            onClick={() => onQty(line.quantity - 1)}
            disabled={line.quantity <= 1}
            className="inline-flex h-8 w-8 items-center justify-center text-ink-600 transition-colors hover:bg-muted/40 disabled:opacity-30"
            aria-label="Restar uno"
          >
            <Minus className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
          <span className="w-7 text-center text-sm font-semibold tabular text-foreground">
            {line.quantity}
          </span>
          <button
            type="button"
            onClick={() => onQty(line.quantity + 1)}
            className="inline-flex h-8 w-8 items-center justify-center text-ink-600 transition-colors hover:bg-muted/40"
            aria-label="Sumar uno"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        </div>

        <span className="flex-1" />

        <button
          type="button"
          onClick={() => setEditando(true)}
          aria-label={`Editar ${line.productName}: nota, cantidad o quitar`}
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
        >
          <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
          {nota ? 'Nota' : 'Editar'}
        </button>
        <IconButton
          aria-label={`Quitar ${line.productName} del pedido`}
          variant="ghost"
          size="sm"
          onClick={onRemove}
          className="text-ink-400 hover:text-destructive"
        >
          <X className="h-4 w-4" strokeWidth={1.75} />
        </IconButton>
      </div>

      {editando ? (
        <LineEditorModal
          line={line}
          open
          onClose={() => setEditando(false)}
          onQty={onQty}
          onNotes={onNotes}
          onSeparar={onSeparar}
          onRemove={onRemove}
        />
      ) : null}
    </li>
  );
}
