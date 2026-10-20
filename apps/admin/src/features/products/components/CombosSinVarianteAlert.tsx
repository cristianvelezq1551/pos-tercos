import Link from 'next/link';
import type { Product } from '@pos-tercos/types';
import { combosSinVariante } from '../lib/combo-variantes';

/**
 * Avisa de los combos que quedaron sin variante: un plato que llevan ganó
 * variantes DESPUÉS de entrar al combo. El servidor los apaga —no los vende con
 * la receta base, que descontaría y costearía de menos—; sin este aviso el
 * dueño solo vería el combo "no disponible" en la caja sin saber por qué.
 */
export function CombosSinVarianteAlert({ products }: { products: readonly Product[] }) {
  const varados = combosSinVariante(products);
  if (varados.length === 0) return null;
  return (
    <div
      role="alert"
      className="mb-4 space-y-2 rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground"
    >
      <p className="font-semibold">
        {varados.length === 1 ? 'Un combo necesita' : `${varados.length} combos necesitan`} que
        elijas una variante
      </p>
      <ul className="space-y-1">
        {varados.map((c) => (
          <li key={c.id}>
            <Link href={`/products/${c.id}`} className="font-medium text-primary underline">
              {c.name}
            </Link>
            {c.faltaVariante.length > 0 ? (
              <>
                : {c.faltaVariante.join(', ')} tiene variantes y el combo no dice cuál. Mientras
                no la elijas, el combo no se ofrece en la caja ni en la web.
              </>
            ) : null}
            {c.opcionesConVariantes.length > 0 ? (
              <>
                {c.faltaVariante.length > 0 ? ' Además, ' : ': '}
                {c.opcionesConVariantes.join(', ')} tiene variantes y no se puede elegir como
                opción. Quítalo de las opciones o agrégalo como componente fijo.
              </>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
