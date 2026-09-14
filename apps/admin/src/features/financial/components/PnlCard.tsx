import type { MonthlyFinancialStatement } from '@pos-tercos/types';
import { formatCop } from '@pos-tercos/ui';
import { PnlLossLines } from './PnlLossLines';
import { Row } from './PnlRow';

export function PnlCard({ s }: { s: MonthlyFinancialStatement }) {
  const netPositive = s.netResult >= 0;
  const enCurso = s.periodStatus ? s.periodStatus === 'in_progress' : (s.periodInProgress ?? false);
  const futuro = s.periodStatus === 'future';
  const grossPct = (s.grossMarginPct * 100).toFixed(1);
  const recurring = s.fixedCosts.filter((c) => !c.isOneTime);
  const oneTime = s.fixedCosts.filter((c) => c.isOneTime);

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <h2 className="font-display text-lg font-bold text-foreground">Resultado del mes</h2>

      {/* Bloque ingresos → margen bruto */}
      <div className="space-y-1.5 text-sm">
        {/* Los descuentos ya están restados del ingreso. Sin esta línea el dueño
            no podía ver cuánto regaló ni separar "vendí menos" de "descontué más". */}
        {s.discountTotal > 0 ? (
          <>
            <Row label="Ventas a precio de lista" value={formatCop(s.grossRevenue)} muted />
            <Row
              label="− Descuentos y promociones"
              value={`−${formatCop(s.discountTotal)}`}
              muted
            />
            <Row label="Ingresos del mes (ya con descuentos)" value={formatCop(s.revenue)} strong />
          </>
        ) : (
          <Row label="Ingresos del mes" value={formatCop(s.revenue)} />
        )}
        <Row label="− COGS (costo real FIFO)" value={`−${formatCop(s.cogs)}`} muted />
        {s.cogsPartial ? (
          <p className="rounded-md border border-warning-border bg-warning-bg/30 px-3 py-2 text-xs text-warning">
            Parte de lo vendido no tiene ningún precio con qué costearse: salió de inventario que
            entró sin valor y sin precio de referencia (carga la factura de compra, o indica el
            costo al ajustar). El COGS está subestimado y la ganancia mostrada es mayor a la real.
          </p>
        ) : s.cogsEstimated ? (
          <p className="rounded-md border border-warning-border bg-warning-bg/30 px-3 py-2 text-xs text-warning">
            Parte del COGS se costeó con un <strong>estimado</strong>: ventas sin stock, sobrantes
            de conteo o ajustes que entraron sin precio y se valoraron al último costo conocido. El
            margen es aproximado hasta que la factura de compra confirme el precio.
          </p>
        ) : null}
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
            Aún no tienes costos fijos cargados. Créalos en Finanzas → Costos y gastos para que
            este reporte sea preciso.
          </p>
        ) : (
          <ul className="space-y-1">
            {recurring.map((c, idx) => (
              <CostLi
                key={`${c.fixedCostId ?? 'payroll'}-${idx}`}
                name={c.name}
                category={c.category}
                amount={c.monthlyAmount}
                estimated={c.isEstimated}
              />
            ))}
          </ul>
        )}
        <div className="my-2 border-t border-border" />
        <Row label="Total costos fijos" value={`−${formatCop(s.totalFixed)}`} strong />
        {/* La pregunta que aparece al leer esta lista: "¿pero si no lo pagué?".
            El resultado del mes cuenta lo que el mes CONSUMIÓ, se haya pagado o
            no — si no, un mes se vería barato solo por deber. Lo que falta por
            pagar (incluidos meses anteriores) vive en Finanzas → Pagos. El MONTO
            sí depende del pago: con pago registrado es lo que salió de verdad;
            sin pago, el de la ficha, y se rotula "estimado". */}
        <p className="pt-1 text-[0.6875rem] leading-relaxed text-muted-foreground">
          Cada costo pesa en el mes que corresponde, esté pagado o no: así el resultado dice si el
          mes dio ganancia, no si alcanzaste a pagar. Si ya lo pagaste, muestra lo que pagaste; si
          no, el monto de la ficha marcado como estimado. Lo que queda debiendo —de este mes o de
          anteriores— está en Finanzas → Pagos.
          {enCurso ? (
            <>
              {' '}
              Son los costos del <strong>mes completo</strong>: la nómina de todos los días
              laborables y el arriendo entero, aunque el mes vaya por la mitad. Lo que se le debe
              hoy a cada persona es otra cosa y está en <strong>Nómina pendiente</strong>.
            </>
          ) : null}
        </p>
      </div>

      {/* Bloque gastos únicos / excepcionales del mes */}
      {oneTime.length > 0 ? (
        <div className="space-y-1.5 text-sm">
          <p className="caps text-[0.625rem] text-muted-foreground">Gastos únicos del mes</p>
          <ul className="space-y-1">
            {oneTime.map((c, idx) => (
              <CostLi
                key={`${c.fixedCostId ?? 'one'}-${idx}`}
                name={c.name}
                category={c.category}
                amount={c.monthlyAmount}
                estimated={c.isEstimated}
              />
            ))}
          </ul>
          <div className="my-2 border-t border-border" />
          <Row label="Total gastos únicos" value={`−${formatCop(s.oneTimeCost)}`} strong />
        </div>
      ) : null}

      <PnlLossLines s={s} />

      {/* Resultado neto: el banner grande verde/rojo */}
      <div
        className={`rounded-xl border p-4 ${
          netPositive ? 'border-success/30 bg-success/10' : 'border-destructive/30 bg-destructive/10'
        }`}
      >
        <p className="caps text-[0.625rem] text-muted-foreground">
          {enCurso && s.periodDaysTotal
            ? `Así va el mes · día ${s.periodDaysElapsed} de ${s.periodDaysTotal}`
            : futuro
              ? 'Mes que todavía no empieza'
              : 'Resultado neto del mes'}
        </p>
        <p
          className={`mt-1 font-display text-3xl font-bold tabular-nums ${
            netPositive ? 'text-success' : 'text-destructive'
          }`}
        >
          {formatCop(s.netResult)}
        </p>
        {/* Un mes a la mitad NO cerró, y uno que no empezó tampoco. Decirlo
            comparaba lo vendido hasta hoy contra los costos del mes completo y
            lo daba por hecho consumado: con $9,4M vendidos y $10,2M de costos
            del mes, el 13 de septiembre se leía "el mes cerró en pérdida". El
            signo del neto manda sobre el texto: un mes en curso ya en verde no
            puede decir que va en rojo. */}
        <p className={`mt-1 text-xs ${netPositive ? 'text-success/80' : 'text-destructive/80'}`}>
          {futuro
            ? 'Son los costos ya cargados para ese mes. Todavía no hay ventas porque no ha empezado.'
            : enCurso
              ? netPositive
                ? 'Con lo que llevas vendido ya cubres los costos completos del mes. Lo que entre de aquí al cierre suma.'
                : 'Están cargados los costos completos del mes contra lo que llevas vendido, así que a mitad de mes este número va en rojo y se endereza al vender.'
              : netPositive
                ? 'El negocio cubrió todos los costos del mes y dejó ganancia.'
                : 'El mes cerró en pérdida: las ventas no alcanzaron a cubrir el costo de lo vendido, los costos fijos, los gastos únicos ni las pérdidas del mes.'}
        </p>
        {enCurso && s.projectedNet !== null && s.projectedNet !== undefined ? (
          <p className="mt-2 border-t border-current/15 pt-2 text-xs text-muted-foreground">
            Al ritmo de lo que llevas, el mes cierra alrededor de{' '}
            <strong className={s.projectedNet >= 0 ? 'text-success' : 'text-destructive'}>
              {formatCop(s.projectedNet)}
            </strong>
            {s.projectedRevenue ? <> con {formatCop(s.projectedRevenue)} de ventas</> : null}.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function CostLi({
  name,
  category,
  amount,
  estimated,
}: {
  name: string;
  category: string;
  amount: number;
  estimated: boolean;
}) {
  return (
    <li className="flex items-baseline justify-between gap-3 text-foreground">
      <span className="min-w-0 truncate">
        {name}
        <span className="ml-1 text-xs text-muted-foreground">· {category}</span>
        {estimated ? (
          <span
            className="ml-1.5 rounded border border-warning-border bg-warning-bg/30 px-1.5 py-px text-[0.625rem] text-warning"
            title="Todavía no registraste el pago de este mes: se muestra el monto de la ficha. Al marcarlo pagado, aparece lo que pagaste."
          >
            estimado
          </span>
        ) : null}
      </span>
      <span className="shrink-0 whitespace-nowrap tabular-nums text-muted-foreground">
        −{formatCop(amount)}
      </span>
    </li>
  );
}

