import type { MonthlyFinancialStatement } from '@pos-tercos/types';

const pctText = (v: number): string => `${Math.round(v * 100)}%`;

/**
 * De dónde salió la meta, y qué se está comiendo el margen.
 *
 * Sin esta parte, el margen de la carta y el que de verdad queda al final del
 * mes se ven como dos cifras que se contradicen. La diferencia entre las dos es
 * el dato útil: son la merma, las cortesías, los faltantes y los fletes.
 */
export function BreakEvenDetail({
  c,
  s,
  basis,
}: {
  c: MonthlyFinancialStatement['catalogBreakEven'];
  s: MonthlyFinancialStatement;
  basis: 'realized' | 'catalog';
}) {
  const real = s.contributionMarginPct;
  const brecha = c.marginPct !== null && real !== null ? c.marginPct - real : null;

  return (
    <details className="border-t border-border pt-3 text-xs text-muted-foreground">
      <summary className="cursor-pointer font-medium text-foreground">Cómo se calculó</summary>
      <ul className="mt-2 space-y-1.5">
        <li>
          {basis === 'realized' ? (
            <>
              La meta usa lo que de verdad quedó de cada venta este mes:{' '}
              <strong>{real !== null ? pctText(real) : '—'}</strong>, ya descontados el costo de la
              receta, la merma, las cortesías, los faltantes y los fletes de compra.
            </>
          ) : (
            <>
              La meta usa por ahora el margen de la <strong>carta</strong> (precio contra receta):
              este mes todavía no tiene ventas suficientes para medir cuánto se pierde entre la
              cocina y la caja. Cuando las tenga, la meta pasa sola al margen real, que es más alto
              de cubrir.
            </>
          )}
        </li>
        <li>
          El margen de la carta es el promedio de <strong>{c.productsConsidered}</strong>{' '}
          {c.productsConsidered === 1 ? 'opción' : 'opciones'}
          {c.weightedBySales
            ? ', pesado por lo que se vendió este mes (vender mucho de lo que menos deja baja el promedio).'
            : ', parejo entre toda la carta porque todavía no hay ventas del mes.'}{' '}
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
        {real !== null && brecha !== null && c.marginPct !== null ? (
          <li>
            La carta deja <strong>{pctText(c.marginPct)}</strong> y este mes quedaron{' '}
            <strong>{pctText(real)}</strong>: {pctText(Math.abs(brecha))}{' '}
            {brecha > 0 ? 'menos' : 'más'}. Esa diferencia es lo que se pierde entre la cocina y la
            caja, y por eso la meta con el margen real es más alta.
          </li>
        ) : null}
        {s.periodInProgress ? (
          <li>
            Los costos que hay que cubrir son los del <strong>mes completo</strong> (la nómina de
            todos los días laborables, el arriendo entero), aunque el mes vaya por la mitad. Por eso
            la meta no se mueve día a día.
          </li>
        ) : null}
      </ul>
    </details>
  );
}
