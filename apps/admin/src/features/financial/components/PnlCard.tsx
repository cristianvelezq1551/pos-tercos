import type { MonthlyFinancialStatement } from '@pos-tercos/types';
import { formatCop } from '@pos-tercos/ui';

export function PnlCard({ s }: { s: MonthlyFinancialStatement }) {
  const netPositive = s.netResult >= 0;
  const grossPct = (s.grossMarginPct * 100).toFixed(1);

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <h2 className="font-display text-lg font-bold text-foreground">Resultado del mes</h2>

      {/* Bloque ingresos → margen bruto */}
      <div className="space-y-1.5 text-sm">
        <Row label="Ingresos del mes" value={formatCop(s.revenue)} />
        <Row label="− COGS (costo real FIFO)" value={`−${formatCop(s.cogs)}`} muted />
        <div className="my-2 border-t border-border" />
        <Row
          label="Margen bruto"
          value={`${formatCop(s.grossMargin)} (${grossPct}%)`}
          strong
        />
      </div>

      {/* Bloque costos fijos */}
      <div className="space-y-1.5 text-sm">
        <p className="caps text-[0.625rem] text-muted-foreground">Costos y gastos fijos</p>
        {s.fixedCosts.length === 0 ? (
          <p className="rounded-md border border-warning-border bg-warning-bg/30 px-3 py-2 text-xs text-warning">
            Aún no tienes costos fijos cargados. Crealos en Finanzas → Costos fijos para que este reporte
            sea preciso.
          </p>
        ) : (
          <ul className="space-y-1">
            {s.fixedCosts.map((c, idx) => (
              <li key={`${c.fixedCostId ?? 'payroll'}-${idx}`} className="flex justify-between gap-2 text-foreground">
                <span className="min-w-0 truncate">
                  {c.name}
                  <span className="ml-1 text-xs text-muted-foreground">· {c.category}</span>
                </span>
                <span className="tabular-nums text-muted-foreground">−{formatCop(c.monthlyAmount)}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="my-2 border-t border-border" />
        <Row label="Total costos fijos" value={`−${formatCop(s.totalFixed)}`} strong />
      </div>

      {/* Cortesías: producto regalado (autorizado), valuado a costo. */}
      {s.cortesiasCost > 0 ? (
        <div className="space-y-1.5 text-sm">
          <Row
            label="− Cortesías (producto regalado, a costo)"
            value={`−${formatCop(s.cortesiasCost)}`}
            muted
          />
        </div>
      ) : null}

      {/* Resultado neto: el banner grande verde/rojo */}
      <div
        className={`rounded-xl border p-4 ${
          netPositive ? 'border-success/30 bg-success/10' : 'border-destructive/30 bg-destructive/10'
        }`}
      >
        <p className="caps text-[0.625rem] text-muted-foreground">Resultado neto del mes</p>
        <p
          className={`mt-1 font-display text-3xl font-bold tabular-nums ${
            netPositive ? 'text-success' : 'text-destructive'
          }`}
        >
          {netPositive ? '' : ''}
          {formatCop(s.netResult)}
        </p>
        <p className={`mt-1 text-xs ${netPositive ? 'text-success/80' : 'text-destructive/80'}`}>
          {netPositive
            ? 'El negocio cubrió todos los costos (incluidas cortesías) y dejó ganancia.'
            : 'El mes cerró en pérdida: las ventas no alcanzaron a cubrir COGS + costos fijos + cortesías.'}
        </p>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex justify-between gap-2">
      <span className={muted ? 'text-muted-foreground' : 'text-foreground'}>{label}</span>
      <span
        className={`tabular-nums ${
          strong ? 'font-bold text-foreground' : muted ? 'text-muted-foreground' : 'text-foreground'
        }`}
      >
        {value}
      </span>
    </div>
  );
}
