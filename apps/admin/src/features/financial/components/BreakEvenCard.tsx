import { chooseMonthTarget } from '@pos-tercos/domain';
import { BreakEvenDetail } from './BreakEvenDetail';
import type { MonthlyFinancialStatement } from '@pos-tercos/types';
import { formatCop } from '@pos-tercos/ui';

const pctText = (v: number): string => `${Math.round(v * 100)}%`;

/**
 * Cuánto hay que vender en el mes para cubrir todo lo que hay que pagar.
 *
 * La meta se calcula con el margen que de verdad queda de cada venta: el que
 * ya descontó la receta, la merma, las cortesías, los faltantes y los fletes.
 * La de la CARTA (precio contra receta) ignora esas fugas y por eso queda baja
 * — vendiendo justo esa meta el mes cierra en pérdida por el monto de las
 * fugas. Se usa la de la carta solo mientras el mes no tenga ventas suficientes
 * para medir el margen real, porque con tres ventas un flete se lleva decenas
 * de puntos y una meta que salta no sirve de meta.
 *
 * La barra va de 0 a 100 con una marca en el día de hoy: un porcentaje de
 * avance sin el tiempo al lado no dice si se va adelantado o corto, y cualquier
 * número por debajo de 100 se lee como alarma.
 */
export function BreakEvenCard({ s }: { s: MonthlyFinancialStatement }) {
  const c = s.catalogBreakEven;

  // La meta se elige PRIMERO: los guardas de abajo miran el resultado, no el
  // margen de la carta. Si no, una carta a medio costear bloqueaba la tarjeta
  // —"tus productos no dejan ganancia"— sobre un mes cuyo margen real era 55%,
  // y escondía una meta que sí se podía calcular.
  const meta = chooseMonthTarget({
    realizedTarget: s.breakEven,
    realizedMarginPct: s.contributionMarginPct,
    catalogTarget: c.target,
    catalogMarginPct: c.marginPct,
    salesCount: s.salesCount,
  });

  if (meta === null) {
    // Sin ninguna de las dos: o la carta no tiene costos con qué estimar, o el
    // mes no deja nada de cada venta. Se distingue, porque lo que hay que hacer
    // es distinto.
    const noDeja = s.contributionMarginPct !== null && s.contributionMarginPct <= 0;
    return (
      <Marco tone={noDeja ? 'destructive' : undefined}>
        <p className={`text-sm ${noDeja ? 'text-destructive' : 'text-muted-foreground'}`}>
          {noDeja ? (
            <>
              Este mes <strong>cada venta pierde plata</strong>: después del costo de la receta, la
              merma, las cortesías, los faltantes y los fletes no queda nada para pagar lo fijo.
              Vender más no acerca al equilibrio. Primero hay que subir precios, bajar el costo de
              las recetas o cortar esas pérdidas.
            </>
          ) : (
            <>
              Todavía no se puede calcular: ningún producto tiene un costo de receta con el que
              estimar cuánto deja. Completa las recetas y los precios de compra de los insumos, y el
              cálculo se activa solo.
            </>
          )}
        </p>
      </Marco>
    );
  }

  if (meta.target <= 0) {
    return (
      <Marco>
        <p className="mt-2 text-sm text-muted-foreground">
          No hay costos ni gastos cargados este mes, así que no hay meta que cubrir. Cárgalos en
          Finanzas → Costos y gastos y este número aparece solo.
        </p>
      </Marco>
    );
  }

  const cobertura = s.revenue / meta.target;
  const cubierto = cobertura >= 1;
  const falta = Math.max(0, meta.target - s.revenue);
  // Dónde va la marca de "hoy": sin ella, un porcentaje de avance no dice si se
  // va adelantado o corto, y cualquier número por debajo de 100 se lee como
  // alarma. Con ella, la comparación es de un vistazo.
  const corrido =
    s.periodInProgress && s.periodDaysTotal && s.periodDaysElapsed
      ? s.periodDaysElapsed / s.periodDaysTotal
      : null;
  const adelantado = corrido !== null && cobertura >= corrido;

  return (
    <Marco>
      <p className="text-sm text-muted-foreground">
        Es cuánto tienes que vender en el mes para cubrir todo lo que hay que pagar: los costos
        fijos —arriendo, nómina, servicios— más los gastos únicos y los compromisos que se pagaron
        este mes.
      </p>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="min-w-0 text-muted-foreground">Hay que cubrir este mes</span>
          <span className="shrink-0 whitespace-nowrap tabular-nums">{formatCop(s.breakEvenBase)}</span>
        </div>
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="min-w-0 text-muted-foreground">De cada $100 vendidos te quedan</span>
          <span className="shrink-0 whitespace-nowrap font-bold tabular-nums">
            ${Math.round(meta.marginPct * 100)}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="min-w-0 text-muted-foreground">Ventas necesarias del mes</span>
          <span className="shrink-0 whitespace-nowrap font-bold tabular-nums">
            {formatCop(meta.target)}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="min-w-0 text-muted-foreground">Llevas vendido</span>
          <span className="shrink-0 whitespace-nowrap tabular-nums">{formatCop(s.revenue)}</span>
        </div>

        <div className="relative mt-2 h-3 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full transition-all ${cubierto ? 'bg-success' : 'bg-warning'}`}
            style={{ width: `${Math.min(100, Math.max(0, cobertura * 100))}%` }}
          />
          {corrido !== null ? (
            <span
              aria-hidden
              className="absolute inset-y-0 w-0.5 bg-foreground/70"
              style={{ left: `${Math.min(100, Math.max(0, corrido * 100))}%` }}
            />
          ) : null}
        </div>
        {corrido !== null ? (
          <p className="text-[0.6875rem] text-muted-foreground">
            La marca es hoy: vas por el día {s.periodDaysElapsed} de {s.periodDaysTotal}.
          </p>
        ) : null}

        <p className="text-xs text-muted-foreground">
          Cobertura:{' '}
          <strong className={cubierto ? 'text-success' : 'text-warning'}>{pctText(cobertura)}</strong>
          {cubierto ? (
            <> · ya cubre todo lo que hay que pagar este mes.</>
          ) : (
            <>
              {' '}
              · te faltan <strong>{formatCop(falta)}</strong> de ventas para llegar al equilibrio.
            </>
          )}
          {corrido !== null ? (
            <>
              {' '}
              Llevas corrido el {pctText(corrido)} del mes, así que{' '}
              <strong className={adelantado ? 'text-success' : 'text-warning'}>
                {adelantado ? 'vas adelantado' : 'vas corto'}
              </strong>
              .
            </>
          ) : null}
        </p>
      </div>

      <BreakEvenDetail c={c} s={s} basis={meta.basis} />
    </Marco>
  );
}

function Marco({ children, tone }: { children: React.ReactNode; tone?: 'destructive' }) {
  return (
    <div
      className={`space-y-3 rounded-2xl border bg-card p-5 ${
        tone === 'destructive' ? 'border-destructive/40' : 'border-border'
      }`}
    >
      <h2 className="font-display text-lg font-bold text-foreground">Punto de equilibrio</h2>
      {children}
    </div>
  );
}
