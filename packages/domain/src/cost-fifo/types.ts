/**
 * Tipos del motor de costeo FIFO. Puro, sin IO: el llamador carga los
 * movimientos de UN insumo (o producto stockable) y el motor reproduce el
 * ledger para asignar el costo real (COGS) a cada consumo.
 */

export type FifoMovementType =
  | 'PURCHASE'
  | 'SALE'
  | 'WASTE'
  | 'MANUAL_ADJUSTMENT'
  | 'INITIAL'
  /** Tanda de producción interna. delta>0 = entry de subproducto (lot cost
   *  calculado por el llamador a partir de las consumiones), delta<0 = consumo
   *  de insumos o sub-subproductos. NO se atribuye a una venta. */
  | 'PRODUCTION';

/** Un movimiento del ledger de UN stockable, tal como lo necesita el motor. */
export interface FifoMovement {
  id: string;
  /** Para ordenar cronológicamente. */
  createdAt: string | Date;
  /** + entrada (compra/inicial/ajuste+), − consumo (venta/merma/ajuste−). */
  delta: number;
  type: FifoMovementType;
  /** Costo por unidad de stock. Solo entradas; null = costo desconocido. */
  unitCost: number | null;
  /** Origen (sale id, invoice id…). Necesario para emparejar reversiones. */
  sourceId: string | null;
}

/** Resultado del costeo de UN consumo (venta/merma/ajuste−) o su reversión. */
export interface FifoConsumption {
  movementId: string;
  createdAt: string;
  type: FifoMovementType;
  sourceId: string | null;
  /** Cantidad consumida (positiva). Para una reversión, la cantidad devuelta. */
  qty: number;
  /** Costo FIFO real de la porción con costo conocido. Negativo si es reversión. */
  cost: number;
  /** Cantidad sin costo conocido (lotes sin costo o stock negativo). */
  unknownQty: number;
}

/** Un lote (capa de costo) que aún queda en bodega. */
export interface FifoLot {
  movementId: string;
  qty: number;
  unitCost: number | null;
  createdAt: string;
}

export interface FifoResult {
  consumptions: FifoConsumption[];
  remainingLots: FifoLot[];
  /** Valor de los lotes restantes con costo conocido (Σ qty × unitCost). */
  remainingValue: number;
  /** Unidades en bodega sin costo conocido. */
  remainingUnknownQty: number;
}
