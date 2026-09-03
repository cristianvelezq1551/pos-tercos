import { formatCop } from '../../../lib/format';
import type { CloseLeg } from '../lib/shift-close-totals';

/**
 * Una pata del cierre en una celda: arriba lo CONTADO (el número que importa),
 * abajo lo esperado y la diferencia. Nueve columnas de dinero no caben en la
 * fila; tres celdas de dos renglones sí.
 */
export function LegCell({ leg, strong }: { leg: CloseLeg; strong?: boolean }) {
  return (
    <div className="text-right">
      <p
        className={`tabular-nums ${strong ? 'text-base font-bold' : 'font-semibold'} ${
          leg.counted === null ? 'text-muted-foreground' : 'text-foreground'
        }`}
      >
        {leg.counted !== null ? formatCop(leg.counted) : '—'}
      </p>
      <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
        {leg.expected !== null ? <>esperado {formatCop(leg.expected)}</> : 'sin cerrar'}
        {leg.expected !== null ? (
          <>
            {' · '}
            <DiffText value={leg.difference} partial={leg.partial} />
          </>
        ) : null}
      </p>
    </div>
  );
}

function DiffText({ value, partial }: { value: number | null; partial: boolean }) {
  if (value === null) {
    return <span className="text-warning">{partial ? 'sin arquear' : '—'}</span>;
  }
  if (Math.abs(value) < 1) return <span className="text-success">cuadra</span>;
  const tone = value < 0 ? 'text-destructive' : 'text-warning';
  return (
    <span className={`font-semibold ${tone}`}>
      {value > 0 ? '+' : ''}
      {formatCop(value)}
      {partial ? ' (parcial)' : ''}
    </span>
  );
}
