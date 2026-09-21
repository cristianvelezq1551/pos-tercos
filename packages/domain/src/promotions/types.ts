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
 * - `FIXED_PRICE` — el producto se vende a `fixedPrice` mientras dura la promo.
 *   El descuento por unidad es `precio del producto con su tamaño − fixedPrice`;
 *   los extras y los recargos se cobran ENCIMA (decisión del dueño, 2026-09-21:
 *   "es el precio fijo pero para el sánduche"). Si el producto ya es más barato
 *   que el precio fijo, no aplica: una promo nunca sube el precio.
 */
export type PromotionTypeKind = 'PERCENT_OFF' | 'BOGO' | 'FIXED_OFF' | 'COMBO_OFF' | 'FIXED_PRICE';

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
  /** FIXED_PRICE: precio de venta del producto con su tamaño. */
  fixedPrice?: number;
  daysOfWeekMask: number;
  timeStart: string;
  timeEnd: string;
  /** Día calendario `YYYY-MM-DD` inclusive (o null = sin límite inferior). */
  activeFrom: string | null;
  /** Día calendario `YYYY-MM-DD` inclusive (o null = sin límite superior). */
  activeTo: string | null;
  /** Productos a los que aplica. Set para lookup O(1). */
  productIds: Set<string>;
  /**
   * Variantes a las que se limita, por producto. Un producto que no está acá
   * aplica a todas sus variantes. Con un producto acá, la línea tiene que traer
   * `sizeId` y estar en el set: sin tamaño elegido (la tarjeta del catálogo)
   * la promo NO se muestra — no se promete un descuento que la otra variante
   * no tiene.
   */
  sizeIdsByProduct?: Map<string, Set<string>>;
}

/**
 * Subconjunto de la promoción que define CUÁNDO aplica. Lo comparten el motor
 * de cobro y las pantallas que anuncian el estado de una promo, para que no
 * puedan responder distinto a la misma pregunta.
 */
export type PromotionSchedule = Pick<
  PromotionDef,
  'daysOfWeekMask' | 'timeStart' | 'timeEnd' | 'activeFrom' | 'activeTo'
>;

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
  /** Tamaño elegido en la línea. Decide las promos limitadas por variante. */
  sizeId?: string | null;
  /**
   * Precio de UNA unidad del producto con su tamaño, SIN extras ni recargos.
   * Es la base del precio fijo (los extras van encima). Si falta, se toma
   * `lineSubtotal / quantity` — que incluye los extras, o sea descuenta de MÁS:
   * los tres llamadores (servidor, caja, web) lo pasan siempre.
   */
  unitBasePrice?: number;
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
