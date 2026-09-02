'use client';

import { cn, formatCop } from '@pos-tercos/ui';

/** Fila seleccionable (radio/checkbox) con delta de precio — picker de producto. */
export function SelectableRow({
  selected,
  onSelect,
  type,
  name,
  label,
  delta,
  disabled = false,
  disabledReason,
}: {
  selected: boolean;
  onSelect: () => void;
  type: 'radio' | 'checkbox';
  name?: string;
  label: string;
  delta: number;
  /** Sin insumos para esa opción: se muestra, no se puede elegir. */
  disabled?: boolean;
  /** Qué falta, para que el cajero sepa qué reponer y no adivine. */
  disabledReason?: string | null;
}) {
  return (
    <label
      className={cn(
        'flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors duration-150 ease-out',
        'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background',
        disabled
          ? 'cursor-not-allowed border-border bg-muted/30 opacity-60'
          : selected
            ? 'cursor-pointer border-primary bg-destructive/10 font-semibold text-foreground'
            : 'cursor-pointer border-border hover:border-ink-300 hover:bg-muted/40',
        'motion-reduce:transition-none',
      )}
    >
      <span className="flex items-center gap-2">
        <input
          type={type}
          name={name}
          checked={selected}
          onChange={onSelect}
          disabled={disabled}
          className="h-4 w-4 accent-primary"
        />
        <span>
          {label}
          {disabled ? (
            <span className="ml-2 text-xs font-normal text-warning">
              {disabledReason ?? 'Sin insumos'}
            </span>
          ) : null}
        </span>
      </span>
      <span className={cn('tabular', disabled ? 'text-muted-foreground' : 'text-foreground')}>
        {delta === 0 ? '—' : `${delta > 0 ? '+' : ''}${formatCop(delta)}`}
      </span>
    </label>
  );
}
