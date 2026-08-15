import { z } from 'zod';

// ====================================================================
// COGS / margen real (costeo FIFO). Precios de venta fijos → el foco es
// cuánto costó realmente lo vendido y cuánto se ganó.
// ====================================================================

/** P&L del período: ventas − costo real − merma valorizada. */
export const PnlReportSchema = z.object({
  periodFrom: z.string(),
  periodTo: z.string(),
  /**
   * Ingresos del NEGOCIO: comida vendida, ya neta de descuentos y SIN el cobro
   * de domicilios (esa plata es del repartidor — ver `deliveryCollected`).
   */
  revenue: z.number(),
  /**
   * Descuentos otorgados en el período (promos + descuento manual de línea y de
   * total). YA están restados de `revenue` — se reportan aparte porque son
   * plata que el negocio decidió no cobrar: sin esta línea el dueño no puede
   * ver cuánto regaló ni distinguir "vendí menos" de "descontué más".
   */
  discountTotal: z.number(),
  /** `revenue + discountTotal`: lo que habría entrado sin descuentos. */
  grossRevenue: z.number(),
  /** Costo real (FIFO) de lo vendido en el período. */
  cogs: z.number(),
  grossMargin: z.number(),
  grossMarginPct: z.number().nullable(),
  /** Merma valorizada (al costo real del lote consumido) en el período. */
  wasteCost: z.number(),
  /** Cortesías valorizadas a FIFO (producto regalado) en el período. */
  cortesiaCost: z.number(),
  /**
   * Costo FIFO de los pedidos REEMBOLSADOS en el período (VOID con stock NO
   * revertido: la comida ya se preparó). Pérdida real que el void normal no
   * tiene. Se reporta aparte para que el neto la reste explícitamente.
   */
  refundCost: z.number(),
  /**
   * Domicilios cobrados al cliente en el período. NO está dentro de `revenue`:
   * es plata de un TERCERO (el domiciliario) que solo pasa por la caja
   * (decisión del dueño 2026-07-27). Se reporta para poder arquearla y para que
   * el dueño sepa cuánto tiene que pagarle al repartidor.
   *
   * Antes se sumaba a los ingresos y, como no consume inventario, subía el
   * margen bruto con plata que no se quedaba en el negocio.
   */
  deliveryCollected: z.number(),
  /** Cuántos pedidos a domicilio cobraron envío en el período. */
  deliveryOrderCount: z.number().int().nonnegative(),
  salesCount: z.number().int().nonnegative(),
  /** Unidades de insumo consumidas sin costo conocido (termómetro de datos). */
  cogsUnknownQty: z.number(),
  /** Unidades costeadas con ESTIMADO (venta forzada sin stock, sin factura que
   *  confirme el precio real). El COGS de esas unidades NO es exacto todavía; se
   *  corrige al subir la factura. >0 ⇒ mostrar "COGS parcialmente estimado". */
  cogsEstimatedQty: z.number(),
  /** Parte de `wasteCost` valuada con el último precio conocido y no con un lote
   *  real (se tiró insumo que no estaba cargado). Se corrige al subir la factura. */
  wasteEstimatedCost: z.number(),
  /** Ídem para `cortesiaCost`. */
  cortesiaEstimatedCost: z.number(),
});
export type PnlReport = z.infer<typeof PnlReportSchema>;

/** Margen real por producto en el período. */
export const ProductMarginSchema = z.object({
  productId: z.string().uuid(),
  productName: z.string(),
  unitsSold: z.number(),
  revenue: z.number(),
  cogs: z.number(),
  margin: z.number(),
  marginPct: z.number().nullable(),
  /** True si parte del costo de este producto no se pudo determinar. */
  cogsPartial: z.boolean(),
});
export type ProductMargin = z.infer<typeof ProductMarginSchema>;

export const ProductMarginReportSchema = z.object({
  periodFrom: z.string(),
  periodTo: z.string(),
  products: z.array(ProductMarginSchema),
  totals: z.object({
    revenue: z.number(),
    cogs: z.number(),
    margin: z.number(),
    marginPct: z.number().nullable(),
  }),
});
export type ProductMarginReport = z.infer<typeof ProductMarginReportSchema>;

/** Valor del inventario a costo real (lotes FIFO restantes). */
export const InventoryValuationItemSchema = z.object({
  entityType: z.enum(['INGREDIENT', 'PRODUCT', 'SUBPRODUCT']),
  id: z.string().uuid(),
  name: z.string(),
  qty: z.number(),
  value: z.number(),
  /** Unidades en bodega sin costo conocido (no entran en `value`). */
  unknownQty: z.number(),
});
export type InventoryValuationItem = z.infer<typeof InventoryValuationItemSchema>;

export const InventoryValuationReportSchema = z.object({
  asOf: z.string(),
  items: z.array(InventoryValuationItemSchema),
  totalValue: z.number(),
  totalUnknownQty: z.number(),
});
export type InventoryValuationReport = z.infer<typeof InventoryValuationReportSchema>;
