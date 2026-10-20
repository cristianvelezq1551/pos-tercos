'use client';

import type { Product } from '@pos-tercos/types';
import { Button, Input } from '@pos-tercos/ui';
import { formatCop } from '../../../lib/format';
import { tieneVariantes } from '../lib/combo-variantes';
import type { ComboRow } from './ProductFormTypes';

// En el celular: 44 px de alto (piso táctil) y letra de 16 px (con menos, iOS
// amplía la pantalla al tocar el campo y no la devuelve).
const SELECT_CLASS =
  'min-h-[44px] rounded-md border border-input bg-card px-2 text-base text-foreground focus:border-primary focus:outline-none sm:min-h-0 sm:h-9 sm:text-sm';

/**
 * Una fila de componente del combo: el plato, su VARIANTE si la tiene, y la
 * cantidad. La variante es obligatoria y no viene elegida: la proteína vive en
 * la receta de la variante, y sin ella el combo descontaría solo la base
 * (PLAN-COMBO-CON-VARIANTE.md).
 */
export function ComboComponentFields({
  row,
  product,
  candidates,
  pending,
  onChange,
  onRemove,
}: {
  row: ComboRow;
  /** El plato elegido en la fila (undefined mientras no se elige). */
  product: Product | undefined;
  candidates: Product[];
  pending: boolean;
  onChange: (patch: Partial<Pick<ComboRow, 'productId' | 'sizeId' | 'quantity'>>) => void;
  onRemove: () => void;
}) {
  const conVariantes = product !== undefined && tieneVariantes(product);
  return (
    <li className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Producto"
          value={row.productId}
          // La variante es de UN plato: al cambiar de plato, se borra.
          onChange={(e) => onChange({ productId: e.target.value, sizeId: '' })}
          disabled={pending}
          // En el celular el plato ocupa su propio renglón: compartiéndolo con
          // la variante, los dos quedaban cortados ("Papas" / "Pollo y") y no
          // se alcanzaba a leer qué variante quedó elegida.
          className={`${SELECT_CLASS} min-w-0 basis-full sm:basis-0 sm:flex-1`}
        >
          <option value="">— Elegir producto —</option>
          {candidates.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({tieneVariantes(p) ? 'con variantes' : formatCop(p.basePrice)})
            </option>
          ))}
        </select>
        {conVariantes ? (
          <select
            aria-label={`Variante de ${product.name}`}
            required
            value={row.sizeId}
            onChange={(e) => onChange({ sizeId: e.target.value })}
            disabled={pending}
            // También en su propio renglón en el celular: compartiéndolo con la
            // cantidad, "Pollo y Miel ahumada" no cabía entera.
            className={`${SELECT_CLASS} min-w-0 basis-full sm:basis-0 sm:flex-1`}
          >
            <option value="">— Elegir variante —</option>
            {product.sizes?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({formatCop(product.basePrice + s.priceModifier)})
              </option>
            ))}
          </select>
        ) : null}
        <Input
          type="number"
          inputMode="numeric"
          min="1"
          value={row.quantity}
          onChange={(e) => onChange({ quantity: e.target.value })}
          disabled={pending}
          className="w-20 shrink-0 tabular-nums"
          aria-label="Cantidad"
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          disabled={pending}
          aria-label="Quitar componente"
          className="shrink-0 text-destructive"
        >
          ✕
        </Button>
      </div>
      {conVariantes && !row.sizeId ? (
        <p className="text-xs text-warning">
          {product.name} tiene variantes: elige cuál lleva el combo. Sin eso el combo no se vende.
        </p>
      ) : null}
    </li>
  );
}
