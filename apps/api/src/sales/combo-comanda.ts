import type { Prisma } from '@prisma/client';

/**
 * Las líneas de COMPONENTES de cada combo para la comanda de cocina
 * ("2x Papas TERCOS Pollo y Miel ahumada"), por id de combo. Cantidad POR combo
 * (la línea del combo ya dice cuántos van), igual que lo elegido de un grupo.
 *
 * Única fuente para los tres papeles de cocina —la comanda normal (y su
 * anulación y reimpresión), las adiciones de una cuenta abierta y la de una
 * cortesía—: si cada uno armara la línea a mano, terminarían diciendo cosas
 * distintas. Se lee la composición VIGENTE del combo, como el consumo.
 *
 * El formato es ASCII, igual que el renglón de un plato suelto con variante:
 * la comanda no fija el juego de caracteres de la impresora.
 */
export async function comboComponentLines(
  db: Pick<Prisma.TransactionClient, 'comboComponent'>,
  productIds: readonly string[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (productIds.length === 0) return out;
  const rows = await db.comboComponent.findMany({
    where: { comboId: { in: [...new Set(productIds)] } },
    select: {
      comboId: true,
      quantity: true,
      product: { select: { name: true } },
      size: { select: { name: true } },
    },
    // Orden estable: sin él, dos impresiones del mismo pedido podrían listar
    // los componentes distinto y la cocina creería que cambió.
    orderBy: [{ product: { name: 'asc' } }, { id: 'asc' }],
  });
  for (const r of rows) {
    const linea = `${r.quantity}x ${r.product.name}${r.size ? ` ${r.size.name}` : ''}`;
    out.set(r.comboId, [...(out.get(r.comboId) ?? []), linea]);
  }
  return out;
}
