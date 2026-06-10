'use client';

import { cn } from '@pos-tercos/ui';
import type { ProductKind } from './ProductFormTypes';

const TYPES: { kind: ProductKind; label: string; desc: string; icon: string }[] = [
  { kind: 'simple', label: 'Preparado simple', desc: '1 precio. Burgers, burros, tenders.', icon: '🍔' },
  { kind: 'variants', label: 'Con variantes', desc: 'Elección que cambia el precio (proteína).', icon: '🍟' },
  { kind: 'drink', label: 'Bebida / reventa', desc: 'Se compra y revende. Gaseosas, agua.', icon: '🥤' },
  { kind: 'combo', label: 'Combo', desc: 'Varios productos juntos a precio especial.', icon: '🎁' },
];

export function ProductTypeSelector({
  value,
  onChange,
  disabled,
}: {
  value: ProductKind;
  onChange: (k: ProductKind) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="space-y-3 rounded-md border border-border p-4">
      <legend className="px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Tipo de producto
      </legend>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {TYPES.map((t) => (
          <button
            key={t.kind}
            type="button"
            disabled={disabled}
            onClick={() => onChange(t.kind)}
            className={cn(
              'flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors',
              value === t.kind
                ? 'border-primary bg-primary/10'
                : 'border-border hover:bg-muted/40',
              disabled && 'cursor-not-allowed opacity-60',
            )}
          >
            <span className="text-2xl leading-none">{t.icon}</span>
            <span className="text-sm font-semibold text-foreground">{t.label}</span>
            <span className="text-xs text-muted-foreground">{t.desc}</span>
          </button>
        ))}
      </div>
      {disabled ? (
        <p className="px-2 text-xs text-muted-foreground">
          El tipo no se cambia al editar. Para cambiarlo, crea un producto nuevo.
        </p>
      ) : null}
    </fieldset>
  );
}
