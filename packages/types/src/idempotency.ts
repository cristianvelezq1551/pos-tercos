import { z } from 'zod';

/**
 * Header HTTP usado por POSTs idempotentes (POST /sales, POST /shifts/open,
 * etc.). El backend cachea response en `idempotency_keys` con TTL 7 días.
 *
 * Convención: UUID v4 generado en cliente. El backend valida formato pero
 * no exige uuid v4 — cualquier string opaco UNIQUE sirve.
 */
export const IDEMPOTENCY_HEADER = 'idempotency-key';

export const IdempotencyKeySchema = z.string().min(8).max(128);
export type IdempotencyKey = z.infer<typeof IdempotencyKeySchema>;
