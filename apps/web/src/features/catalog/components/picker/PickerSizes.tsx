'use client';

import type { ProductSize } from '@pos-tercos/types';
import { cn } from '@pos-tercos/ui';
import { COP } from '../../../../lib/format';

/** Selector de tamaño (radio, requerido si el producto tiene tamaños). */
export function PickerSizes({
  sizes,
  sizeId,
  onSelect,
  agotadas,
}: {
  sizes: ProductSize[];
  sizeId: string | null;
  onSelect: (id: string) => void;
  /** Ids de las opciones que hoy no se pueden preparar. */
  agotadas?: ReadonlySet<string>;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-semibold text-foreground">Tamaño</p>
      <div className="flex flex-col gap-2">
        {sizes.map((s) => {
          const checked = sizeId === s.id;
          // Al cliente se le dice "Agotado" y nada más: el motivo interno
          // ("Sin Pechuga de pollo cruda") es información del negocio.
          const agotada = agotadas?.has(s.id) ?? false;
          return (
            <label
              key={s.id}
              className={cn(
                'flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm transition-colors',
                agotada
                  ? 'cursor-not-allowed border-border bg-muted/40 opacity-60'
                  : checked
                    ? 'cursor-pointer border-primary bg-primary/10 text-foreground'
                    : 'cursor-pointer border-border hover:border-muted-foreground',
              )}
            >
              <span className="flex items-center gap-3">
                <input
                  type="radio"
                  name="picker-size"
                  value={s.id}
                  checked={checked}
                  disabled={agotada}
                  onChange={() => onSelect(s.id)}
                  className="h-4 w-4 accent-primary"
                />
                <span className="font-medium">
                  {s.name}
                  {agotada ? (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">Agotado</span>
                  ) : null}
                </span>
              </span>
              <span className="tabular-nums text-muted-foreground">
                {s.priceModifier === 0
                  ? '—'
                  : `${s.priceModifier > 0 ? '+' : ''}${COP.format(s.priceModifier)}`}
              </span>
            </label>
          );
        })}
      </div>
      <div className="h-px w-full bg-border" />
    </div>
  );
}
