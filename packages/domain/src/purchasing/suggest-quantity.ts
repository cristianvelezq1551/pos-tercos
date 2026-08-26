/**
 * Cuánto hay que comprar para volver a tener el mínimo.
 *
 * Regla del dueño (2026-08-25): la sugerencia cubre EXACTAMENTE el faltante
 * contra el mínimo — antes apuntaba a 2× el mínimo y proponía el doble de lo
 * necesario (con 21 panes de 30 pedía 4 paquetes en vez de 1).
 *
 * El faltante se mide en unidad de STOCK (gramos, unidades) porque es la
 * unidad en la que se lleva el inventario; la compra se hace en unidad de
 * COMPRA (kg, paquete), que casi nunca es la misma. De ahí que el número
 * final se redondee HACIA ARRIBA: no se compran medios paquetes, y quedarse
 * corto dejaría el insumo por debajo del mínimo apenas llegue el pedido.
 *
 * Vive acá —y no en el service— porque la pantalla necesita explicar el mismo
 * cálculo que hizo el servidor. Una regla de este tipo copiada en los dos
 * lados se separa siempre.
 */
export interface SuggestPurchaseInput {
  /** Existencias actuales en unidad de stock. Puede ser NEGATIVO (deuda). */
  currentStock: number;
  /** Mínimo de alerta en unidad de stock. */
  thresholdMin: number;
  /** Cuántas unidades de stock trae una unidad de compra (1 kg = 1000 g). */
  conversionFactor: number | null;
}

export interface SuggestedPurchase {
  /** Lo que falta para tocar el mínimo, en unidad de stock. Nunca negativo. */
  deficitStock: number;
  /** Cantidad a comprar, en unidad de compra. Entero ≥ 1. */
  suggestedQty: number;
  /** Lo que esa compra agrega, en unidad de stock (qty × factor). */
  coverageStock: number;
  /** Existencias que quedan tras la compra. Siempre ≥ mínimo. */
  resultingStock: number;
  /** Lo que sobra por encima del mínimo por comprar unidades enteras. */
  surplusStock: number;
}

/** Factor sano: 0, negativo o nulo se tratan como 1 (compra = stock). */
export function normalizeConversionFactor(factor: number | null): number {
  return factor && factor > 0 ? factor : 1;
}

export function computeSuggestedPurchase(
  input: SuggestPurchaseInput,
): SuggestedPurchase {
  const factor = normalizeConversionFactor(input.conversionFactor);
  const deficitStock = Math.max(input.thresholdMin - input.currentStock, 0);

  // Mínimo 1: si se está pidiendo una sugerencia es porque hay faltante, y una
  // compra de 0 no es una sugerencia.
  const suggestedQty = Math.max(Math.ceil(deficitStock / factor), 1);
  const coverageStock = suggestedQty * factor;
  const resultingStock = input.currentStock + coverageStock;

  return {
    deficitStock,
    suggestedQty,
    coverageStock,
    resultingStock,
    surplusStock: Math.max(resultingStock - input.thresholdMin, 0),
  };
}
