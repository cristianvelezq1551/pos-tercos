import { z } from 'zod';

// ====================================================================
// Reporte de compras y fletes.
//
// Responde "¿cuánto compré y cuánto me cobraron por traerlo?" por semana o por
// mes, y por proveedor. Es el único lugar donde el flete se puede comparar
// contra lo comprado — el número con el que se negocia.
// ====================================================================

export const PurchaseGranularityEnum = z.enum(['weekly', 'monthly']);
export type PurchaseGranularity = z.infer<typeof PurchaseGranularityEnum>;

/** Cifras de compra de un corte cualquiera (período, proveedor o el total). */
export const PurchaseFiguresSchema = z.object({
  /** Mercancía: total facturado MENOS el flete. Es lo que entró al inventario. */
  purchased: z.number(),
  /** Domicilios/fletes cobrados por traerla. */
  freight: z.number(),
  /**
   * `freight / purchased`. null cuando no se compró nada (dividir por cero
   * daría Infinity y la pantalla mostraría "∞%").
   */
  freightPct: z.number().nullable(),
  invoiceCount: z.number().int().nonnegative(),
  /** Cuántas de esas facturas cobraron flete. */
  invoicesWithFreight: z.number().int().nonnegative(),
});
export type PurchaseFigures = z.infer<typeof PurchaseFiguresSchema>;

export const PurchasePeriodSchema = PurchaseFiguresSchema.extend({
  /** Clave estable y ordenable: `2026-W35` o `2026-08`. */
  key: z.string(),
  /** Para pantalla: `24–30 ago` o `agosto 2026`. */
  label: z.string(),
  periodFrom: z.string(),
  periodTo: z.string(),
});
export type PurchasePeriod = z.infer<typeof PurchasePeriodSchema>;

export const PurchaseSupplierSchema = PurchaseFiguresSchema.extend({
  /** null = facturas sin proveedor asociado (se agrupan en una fila). */
  supplierId: z.string().uuid().nullable(),
  supplierName: z.string(),
});
export type PurchaseSupplier = z.infer<typeof PurchaseSupplierSchema>;

export const PurchasesReportSchema = z.object({
  periodFrom: z.string(),
  periodTo: z.string(),
  granularity: PurchaseGranularityEnum,
  totals: PurchaseFiguresSchema,
  /** Serie cronológica. Incluye los períodos SIN compras: un hueco es dato. */
  periods: z.array(PurchasePeriodSchema),
  /** Ordenado por flete descendente: arriba queda con quién hay que hablar. */
  bySupplier: z.array(PurchaseSupplierSchema),
});
export type PurchasesReport = z.infer<typeof PurchasesReportSchema>;
