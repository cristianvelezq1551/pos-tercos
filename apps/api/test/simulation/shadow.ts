/**
 * Modelo SOMBRA: una contabilidad independiente de la aplicación.
 *
 * La regla que hace útil a este archivo: **está escrito desde la especificación
 * (CLAUDE.md), nunca copiado de `src/`**. Si reusara `expandRecipeOneLevel` o
 * `runLedgerFifo`, un error en esas funciones se reflejaría idéntico en el
 * "esperado" y el test pasaría celebrando el bug. Acá la receta se expande a
 * mano y la cola FIFO se reimplementa en veinte líneas.
 *
 * Cubre tres libros que tienen que cuadrar contra la API:
 *   1. UNIDADES  — cuánto stock debería tener cada item.
 *   2. VALOR     — cuánto costó lo que salió (FIFO) y cuánto queda guardado.
 *   3. PLATA     — ingreso, descuentos, envío y efectivo esperado en el cajón.
 */

/** Un lote de compra: cantidad viva y su costo unitario. */
export interface Lote {
  qty: number;
  unitCost: number;
}

export type EntityType = 'INGREDIENT' | 'PRODUCT' | 'SUBPRODUCT';

export const claveDe = (type: EntityType, id: string): string => `${type}:${id}`;

/** Redondeo de costo del repo: 4 decimales (`roundCost` en domain). */
const redondearCosto = (n: number): number => Math.round(n * 10_000) / 10_000;

/**
 * Cola FIFO por stockable. Modela SOLO el caso sano (stock siempre suficiente):
 * la simulación estricta garantiza esa condición, y el caso de stock negativo
 * —donde entra la estimación y la deuda— se verifica aparte con leyes de
 * conservación que no dependen de reimplementar esa política.
 */
export class ColaFifo {
  private lotes: Lote[] = [];

  entrada(qty: number, unitCost: number): void {
    if (qty <= 0) return;
    this.lotes.push({ qty, unitCost });
  }

  /**
   * Saca `qty` de la cabeza. Devuelve el costo y el DETALLE de qué lote salió
   * cada unidad: sin ese detalle una anulación no podría devolver el stock a su
   * costo original (devolverlo al último precio conocido inventaría plata).
   */
  salida(qty: number): { costo: number; tomas: Lote[] } {
    let restante = qty;
    let costo = 0;
    const tomas: Lote[] = [];
    while (restante > 1e-9) {
      const lote = this.lotes[0];
      if (!lote) {
        throw new Error(
          `La cola FIFO sombra se quedó sin lotes con ${restante} unidades por consumir. ` +
            'La simulación estricta no debe permitir stock negativo.',
        );
      }
      const toma = Math.min(lote.qty, restante);
      costo += toma * lote.unitCost;
      tomas.push({ qty: toma, unitCost: lote.unitCost });
      lote.qty -= toma;
      restante -= toma;
      if (lote.qty <= 1e-9) this.lotes.shift();
    }
    return { costo: redondearCosto(costo), tomas };
  }

  /**
   * Devolución de una anulación: las unidades vuelven a la CABEZA con su costo
   * original y en el orden en que salieron, para que el siguiente consumo las
   * gaste antes que a los lotes más nuevos.
   */
  devolver(tomas: readonly Lote[]): void {
    for (let i = tomas.length - 1; i >= 0; i -= 1) {
      const t = tomas[i]!;
      if (t.qty > 0) this.lotes.unshift({ qty: t.qty, unitCost: t.unitCost });
    }
  }

  get cantidad(): number {
    return this.lotes.reduce((acc, l) => acc + l.qty, 0);
  }

  get valor(): number {
    return redondearCosto(this.lotes.reduce((acc, l) => acc + l.qty * l.unitCost, 0));
  }
}

// ====================================================================
// Catálogo que la simulación define (y por lo tanto CONOCE de antemano)
// ====================================================================

export interface AristaReceta {
  childType: 'ingredient' | 'subproduct';
  childId: string;
  /** Cantidad NETA que pide la receta (antes de merma). */
  quantityNeta: number;
  /** Fracción [0,1): 0.1 = se pierde el 10% al manipularlo. */
  mermaPct: number;
}

export interface ProductoSombra {
  id: string;
  nombre: string;
  precio: number;
  directResale: boolean;
  isCombo: boolean;
  /** Solo si es combo: componentes y su cantidad. */
  componentes: Array<{ productId: string; quantity: number }>;
  /** Solo si es preparado: receta de primer nivel. */
  receta: AristaReceta[];
}

export interface SubproductoSombra {
  id: string;
  nombre: string;
  /** Cuántas unidades de stock rinde UNA corrida de la receta. */
  yield: number;
  receta: AristaReceta[];
}

/** Cuánto stock consume vender UNA unidad de un producto (un solo nivel). */
export function consumoDeUnaUnidad(
  producto: ProductoSombra,
  catalogo: Map<string, ProductoSombra>,
): Map<string, number> {
  const out = new Map<string, number>();
  const sumar = (clave: string, qty: number): void => {
    out.set(clave, (out.get(clave) ?? 0) + qty);
  };

  if (producto.isCombo) {
    for (const comp of producto.componentes) {
      const hijo = catalogo.get(comp.productId);
      if (!hijo) throw new Error(`Componente ${comp.productId} ausente del catálogo sombra`);
      for (const [clave, qty] of consumoDeUnaUnidad(hijo, catalogo)) {
        sumar(clave, qty * comp.quantity);
      }
    }
    return out;
  }

  if (producto.directResale) {
    sumar(claveDe('PRODUCT', producto.id), 1);
    return out;
  }

  // Preparado: UN nivel. Los insumos profundos ya se descontaron al PRODUCIR
  // el subproducto — expandir recursivo acá los contaría dos veces.
  for (const arista of producto.receta) {
    sumar(
      claveDe(arista.childType === 'ingredient' ? 'INGREDIENT' : 'SUBPRODUCT', arista.childId),
      cantidadBruta(arista),
    );
  }
  return out;
}

/** Cantidad real a descontar de una arista: la neta inflada por su merma. */
export function cantidadBruta(arista: AristaReceta): number {
  if (arista.mermaPct < 0 || arista.mermaPct >= 1) {
    throw new Error(`mermaPct fuera de rango: ${arista.mermaPct}`);
  }
  return arista.quantityNeta / (1 - arista.mermaPct);
}

/** Cuánto consume producir `cantidad` unidades de stock de un subproducto. */
export function consumoDeProduccion(
  sub: SubproductoSombra,
  cantidadProducida: number,
): Map<string, number> {
  const out = new Map<string, number>();
  // Producir N unidades corre la receta N/yield veces.
  const corridas = cantidadProducida / sub.yield;
  for (const arista of sub.receta) {
    const clave = claveDe(
      arista.childType === 'ingredient' ? 'INGREDIENT' : 'SUBPRODUCT',
      arista.childId,
    );
    out.set(clave, (out.get(clave) ?? 0) + cantidadBruta(arista) * corridas);
  }
  return out;
}
