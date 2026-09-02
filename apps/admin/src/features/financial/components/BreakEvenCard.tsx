import type { MonthlyFinancialStatement } from '@pos-tercos/types';
import { formatCop } from '@pos-tercos/ui';

const pctText = (v: number): string => `${Math.round(v * 100)}%`;

/**
 * Cuánto hay que vender para cubrir lo fijo.
 *
 * Se calcula con el margen de la CARTA —lo que deja cada producto por precio y
 * receta—, no con el margen realizado del mes. Ese era correcto pero inservible
 * con poco volumen: en un mes de $92.000 vendidos, un flete de $34.000 se lleva
 * 37 puntos y el equilibrio saltaba de $4,3 a $8,7 millones. La cifra que se
 * mueve así no es una meta, es ruido.
 *
 * Lo realizado NO se esconde: va abajo como contraste, porque es donde se ve
 * cuánto se están comiendo la merma, las cortesías y los fletes.
 */
export function BreakEvenCard({ s }: { s: MonthlyFinancialStatement }) {
  const c = s.catalogBreakEven;

  if (c.marginPct !== null && c.marginPct <= 0) {
    return (
      <Marco tone="destructive">
        <p className="text-sm text-destructive">
          Con los precios y las recetas de hoy, tus productos <strong>no dejan ganancia</strong>:
          vender más no te acerca a cubrir los costos fijos. Primero hay que subir precios o bajar
          el costo de las recetas.
        </p>
      </Marco>
    );
  }

  if (c.target === null) {
    return (
      <Marco>
        <p className="mt-2 text-sm text-muted-foreground">
          Todavía no se puede calcular: ningún producto tiene un costo de receta con el que estimar
          cuánto deja. Completa las recetas y los precios de compra de los insumos, y el cálculo se
          activa solo.
        </p>
      </Marco>
    );
  }

  const cobertura = c.coverage ?? 0;
  // Sin costos fijos recurrentes cargados la meta es $0: no hay nada que
  // cubrir. Tratarlo como "0% cubierto" mostraba "te faltan −$ 12.000", un
  // faltante negativo en una frase que ya dice "faltan".
  const sinMeta = c.target <= 0;
  const cubierto = !sinMeta && cobertura >= 1;
  const falta = Math.max(0, c.target - s.revenue);

  return (
    <Marco>
      <p className="text-sm text-muted-foreground">
        Es cuánto tienes que vender en el mes para cubrir los costos fijos —arriendo, nómina,
        servicios—. Se calcula con lo que deja cada producto de tu carta (precio contra receta), así
        que no se mueve por lo flojo o lo bueno que haya estado el mes. Los gastos puntuales quedan
        fuera: no se repiten.
      </p>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="min-w-0 text-muted-foreground">De cada $100 vendidos te quedan</span>
          <span className="shrink-0 whitespace-nowrap font-bold tabular-nums">
            ${c.marginPct !== null ? Math.round(c.marginPct * 100) : '—'}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="min-w-0 text-muted-foreground">Ventas necesarias del mes</span>
          <span className="shrink-0 whitespace-nowrap font-bold tabular-nums">{formatCop(c.target)}</span>
        </div>
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="min-w-0 text-muted-foreground">Llevas vendido</span>
          <span className="shrink-0 whitespace-nowrap tabular-nums">{formatCop(s.revenue)}</span>
        </div>

        <div className="mt-2 h-3 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full transition-all ${cubierto ? 'bg-success' : 'bg-warning'}`}
            style={{ width: `${Math.min(100, (Math.min(cobertura, 1.5) / 1.5) * 100)}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {sinMeta ? (
            <>
              No hay costos fijos recurrentes cargados, así que no hay meta que cubrir. Cárgalos en
              Finanzas → Costos y gastos y este número aparece solo.
            </>
          ) : (
            <>
              Cobertura:{' '}
              <strong className={cubierto ? 'text-success' : 'text-warning'}>
                {pctText(cobertura)}
              </strong>
              {cubierto ? (
                <> · ya cubre los costos fijos recurrentes.</>
              ) : (
                <>
                  {' '}
                  · te faltan <strong>{formatCop(falta)}</strong> de ventas para llegar al
                  equilibrio.
                </>
              )}
            </>
          )}
        </p>
      </div>

      <ComoSeCalculo c={c} s={s} />
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

/**
 * De dónde salió el número, y qué se lo está comiendo.
 *
 * Sin esta parte, el margen de la carta y el que de verdad quedó al final del
 * mes se ven como dos cifras que se contradicen. La diferencia entre las dos es
 * el dato útil: son la merma, las cortesías, los faltantes y los fletes.
 */
function ComoSeCalculo({
  c,
  s,
}: {
  c: MonthlyFinancialStatement['catalogBreakEven'];
  s: MonthlyFinancialStatement;
}) {
  const real = s.contributionMarginPct;
  const brecha = c.marginPct !== null && real !== null ? c.marginPct - real : null;

  return (
    <details className="border-t border-border pt-3 text-xs text-muted-foreground">
      <summary className="cursor-pointer font-medium text-foreground">Cómo se calculó</summary>
      <ul className="mt-2 space-y-1.5">
        <li>
          Promedio de <strong>{c.productsConsidered}</strong>{' '}
          {c.productsConsidered === 1 ? 'opción de la carta' : 'opciones de la carta'}
          {c.weightedBySales
            ? ', pesado por lo que se vendió este mes (vender mucho de lo que menos deja baja el promedio).'
            : ', pareja entre toda la carta porque todavía no hay ventas del mes.'}{' '}
          Un plato con variantes cuenta una opción por variante: cada una tiene su precio y su
          receta, y nadie compra la receta base sola.
        </li>
        {c.best && c.worst && c.productsConsidered > 1 ? (
          <li>
            El que más deja es <strong>{c.best.name}</strong> ({pctText(c.best.marginPct)}); el que
            menos, <strong>{c.worst.name}</strong> ({pctText(c.worst.marginPct)}).
          </li>
        ) : null}
        {c.productsWithoutCost > 0 ? (
          <li className="text-warning">
            {c.productsWithoutCost}{' '}
            {c.productsWithoutCost === 1
              ? 'opción quedó fuera porque no se sabe cuánto cuesta'
              : 'opciones quedaron fuera porque no se sabe cuánto cuestan'}
            . Completa su receta o el precio de compra de sus insumos para que el promedio los tenga
            en cuenta.
          </li>
        ) : null}
        {real !== null && brecha !== null ? (
          <li>
            Este mes, después de la merma, las cortesías, los faltantes y los fletes, de cada $100
            te quedaron <strong>${Math.round(real * 100)}</strong> — {pctText(Math.abs(brecha))}{' '}
            {brecha > 0 ? 'menos' : 'más'} que lo que deja la carta. Esa diferencia es lo que se
            pierde entre la cocina y la caja.
          </li>
        ) : null}
      </ul>
    </details>
  );
}
