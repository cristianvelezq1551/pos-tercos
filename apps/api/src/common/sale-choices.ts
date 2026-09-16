import type { Prisma } from '@prisma/client';
import { AppliedChoiceSchema } from '@pos-tercos/types';

/**
 * Lo elegido en los grupos de un combo, leído de una línea ya persistida
 * (`sale_items.choices_json` / `cortesia_requests.choices_json`).
 *
 * Fuente ÚNICA de lectura para todo lo que necesita saber qué salió de verdad:
 * los tres caminos que descuentan stock (cobro, edición, sincronización
 * offline) y el costeo por producto. Si cada uno lo leyera a su manera, uno
 * terminaría descontando o costeando distinto que los otros.
 *
 * Una línea vieja trae `[]` y se comporta como siempre.
 */
export function choicesDeLinea(
  raw: Prisma.JsonValue,
): Array<{ productId: string; quantity: number }> {
  const parsed = AppliedChoiceSchema.array().safeParse(raw);
  return parsed.success
    ? parsed.data.map((c) => ({ productId: c.productId, quantity: c.quantity }))
    : [];
}
