import type { ProductCostSummary, ProductMarginReport } from '@pos-tercos/types';

/**
 * Diferencia relativa a partir de la cual vale la pena avisar. Por debajo es
 * ruido de redondeo; por encima es una señal real de que el margen se va a
 * mover cuando se acabe el lote viejo.
 */
export const UMBRAL_AVISO = 0.02;

export interface FilaDeMargen {
  producto: ProductMarginReport['products'][number];
  /** Costo al último precio de compra, por unidad. */
  refUnitario: number | null;
  /** El mismo costo llevado a las unidades vendidas, para comparar con el real. */
  refPeriodo: number | null;
  /** Costo FIFO por unidad de lo que efectivamente salió. */
  realUnitario: number | null;
  difiere: boolean;
}

/**
 * Cruza el costo REAL (FIFO, lo que costaron las unidades que salieron) con el
 * costo de REFERENCIA (lo que costaría hacerlas al último precio pagado).
 *
 * Los dos números son correctos y responden preguntas distintas, pero vivían en
 * pantallas separadas: verlos de memoria hacía parecer que uno estaba mal. El
 * de referencia viene POR UNIDAD y el real por el total vendido — llevarlos al
 * mismo plano es todo el trabajo de esta función.
 */
export function compararCostos(
  productos: ProductMarginReport['products'],
  costosParaPrecio: ProductCostSummary[],
): FilaDeMargen[] {
  const refPorProducto = new Map(costosParaPrecio.map((c) => [c.productId, c.totalCost]));

  return productos.map((producto) => {
    const refUnitario = refPorProducto.get(producto.productId) ?? null;
    const refPeriodo = refUnitario === null ? null : refUnitario * producto.unitsSold;
    const realUnitario = producto.unitsSold > 0 ? producto.cogs / producto.unitsSold : null;
    const difiere =
      refPeriodo !== null &&
      refPeriodo > 0 &&
      Math.abs(producto.cogs - refPeriodo) / refPeriodo > UMBRAL_AVISO;
    return { producto, refUnitario, refPeriodo, realUnitario, difiere };
  });
}
