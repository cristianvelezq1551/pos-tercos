import type { Sale } from '@pos-tercos/types';
import { SALES_LENSES, matchesLens, type SalesLens } from '../lib/sales-lens';

/** Filtros de vista con su contador — sin contador, "Con descuento" no dice si hay alguna. */
export function SalesLensTabs({
  sales,
  lens,
  onChange,
}: {
  sales: Sale[];
  lens: SalesLens;
  onChange: (l: SalesLens) => void;
}) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {SALES_LENSES.map((opt) => {
        const n = sales.filter((s) => matchesLens(s, opt.value)).length;
        const activo = opt.value === lens;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={activo}
            disabled={n === 0 && !activo}
            className={
              'rounded-full border px-2.5 py-1 text-xs transition-colors disabled:opacity-40 ' +
              (activo
                ? 'border-primary bg-primary/15 font-medium text-foreground'
                : 'border-border text-muted-foreground hover:text-foreground')
            }
          >
            {opt.label} <span className="tabular-nums">({n})</span>
          </button>
        );
      })}
    </span>
  );
}
