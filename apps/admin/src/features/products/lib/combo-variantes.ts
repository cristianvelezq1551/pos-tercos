import type { Product } from '@pos-tercos/types';

/**
 * Reglas de la pantalla para los combos con componentes con variante
 * (PLAN-COMBO-CON-VARIANTE.md). Espejan lo que el servidor exige al guardar y
 * al vender: si la pantalla aceptara lo que el servidor rechaza, el dueño se
 * enteraría recién al tocar Guardar.
 */

export function tieneVariantes(p: Pick<Product, 'sizes'>): boolean {
  return (p.sizes?.length ?? 0) > 0;
}

/** Precio de UNA unidad del componente: el plato más el recargo de su variante. */
export function precioDeComponente(p: Pick<Product, 'basePrice' | 'sizes'>, sizeId: string): number {
  const size = sizeId ? p.sizes?.find((s) => s.id === sizeId) : undefined;
  return p.basePrice + (size?.priceModifier ?? 0);
}

export interface ComboSinVariante {
  id: string;
  name: string;
  /** Platos fijos con variantes que el combo no dice cuál lleva: el combo no se vende. */
  faltaVariante: string[];
  /** Opciones a elegir con variantes: esas opciones no se pueden elegir. */
  opcionesConVariantes: string[];
}

/**
 * Los combos activos que quedaron "varados" porque un plato que llevan ganó
 * variantes después de entrar al combo. El servidor los apaga (nunca los vende
 * con la receta base); esta lista es para que el dueño se entere y los edite.
 */
export function combosSinVariante(products: readonly Product[]): ComboSinVariante[] {
  const porId = new Map(products.map((p) => [p.id, p]));
  const conVariantes = (productId: string): Product | null => {
    const p = porId.get(productId);
    return p && tieneVariantes(p) ? p : null;
  };
  const out: ComboSinVariante[] = [];
  for (const combo of products) {
    if (!combo.isCombo || !combo.isActive) continue;
    const faltaVariante = (combo.comboComponents ?? [])
      .filter((c) => !c.sizeId)
      .map((c) => conVariantes(c.productId)?.name)
      .filter((n): n is string => Boolean(n));
    const opcionesConVariantes = (combo.choiceGroups ?? [])
      .flatMap((g) => g.options)
      .map((o) => conVariantes(o.productId)?.name)
      .filter((n): n is string => Boolean(n));
    if (faltaVariante.length > 0 || opcionesConVariantes.length > 0) {
      out.push({
        id: combo.id,
        name: combo.name,
        faltaVariante: [...new Set(faltaVariante)],
        opcionesConVariantes: [...new Set(opcionesConVariantes)],
      });
    }
  }
  return out;
}
