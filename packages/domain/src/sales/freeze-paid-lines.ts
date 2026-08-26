/**
 * Congelar el precio de lo YA COBRADO al editar un pedido (decisión 2026-08-25).
 *
 * Editar una venta cobrada re-cotizaba TODAS sus líneas con el catálogo y las
 * promociones de HOY: agregarle una gaseosa a las 20:05 le quitaba a la
 * hamburguesa la promo con la que se cobró a las 19:58, y el pago registrado
 * subía sin que nadie cobrara esa diferencia. Lo ya cobrado no se re-precia.
 *
 * Vive en domain porque la regla la aplican DOS lados: el server (que persiste
 * el total autoritativo) y el modal de edición del cajero (que muestra el total
 * estimado). Si se separan, el cajero ve un número y el sistema guarda otro.
 */

/** Línea ya cobrada, tal como quedó registrada en la venta. */
export interface PaidLineSnapshot {
  /** Identidad de línea: producto + tamaño + modificadores (sin notas). */
  key: string;
  quantity: number;
  unitPrice: number;
  lineDiscount: number;
}

/** Precio congelado que le corresponde a una línea de la edición. */
export interface FrozenLinePricing {
  unitPrice: number;
  lineSubtotal: number;
  /** Descuento POR UNIDAD del cobro, escalado a la cantidad nueva. */
  lineDiscount: number;
}

/**
 * Empareja cada línea nueva con una línea ya cobrada de la MISMA identidad y
 * devuelve el precio congelado que le toca (o `null` si es una línea nueva de
 * verdad, que sí va a precio y promos de hoy).
 *
 * El emparejamiento consume: dos líneas nuevas con la misma identidad toman
 * dos cobradas distintas, y la tercera queda sin congelar.
 *
 * El descuento se escala POR UNIDAD: bajar de 4 a 2 unidades conserva la mitad
 * del descuento. Es predecible para el cajero y nunca supera el subtotal.
 *
 * @param round redondeo del proyecto (`roundMoney`) — se inyecta para no atar
 *              este módulo a una implementación de dinero.
 */
export function freezePaidLines<T extends { key: string; quantity: number }>(
  paidLines: readonly PaidLineSnapshot[],
  newLines: readonly T[],
  round: (n: number) => number,
): Array<FrozenLinePricing | null> {
  const buckets = new Map<string, PaidLineSnapshot[]>();
  for (const p of paidLines) {
    const list = buckets.get(p.key) ?? [];
    list.push(p);
    buckets.set(p.key, list);
  }
  return newLines.map((line) => {
    const paid = buckets.get(line.key)?.shift();
    if (!paid) return null;
    const lineSubtotal = round(paid.unitPrice * line.quantity);
    const perUnit = paid.quantity > 0 ? paid.lineDiscount / paid.quantity : 0;
    const lineDiscount = Math.min(round(perUnit * line.quantity), lineSubtotal);
    return { unitPrice: paid.unitPrice, lineSubtotal, lineDiscount };
  });
}

/** Identidad de línea compartida por server y cliente (las notas NO cuentan:
 *  corregir un "sin cebolla" no debe re-preciar la línea). */
export function paidLineKey(
  productId: string,
  sizeId: string | null | undefined,
  modifierIds: readonly string[],
): string {
  return [productId, sizeId ?? '', [...modifierIds].sort().join(',')].join('|');
}
