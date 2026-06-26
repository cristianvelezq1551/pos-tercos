import type { MonthlyFinancialStatement } from '@pos-tercos/types';
import { formatCop } from '@pos-tercos/ui';

export function PnlCard({ s }: { s: MonthlyFinancialStatement }) {
  const netPositive = s.netResult >= 0;
  const grossPct = (s.grossMarginPct * 100).toFixed(1);
  const recurring = s.fixedCosts.filter((c) => !c.isOneTime);
  const oneTime = s.fixedCosts.filter((c) => c.isOneTime);

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

      {/* Bloque costos fijos (recurrentes) */}
      <div className="space-y-1.5 text-sm">
        <p className="caps text-[0.625rem] text-muted-foreground">Costos fijos (recurrentes)</p>
        {recurring.length === 0 ? (
          <p className="rounded-md border border-warning-border bg-warning-bg/30 px-3 py-2 text-xs text-warning">
            Aún no tienes costos fijos cargados. Crealos en Finanzas → Costos y gastos para que este
            reporte sea preciso.
          </p>
        ) : (
          <ul className="space-y-1">
            {recurring.map((c, idx) => (
              <CostLi key={`${c.fixedCostId ?? 'payroll'}-${idx}`} name={c.name} category={c.category} amount={c.monthlyAmount} />
            ))}
          </ul>
        )}
        <div className="my-2 border-t border-border" />
        <Row label="Total costos fijos" value={`−${formatCop(s.totalFixed)}`} strong />
      </div>

      {/* Bloque gastos únicos / excepcionales del mes */}
      {oneTime.length > 0 ? (
        <div className="space-y-1.5 text-sm">
          <p className="caps text-[0.625rem] text-muted-foreground">Gastos únicos del mes</p>
          <ul className="space-y-1">
            {oneTime.map((c, idx) => (
              <CostLi key={`${c.fixedCostId ?? 'one'}-${idx}`} name={c.name} category={c.category} amount={c.monthlyAmount} />
            ))}
          </ul>
          <div className="my-2 border-t border-border" />
          <Row label="Total gastos únicos" value={`−${formatCop(s.oneTimeCost)}`} strong />
        </div>
      ) : null}

      {/* Cortesías: producto regalado (autorizado), valuado a costo FIFO. */}
      {s.cortesiasCost > 0 || s.cortesiasCostPartial ? (
        <div className="space-y-1.5 text-sm">
          <Row
            label="− Cortesías (producto regalado, a costo)"
            value={`−${formatCop(s.cortesiasCost)}`}
            muted
          />
          {s.cortesiasCostPartial ? (
            <p className="rounded-md border border-warning-border bg-warning-bg/30 px-3 py-2 text-xs text-warning">
              Algunas cortesías se regalaron sin stock costeado a FIFO, así que esta pérdida puede
              estar subestimada.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Reembolsos: comida preparada cuya plata se devolvió, valuada a costo FIFO. */}
      {s.refundCost > 0 ? (
        <div className="space-y-1.5 text-sm">
          <Row
            label="− Reembolsos (comida preparada, a costo)"
            value={`−${formatCop(s.refundCost)}`}
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
            ? 'El negocio cubrió todos los costos (fijos, gastos únicos y cortesías) y dejó ganancia.'
            : 'El mes cerró en pérdida: las ventas no alcanzaron a cubrir COGS + costos fijos + gastos únicos + cortesías.'}
        </p>
      </div>
    </div>
  );
}

function CostLi({ name, category, amount }: { name: string; category: string; amount: number }) {
  return (
    <li className="flex justify-between gap-2 text-foreground">
      <span className="min-w-0 truncate">
        {name}
        <span className="ml-1 text-xs text-muted-foreground">· {category}</span>
      </span>
      <span className="tabular-nums text-muted-foreground">−{formatCop(amount)}</span>
    </li>
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
