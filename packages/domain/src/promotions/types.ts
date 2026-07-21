/**
 * Tipos del motor de promociones. Funciones puras: el llamador carga las
 * promociones aplicables desde DB y las pasa a `applyPromotion`.
 */

/**
 * Tipo de promoción. Cada uno tiene reglas distintas:
 *
 * - `PERCENT_OFF` — descuento porcentual (`discountPct`) sobre la línea.
 *   Ej. 20% off Hamburguesa Nashville.
 * - `FIXED_OFF` — descuento absoluto (`discountFixed` en COP) sobre la línea.
 *   Ej. $2.000 off Pollo Apanado. Cap al `lineSubtotal` (no descuenta más
 *   de lo que vale).
 * - `BOGO` — buy X, get Y free. `bogoBuyQty` ítems a precio normal +
 *   `bogoGetQty` ítems gratis por cada "set" completo de
 *   (`bogoBuyQty + bogoGetQty`) unidades. Ej. compra 2 Coca-Colas, llevá
 *   1 gratis.
 * - `COMBO_OFF` — descuento porcentual (`discountPct`) o absoluto
 *   (`discountFixed`) que aplica SOLO si el producto de la línea es un
 *   combo (`isCombo=true`). Tipo discriminado: el motor recibe un flag
 *   en `ApplyPromotionInput.isCombo` para filtrar.
 */
export type PromotionTypeKind = 'PERCENT_OFF' | 'BOGO' | 'FIXED_OFF' | 'COMBO_OFF';

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
 * `activeFrom` / `activeTo` son días calendario en formato `YYYY-MM-DD` (sin
 * hora ni zona). Si están seteados, la promo aplica solo en ese rango cerrado.
 * Se usa string —no Date— a propósito: una Date de "medianoche" es ambigua
 * (UTC vs local) y el backend (@db.Date UTC) y el frontend (local) la
 * construían distinto → la promo moría un día antes/después según la zona.
 * El día calendario en string es inequívoco y se compara lexicográficamente.
 *
 * Campos por tipo (FASE 12):
 *  - PERCENT_OFF: `discountPct` requerido.
 *  - FIXED_OFF: `discountFixed` requerido.
 *  - BOGO: `bogoBuyQty` + `bogoGetQty` requeridos.
 *  - COMBO_OFF: `discountPct` o `discountFixed` (al menos uno).
 *
 * El llamador es responsable de garantizar que los campos requeridos
 * estén presentes según el `type`. El motor rechaza con
 * `lineDiscount=0` si faltan datos.
 */
export interface PromotionDef {
  id: string;
  type: PromotionTypeKind;
  /** [0, 1). Ej. 0.20 = 20% off. Required en PERCENT_OFF; opcional en COMBO_OFF. */
  discountPct?: number;
  /** Monto absoluto en COP. Required en FIXED_OFF; opcional en COMBO_OFF. */
  discountFixed?: number;
  /** BOGO: cantidad de ítems que paga el cliente por cada "set". */
  bogoBuyQty?: number;
  /** BOGO: cantidad de ítems gratis por cada "set" (típico 1). */
  bogoGetQty?: number;
  daysOfWeekMask: number;
  timeStart: string;
  timeEnd: string;
  /** Día calendario `YYYY-MM-DD` inclusive (o null = sin límite inferior). */
  activeFrom: string | null;
  /** Día calendario `YYYY-MM-DD` inclusive (o null = sin límite superior). */
  activeTo: string | null;
  /** Productos a los que aplica. Set para lookup O(1). */
  productIds: Set<string>;
}

export interface ApplyPromotionInput {
  productId: string;
  /** Subtotal de la línea (con tamaño + modifiers ya sumados, sin discount). */
  lineSubtotal: number;
  /** Cantidad de ítems en la línea. Requerido para BOGO; ignorado en otros types. */
  quantity: number;
  /** Si el producto es combo (Product.isCombo). Filtra COMBO_OFF. */
  isCombo: boolean;
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
