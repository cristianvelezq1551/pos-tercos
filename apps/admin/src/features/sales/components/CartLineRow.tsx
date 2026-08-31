'use client';

import { IconButton, Money, cn } from '@pos-tercos/ui';
import { CopyPlus, Minus, Plus, StickyNote, X } from 'lucide-react';
import { useState } from 'react';
import type { CartLine } from '../lib/cart-types';

/**
 * Una línea del carrito, apretada a propósito.
 *
 * Antes ocupaba cinco renglones (nombre, precio unitario, cantidad, total y un
 * campo de nota SIEMPRE visible de 44 px), así que en la pantalla del mostrador
 * no entraban más de tres productos y había que desplazarse para cobrar. Ahora
 * el nombre y el total comparten renglón, las opciones y el precio unitario van
 * juntos en letra chica, y la nota aparece solo cuando existe o cuando se pide.
 */
export function CartLineRow({
  line,
  lineSubtotal,
  lineDiscount,
  lineTotal,
  hasPromo,
  onQty,
  onDuplicate,
  onRemove,
  onNotes,
}: {
  line: CartLine;
  lineSubtotal: number;
  lineDiscount: number;
  lineTotal: number;
  hasPromo: boolean;
  onQty: (qty: number) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onNotes: (notes: string) => void;
}) {
  const tieneNota = Boolean(line.notes?.trim());
  const [notaAbierta, setNotaAbierta] = useState(tieneNota);

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

        {/* Otra unidad EN SU PROPIA línea: es la única forma de que cada una
            lleve su indicación ("una sin cebolla"). Sumar cantidad comparte
            una sola nota entre todas. */}
        <IconButton
          aria-label={`Agregar otro ${line.productName} en línea aparte, para su propia nota`}
          title="Agregar otro, en línea aparte (para ponerle su propia nota)"
          variant="ghost"
          size="sm"
          onClick={onDuplicate}
        >
          <CopyPlus className="h-4 w-4" strokeWidth={1.75} />
        </IconButton>
        <IconButton
          aria-label={notaAbierta ? 'Ocultar la nota' : 'Escribir una nota para cocina'}
          title="Nota para cocina"
          variant="ghost"
          size="sm"
          onClick={() => setNotaAbierta((v) => !v)}
          className={tieneNota ? 'text-primary' : undefined}
        >
          <StickyNote className="h-4 w-4" strokeWidth={1.75} />
        </IconButton>
        <IconButton
          aria-label="Quitar línea"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          className="text-ink-400 hover:text-destructive"
        >
          <X className="h-4 w-4" strokeWidth={1.75} />
        </IconButton>
      </div>

      {notaAbierta || tieneNota ? (
        <input
          type="text"
          value={line.notes ?? ''}
          onChange={(e) => onNotes(e.target.value)}
          placeholder="Nota para cocina (ej. sin cebolla)"
          aria-label={`Nota para cocina de ${line.productName}`}
          maxLength={200}
          autoFocus={notaAbierta && !tieneNota}
          className="mt-1.5 min-h-9 w-full rounded-md border border-border bg-card px-2 py-1.5 text-base text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none sm:text-xs pointer-coarse:min-h-11"
        />
      ) : null}
    </li>
  );
}
