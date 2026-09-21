/**
 * Motor de promociones del modelo sombra, escrito desde las reglas de
 * `CLAUDE.md` §12.A — no copiado de `apply-promotions.ts`. Si reusara esa
 * función, un error suyo aparecería idéntico en el "esperado".
 *
 * Reglas que implementa:
 *  - PERCENT_OFF: el porcentaje sobre el subtotal de la línea.
 *  - FIXED_OFF:   un monto fijo POR CADA UNIDAD, nunca más que el subtotal.
 *                 (Decisión del dueño 2026-08-31: "$2.000 de descuento en
 *                 hamburguesas" son $2.000 por cada hamburguesa. Aplicarlo una
 *                 vez por línea hacía que el precio dependiera de en cuántas
 *                 líneas quedó repartida la misma cantidad.)
 *  - BOGO:        cada set de (comprar + gratis) regala `gratis` unidades;
 *                 solo cuentan los sets COMPLETOS.
 *  - COMBO_OFF:   igual que porcentaje o fijo (también por unidad), pero solo
 *                 si la línea es un combo.
 *  - FIXED_PRICE: el producto se vende a un precio definido. El descuento por
 *                 unidad es `precio del producto con su tamaño − precio fijo`;
 *                 los extras se cobran ENCIMA (decisión del dueño 2026-09-21) y
 *                 si el producto ya es más barato no descuenta nada.
 *  - Una promo puede limitarse a UNA variante (`tamanoId`): solo aplica a la
 *                 línea que lleve exactamente ese tamaño.
 *  - NO se acumulan: gana UNA, la de mayor descuento ABSOLUTO en pesos. Es la
 *    única forma justa de comparar un 20% contra $3.000. Si empatan, gana la
 *    de id menor (desempate estable, para que el resultado no dependa del orden).
 */

export type TipoPromo = 'PERCENT_OFF' | 'FIXED_OFF' | 'BOGO' | 'COMBO_OFF' | 'FIXED_PRICE';

export interface PromoSombra {
  id: string;
  tipo: TipoPromo;
  productoId: string;
  /**
   * True si comparte producto con otra promoción. Una promoción disputada
   * puede no aplicarse NUNCA —si la otra siempre la supera— y eso no es un
   * fallo: es la regla del ganador funcionando. Por eso la cobertura se exige
   * solo sobre las que no compiten.
   */
  disputada?: boolean;
  /** Fracción 0..1 (PERCENT_OFF y COMBO_OFF). */
  pct?: number;
  /** Monto en pesos (FIXED_OFF y COMBO_OFF). */
  fijo?: number;
  comprar?: number;
  gratis?: number;
  /** Precio de venta (FIXED_PRICE). */
  precioFijo?: number;
  /** Solo aplica a la línea con este tamaño; sin él, a todas las variantes. */
  tamanoId?: string;
}

/** Peso entero: es plata que se descuenta al cliente (`roundMoney`). */
const redondearPeso = (n: number): number => Math.round(n);

function descuentoDe(
  promo: PromoSombra,
  subtotalLinea: number,
  cantidad: number,
  esCombo: boolean,
  precioBaseUnitario: number,
): number {
  switch (promo.tipo) {
    case 'FIXED_PRICE': {
      const porUnidad = Math.max(0, precioBaseUnitario - (promo.precioFijo ?? 0));
      return Math.min(porUnidad * cantidad, subtotalLinea);
    }
    case 'PERCENT_OFF':
      return Math.min(subtotalLinea * (promo.pct ?? 0), subtotalLinea);
    case 'FIXED_OFF':
      return Math.min((promo.fijo ?? 0) * cantidad, subtotalLinea);
    case 'BOGO': {
      const comprar = promo.comprar ?? 0;
      const gratis = promo.gratis ?? 0;
      if (comprar <= 0 || gratis <= 0) return 0;
      const set = comprar + gratis;
      if (cantidad < set) return 0;
      const unitario = subtotalLinea / cantidad;
      return Math.min(Math.floor(cantidad / set) * gratis * unitario, subtotalLinea);
    }
    case 'COMBO_OFF': {
      if (!esCombo) return 0;
      // Acepta porcentaje o monto fijo; con los dos definidos gana el mayor.
      const porPct = promo.pct ? subtotalLinea * promo.pct : 0;
      // El monto fijo también es por unidad, igual que FIXED_OFF.
      const porFijo = (promo.fijo ?? 0) * cantidad;
      return Math.min(Math.max(porPct, porFijo), subtotalLinea);
    }
  }
}

/**
 * Descuento que le corresponde a una línea. Devuelve 0 si ninguna promoción
 * aplica (o si la venta tiene descuento manual, que las apaga todas — eso lo
 * decide el llamador).
 */
export function descuentoDeLinea(
  promos: readonly PromoSombra[],
  linea: {
    productoId: string;
    subtotal: number;
    cantidad: number;
    esCombo: boolean;
    /** Precio de una unidad con su tamaño, sin extras (base del precio fijo). */
    precioBaseUnitario: number;
    sizeId?: string;
  },
): number {
  const candidatas = promos
    .filter((p) => p.productoId === linea.productoId)
    // Limitada a una variante: solo con ese tamaño en la línea.
    .filter((p) => p.tamanoId === undefined || p.tamanoId === linea.sizeId)
    .map((promo) => ({
      promo,
      descuento: descuentoDe(
        promo,
        linea.subtotal,
        linea.cantidad,
        linea.esCombo,
        linea.precioBaseUnitario,
      ),
    }))
    .filter((c) => c.descuento > 0);

  if (candidatas.length === 0) return 0;

  const ganadora = candidatas.reduce((mejor, c) => {
    if (c.descuento > mejor.descuento) return c;
    if (c.descuento === mejor.descuento && c.promo.id < mejor.promo.id) return c;
    return mejor;
  });
  return redondearPeso(ganadora.descuento);
}
