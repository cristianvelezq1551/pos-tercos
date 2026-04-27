/**
 * Tipos del motor de promociones. Funciones puras: el llamador carga las
 * promociones aplicables desde DB y las pasa a `applyPromotion`.
 */

/**
 * Promoción candidata. El llamador debe haber pre-cargado los productIds
 * en un Set para que el match sea O(1).
 *
 * `daysOfWeekMask` bitmask: lunes=1, martes=2, miércoles=4, jueves=8,
 * viernes=16, sábado=32, domingo=64. 127 = todos los días.
 *
 * `timeStart` / `timeEnd` formato `HH:MM:SS` 24h. Si `timeStart > timeEnd`,
 * la ventana cruza medianoche (ej. start=22:00, end=02:00 cubre 22:00-02:00).
 *
 * `activeFrom` / `activeTo` son fechas (sin hora). Si están seteadas, la
 * promo aplica solo en ese rango cerrado de fechas.
 */
export interface PromotionDef {
  id: string;
  /** [0, 1). Ej. 0.20 = 20% off. */
  discountPct: number;
  daysOfWeekMask: number;
  timeStart: string;
  timeEnd: string;
  activeFrom: Date | null;
  activeTo: Date | null;
  /** Productos a los que aplica. Set para lookup O(1). */
  productIds: Set<string>;
}

export interface ApplyPromotionInput {
  productId: string;
  /** Subtotal de la línea (con tamaño + modifiers ya sumados, sin discount). */
  lineSubtotal: number;
  /** Momento de la venta (UTC ok, internamente extraemos día/hora). */
  at: Date;
}

export interface ApplyPromotionOutput {
  appliedPromotionId: string | null;
  /** Monto absoluto de descuento (no fracción), redondeado a 2 decimales. */
  lineDiscount: number;
}

/** Bits del bitmask de día de la semana. Domingo = bit 6 (= 64). */
export const DAY_BIT = {
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 4,
  THURSDAY: 8,
  FRIDAY: 16,
  SATURDAY: 32,
  SUNDAY: 64,
} as const;
