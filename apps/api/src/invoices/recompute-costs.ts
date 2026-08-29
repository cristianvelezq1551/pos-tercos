import type { PrismaService } from '../prisma/prisma.service';

/**
 * Recalcula los costos DENORMALIZADOS que dejó escritos una factura anulada.
 *
 * Son dos: el "último costo" del insumo o producto (`lastUnitCost`, que
 * alimenta márgenes, sugerencias de compra y la estimación de faltantes) y el
 * último precio que cobró ese proveedor (`supplierProduct`). Ninguno de los dos
 * se puede simplemente borrar: hay que volver a mirarlos contra las facturas
 * que SIGUEN vivas.
 *
 * Por qué no basta con dejarlos como están: la factura anulada pudo ser la
 * última, y su precio quedaría gobernando el costo del producto para siempre.
 * Y por qué no se recalcula dentro de la transacción: si esto falla, el
 * inventario y el P&G ya quedaron correctos — lo único desactualizado sería un
 * precio de referencia, que la próxima compra corrige.
 */
export async function recomputeCostsAfterVoid(
  prisma: PrismaService,
  movimientos: ReadonlyArray<{
    entityType: string;
    ingredientId: string | null;
    productId: string | null;
  }>,
): Promise<void> {
  const insumos = new Set<string>();
  const productos = new Set<string>();
  for (const m of movimientos) {
    if (m.entityType === 'INGREDIENT' && m.ingredientId) insumos.add(m.ingredientId);
    if (m.entityType === 'PRODUCT' && m.productId) productos.add(m.productId);
  }

  for (const id of insumos) await recomputeIngrediente(prisma, id);
  for (const id of productos) await recomputeProducto(prisma, id);
}

/**
 * Último costo por unidad de COMPRA a partir de la última compra viva.
 *
 * Se deriva del movimiento y no de la línea de la factura: el movimiento ya
 * guarda el costo por unidad de INVENTARIO (que es donde la conversión real de
 * esa compra quedó aplicada), así que basta multiplicarlo por el factor del
 * insumo. Recalcularlo desde la línea obligaría a re-adivinar esa conversión.
 */
async function recomputeIngrediente(prisma: PrismaService, ingredientId: string): Promise<void> {
  const ing = await prisma.ingredient.findUnique({
    where: { id: ingredientId },
    select: { conversionFactor: true },
  });
  if (!ing) return;
  const ultima = await ultimaCompraViva(prisma, { entityType: 'INGREDIENT', ingredientId });
  await prisma.ingredient.update({
    where: { id: ingredientId },
    data:
      ultima === null
        ? { lastUnitCost: null, lastUnitCostDate: null }
        : {
            lastUnitCost: ultima.unitCost * Number(ing.conversionFactor),
            lastUnitCostDate: ultima.createdAt,
          },
  });
  await recomputeSupplierProduct(prisma, { ingredientId });
}

async function recomputeProducto(prisma: PrismaService, productId: string): Promise<void> {
  const prod = await prisma.product.findUnique({
    where: { id: productId },
    select: { conversionFactor: true },
  });
  if (!prod) return;
  const factor = prod.conversionFactor !== null ? Number(prod.conversionFactor) : 1;
  const ultima = await ultimaCompraViva(prisma, { entityType: 'PRODUCT', productId });
  await prisma.product.update({
    where: { id: productId },
    data:
      ultima === null
        ? { lastUnitCost: null, lastUnitCostDate: null }
        : { lastUnitCost: ultima.unitCost * factor, lastUnitCostDate: ultima.createdAt },
  });
  await recomputeSupplierProduct(prisma, { productId });
}

/**
 * La compra más reciente que sigue contando: el movimiento de una factura que
 * todavía está CONFIRMADA. Las de facturas anuladas se ignoran aunque sus
 * movimientos sigan en la tabla (es insert-only: nada se borra).
 */
async function ultimaCompraViva(
  prisma: PrismaService,
  filtro: { entityType: 'INGREDIENT' | 'PRODUCT'; ingredientId?: string; productId?: string },
): Promise<{ unitCost: number; createdAt: Date } | null> {
  const candidatos = await prisma.inventoryMovement.findMany({
    where: {
      entityType: filtro.entityType,
      ingredientId: filtro.ingredientId ?? undefined,
      productId: filtro.productId ?? undefined,
      sourceType: 'invoice',
      type: 'PURCHASE',
      unitCost: { not: null },
    },
    select: { unitCost: true, createdAt: true, sourceId: true },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
  if (candidatos.length === 0) return null;

  const facturasVivas = new Set(
    (
      await prisma.invoice.findMany({
        where: {
          id: { in: candidatos.map((c) => c.sourceId).filter((s): s is string => s !== null) },
          status: 'CONFIRMED',
        },
        select: { id: true },
      })
    ).map((i) => i.id),
  );
  const viva = candidatos.find((c) => c.sourceId !== null && facturasVivas.has(c.sourceId));
  return viva ? { unitCost: Number(viva.unitCost), createdAt: viva.createdAt } : null;
}

/**
 * Último precio que cobró cada proveedor por ese ítem, recalculado contra las
 * facturas vivas. Si ya no queda ninguna, la fila se borra: la creó esta compra
 * y dejarla afirmaría un precio de una factura que ya no existe.
 */
async function recomputeSupplierProduct(
  prisma: PrismaService,
  filtro: { ingredientId?: string; productId?: string },
): Promise<void> {
  const filas = await prisma.supplierProduct.findMany({
    where: { ingredientId: filtro.ingredientId, productId: filtro.productId },
    select: { supplierId: true, ingredientId: true, productId: true },
  });

  for (const fila of filas) {
    const item = await prisma.invoiceItem.findFirst({
      where: {
        ingredientId: filtro.ingredientId,
        productId: filtro.productId,
        invoice: { status: 'CONFIRMED', supplierId: fila.supplierId },
      },
      select: { unitPrice: true, invoice: { select: { confirmedAt: true } } },
      orderBy: { invoice: { confirmedAt: 'desc' } },
    });

    if (!item) {
      await prisma.supplierProduct.deleteMany({
        where: {
          supplierId: fila.supplierId,
          ingredientId: fila.ingredientId,
          productId: fila.productId,
        },
      });
      continue;
    }
    await prisma.supplierProduct.updateMany({
      where: {
        supplierId: fila.supplierId,
        ingredientId: fila.ingredientId,
        productId: fila.productId,
      },
      data: {
        lastUnitPrice: item.unitPrice,
        lastPurchaseDate: item.invoice.confirmedAt ?? new Date(),
      },
    });
  }
}
