/**
 * El margen que dejan LOS PRODUCTOS, no el que dejó un mes flojo.
 *
 * El punto de equilibrio se calculaba dividiendo los costos fijos entre el
 * margen REALIZADO del mes en curso. La cuenta es correcta, pero con poco
 * volumen no significa nada: en un mes de $92.000 vendidos, un flete de
 * $34.000 se lleva 37 puntos de margen y el equilibrio saltó de $4,3 a $8,7
 * millones de una semana a otra. Un número que se mueve así no sirve para
 * decidir nada — y presentado al peso parece una meta firme cuando es ruido.
 *
 * Lo que sí es estable es la carta: cada producto tiene un precio y una receta,
 * así que se sabe cuánto deja cada uno (65 %, 60 %…) sin depender de cuánto se
 * vendió. Con eso el equilibrio responde la pregunta real del dueño: "con lo
 * que dejan mis productos, ¿cuánto tengo que vender para cubrir lo fijo?".
 *
 * Se pondera por la MEZCLA vendida cuando la hay: vender mucho de lo que menos
 * deja no es lo mismo que vender parejo, y el promedio simple lo escondería.
 * Sin ventas todavía, el promedio simple es la única respuesta honesta.
 *
 * Un producto sin costo conocido queda FUERA y se reporta. Meterlo con costo 0
 * lo haría ver como margen del 100 % y subiría el promedio de todos — el mismo
 * error de "lo que no sé vale cero" que se cerró en el costeo (§7.v32).
 *
 * Función pura, sin IO.
 */

export interface CatalogProductMargin {
  productId: string;
  name: string;
  /** Precio de venta al público. */
  price: number;
  /** Costo de la receta/compra. null = no se puede saber todavía. */
  cost: number | null;
  /** Unidades vendidas en el período; 0 si no se vendió (o no hay historia). */
  unitsSold: number;
}

export interface CatalogMarginResult {
  /** Margen promedio, 0..1. null si ningún producto tiene costo conocido. */
  marginPct: number | null;
  /** true = ponderado por lo que se vendió; false = promedio simple de la carta. */
  weightedBySales: boolean;
  /** Productos que entraron al promedio. */
  productsConsidered: number;
  /** Productos con precio pero sin costo conocido: quedaron fuera. */
  productsWithoutCost: number;
  /** El que menos deja, de los considerados. Para saber por dónde empezar. */
  worst: { name: string; marginPct: number } | null;
  /** El que más deja. */
  best: { name: string; marginPct: number } | null;
}

export function computeCatalogMargin(products: CatalogProductMargin[]): CatalogMarginResult {
  const vacío: CatalogMarginResult = {
    marginPct: null,
    weightedBySales: false,
    productsConsidered: 0,
    productsWithoutCost: 0,
    worst: null,
    best: null,
  };

  // Un precio en 0 no es un producto de la carta (o está sin configurar): no
  // tiene margen que promediar y dividir por él daría infinito.
  const conPrecio = products.filter((p) => p.price > 0);
  const usables = conPrecio.filter((p) => p.cost !== null);
  if (usables.length === 0) {
    return { ...vacío, productsWithoutCost: conPrecio.length };
  }

  const conMargen = usables.map((p) => ({
    name: p.name,
    unitsSold: Math.max(0, p.unitsSold),
    revenue: p.price * Math.max(0, p.unitsSold),
    marginPct: (p.price - (p.cost as number)) / p.price,
  }));

  const ingresoTotal = conMargen.reduce((sum, p) => sum + p.revenue, 0);
  const weightedBySales = ingresoTotal > 0;
  const marginPct = weightedBySales
    ? conMargen.reduce((sum, p) => sum + p.marginPct * p.revenue, 0) / ingresoTotal
    : conMargen.reduce((sum, p) => sum + p.marginPct, 0) / conMargen.length;

  const ordenados = [...conMargen].sort((a, b) => a.marginPct - b.marginPct);
  return {
    marginPct,
    weightedBySales,
    productsConsidered: conMargen.length,
    productsWithoutCost: conPrecio.length - usables.length,
    worst: { name: ordenados[0].name, marginPct: ordenados[0].marginPct },
    best: {
      name: ordenados[ordenados.length - 1].name,
      marginPct: ordenados[ordenados.length - 1].marginPct,
    },
  };
}

/**
 * Ventas necesarias para cubrir los costos fijos con el margen de la carta.
 * null si no hay margen que usar o si el margen no es positivo (ahí no hay
 * volumen que alcance: cada venta pierde plata).
 */
export function breakEvenFromCatalogMargin(
  totalFixed: number,
  marginPct: number | null,
): number | null {
  if (marginPct === null || marginPct <= 0) return null;
  return totalFixed / marginPct;
}
