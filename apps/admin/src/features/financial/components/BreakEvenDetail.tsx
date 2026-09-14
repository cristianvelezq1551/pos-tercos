import type { MonthlyFinancialStatement } from '@pos-tercos/types';

const pctText = (v: number): string => `${Math.round(v * 100)}%`;

/**
 * De dónde salió la meta, y qué se está comiendo el margen.
 *
 * Sin esta parte, el margen bruto y lo que de verdad queda al final del mes se
 * ven como dos cifras que se contradicen. La diferencia entre las dos es el
 * dato útil: son la merma, los faltantes, las cortesías y los fletes — que ya
 * no se esconden en un porcentaje, sino que suman a la meta en pesos.
 */
export function BreakEvenDetail({
  c,
  s,
  basis,
}: {
  c: MonthlyFinancialStatement['catalogBreakEven'];
  s: MonthlyFinancialStatement;
  basis: 'gross' | 'catalog';
}) {
  const real = s.contributionMarginPct;
  const bruto = s.grossMarginPct;
  const brecha = real !== null ? bruto - real : null;

  return (
    <details className="border-t border-border pt-3 text-xs text-muted-foreground">
      <summary className="cursor-pointer font-medium text-foreground">Cómo se calculó</summary>
      <ul className="mt-2 space-y-1.5">
        <li>
          {basis === 'gross' ? (
            <>
              La meta divide todo lo que hay que cubrir entre lo que deja la comida vendida:{' '}
              <strong>{pctText(bruto)}</strong> (precio menos el costo real de la receta, lote por
              lote). Las pérdidas del mes no se descuentan de ese porcentaje: se suman arriba, a lo
              que hay que pagar — son plata que hay que volver a vender, no un menor margen.
            </>
          ) : (
            <>
              La meta usa por ahora el margen de la <strong>carta</strong> (precio contra receta):
              este mes todavía no tiene ventas suficientes para medir el margen real sobre una
              muestra decente. Cuando las tenga, pasa sola al margen medido.
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
        {real !== null && brecha !== null ? (
          <li>
            La comida deja <strong>{pctText(bruto)}</strong>, pero al final del mes quedaron{' '}
            <strong>{pctText(real)}</strong>: {pctText(Math.abs(brecha))}{' '}
            {brecha > 0 ? 'menos' : 'más'}. Esa diferencia es lo que se pierde entre la cocina y la
            caja, y es justo lo que la meta suma arriba en pesos.
          </li>
        ) : null}
        {s.periodInProgress ? (
          <li>
            Los costos fijos que hay que cubrir son los del <strong>mes completo</strong> (la
            nómina de todos los días laborables, el arriendo entero), aunque el mes vaya por la
            mitad. La meta sí sube cuando aparece una pérdida nueva: cada peso que se pierde hay
            que volver a venderlo.
          </li>
        ) : null}
      </ul>
    </details>
  );
}
