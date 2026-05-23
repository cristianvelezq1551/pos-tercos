import { z } from 'zod';
import { SaleTypeEnum } from './sales';

// ====================================================================
// PUBLIC DISPLAY — pantalla pública del turnero (FASE 6.B + turnos v2)
// ====================================================================

export const PUBLIC_DISPLAY_NAMESPACE = '/public-display';

/**
 * Item visible en la cola del cajero. Subset SAFE de SaleItem + Product:
 * solo nombre, imagen y cantidad — para que el cajero identifique el pedido.
 */
export const PublicDisplayOrderItemSchema = z.object({
  productName: z.string().min(1).max(120),
  imageUrl: z.string().max(500).nullable(),
  quantity: z.number().int().positive(),
});
export type PublicDisplayOrderItem = z.infer<typeof PublicDisplayOrderItemSchema>;

/**
 * Estado de la pantalla pública: UN solo turno llamado. `callSeq` es
 * monotónico y sube en cada llamado (incluido re-llamar el mismo número) —
 * la pantalla re-flashea y suena la campana cuando cambia `callSeq`, no el
 * valor de `currentTurn` (así un re-llamado del mismo turno también avisa).
 */
export const PublicDisplayStateSchema = z.object({
  /** Turno actualmente llamado. null si todavía no se llamó ninguno / reset. */
  currentTurn: z.number().int().min(1).max(9999).nullable(),
  /** Contador monotónico de llamados. Dispara flash + campana en el front. */
  callSeq: z.number().int().nonnegative(),
  /** Server timestamp del snapshot. */
  asOf: z.string().datetime(),
});
export type PublicDisplayState = z.infer<typeof PublicDisplayStateSchema>;

/**
 * Una orden en la cola "listos por llamar" del cajero. Alimentada
 * automáticamente cuando la cocina marca LISTO_DESPACHO (COUNTER + WEB_PICKUP).
 */
export const ReadyToCallOrderSchema = z.object({
  saleId: z.string().uuid(),
  turnNumber: z.number().int().positive(),
  type: SaleTypeEnum,
  customerName: z.string().nullable(),
  /** ISO datetime en que la cocina lo marcó listo. Ordena la cola. */
  readyAt: z.string().datetime(),
  /** ISO datetime del último llamado a la pantalla. null = aún sin llamar. */
  calledAt: z.string().datetime().nullable(),
  items: z.array(PublicDisplayOrderItemSchema).max(4),
});
export type ReadyToCallOrder = z.infer<typeof ReadyToCallOrderSchema>;

export const ReadyToCallResponseSchema = z.object({
  orders: z.array(ReadyToCallOrderSchema),
  asOf: z.string().datetime(),
});
export type ReadyToCallResponse = z.infer<typeof ReadyToCallResponseSchema>;

/** Llamado manual de un número arbitrario (corrección de desfase). */
export const CallManualSchema = z.object({
  turn: z.number().int().min(1).max(9999),
});
export type CallManual = z.infer<typeof CallManualSchema>;

/** Respuesta de los endpoints de llamado/reset. */
export const TurnResponseSchema = z.object({
  currentTurn: z.number().int().min(1).max(9999).nullable(),
  callSeq: z.number().int().nonnegative(),
});
export type TurnResponse = z.infer<typeof TurnResponseSchema>;
