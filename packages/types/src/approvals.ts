import { z } from 'zod';

/**
 * PIN de aprobación de Admin Operativo / Dueño. 6 dígitos numéricos.
 * Se envía como header HTTP por requests del cajero que requieren
 * aprobación inline (void de venta, descuento >15%, abrir cajón sin
 * venta).
 *
 * El backend nunca lo retorna en wire (solo se setea con SetApprovalPin
 * y se valida con header).
 */
export const APPROVAL_PIN_HEADER = 'x-approval-pin';

const PinDigitsSchema = z.string().regex(/^\d{6}$/, 'PIN debe ser exactamente 6 dígitos');

/**
 * Setear/cambiar PIN para el user autenticado (debe ser Admin/Dueño).
 * En FASE 5: solo se permite via seed o un endpoint dueño-only.
 * UI completa para configurar PIN llega en FASE 11.
 */
export const SetApprovalPinSchema = z.object({
  pin: PinDigitsSchema,
  /** Contraseña de la cuenta: evita que una sesión abierta cambie el PIN sin más. */
  password: z.string().min(1, 'Ingresá tu contraseña'),
});
export type SetApprovalPin = z.infer<typeof SetApprovalPinSchema>;

/**
 * Threshold por encima del cual un descuento aplicado por cajero
 * requiere aprobación. Si discount/total > 0.15 → exigir X-Approval-Pin.
 * (architecture.md §7.3, pos-spec.v1.md:58)
 */
export const APPROVAL_DISCOUNT_THRESHOLD = 0.15;
