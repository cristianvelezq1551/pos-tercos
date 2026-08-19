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
}: {
  selected: boolean;
  onSelect: () => void;
  type: 'radio' | 'checkbox';
  name?: string;
  label: string;
  delta: number;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors duration-150 ease-out',
        'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background',
        selected
          ? 'border-primary bg-destructive/10 font-semibold text-foreground'
          : 'border-border hover:border-ink-300 hover:bg-muted/40',
        'motion-reduce:transition-none',
      )}
    >
      <span className="flex items-center gap-2">
        <input
          type={type}
          name={name}
          checked={selected}
          onChange={onSelect}
          className="h-4 w-4 accent-primary"
        />
        {label}
      </span>
      <span className="tabular text-foreground">
        {delta === 0 ? '—' : `${delta > 0 ? '+' : ''}${formatCop(delta)}`}
      </span>
    </label>
  );
}
