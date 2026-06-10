import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { expandRecipeOneLevel, roundCost } from '@pos-tercos/domain';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RecipesService } from '../recipes/recipes.service';

/**
 * Movimiento de stock a crear por una venta, sin saleId/userId (los inyecta
 * el caller). Producido por `computeConsumptionSpecs` — compartido entre
 * confirmPayment (online) y syncOffline.
 */
export interface ConsumptionSpec {
  entityType: 'PRODUCT' | 'INGREDIENT' | 'SUBPRODUCT';
  ingredientId?: string;
  productId?: string;
  subproductId?: string;
  delta: number;
  note: string;
}

/**
 * Consumo de stock al vender — la lógica es ÚNICA para el cobro online
 * (`SalesService.confirmPayment`) y la sincronización offline
 * (`SalesOfflineService.syncOffline`). Cualquier cambio acá afecta ambos.
 */
@Injectable()
export class SalesConsumptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly recipes: RecipesService,
  ) {}

  /**
   * Consumo de stock de una venta. Criterio:
   *  - reventa directa → descuenta el producto.
   *  - preparado → subproductos directos + insumos directos (un nivel; los
   *    insumos profundos se descontaron al producir el subproducto).
   *  - combo → componentes (no anidados, enforced al crear).
   * Devuelve SPECS sin saleId/userId: cada caller los inyecta al crear los
   * movements. `notePrefix` etiqueta el origen ("Sale abc123" / "Offline venta").
   */
  async computeConsumptionSpecs(
    lines: ReadonlyArray<{ productId: string; quantity: number; sizeId: string | null }>,
    notePrefix: string,
  ): Promise<ConsumptionSpec[]> {
    const specs: ConsumptionSpec[] = [];

    const productIds = Array.from(new Set(lines.map((l) => l.productId)));
    const saleProducts = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        name: true,
        directResale: true,
        isCombo: true,
        comboComponents: { select: { productId: true, quantity: true } },
      },
    });
    const saleProductMap = new Map(saleProducts.map((p) => [p.id, p]));

    // Productos que son componentes de los combos presentes — para conocer su
    // flag (reventa) y poder expandir su receta.
    const componentIds = new Set<string>();
    for (const p of saleProducts) {
      if (p.isCombo) for (const c of p.comboComponents) componentIds.add(c.productId);
    }
    const componentProducts = componentIds.size
      ? await this.prisma.product.findMany({
          where: { id: { in: [...componentIds] } },
          select: { id: true, name: true, directResale: true, isCombo: true },
        })
      : [];
    const componentMap = new Map(componentProducts.map((p) => [p.id, p]));

    const consume = async (
      p: { id: string; name: string; directResale: boolean },
      qty: number,
      sizeId?: string | null,
    ): Promise<void> => {
      if (p.directResale) {
        specs.push({
          entityType: 'PRODUCT',
          productId: p.id,
          delta: -qty,
          note: `${notePrefix} item ${p.name}`,
        });
        return;
      }
      const { graph, root } = await this.recipes.loadGraphForProduct(
        p.id,
        sizeId ?? undefined,
      );
      let expanded;
      try {
        expanded = expandRecipeOneLevel(graph, root, qty);
      } catch (err) {
        throw new BadRequestException({
          message: `Falla al expandir receta de "${p.name}"`,
          cause: err instanceof Error ? err.message : String(err),
        });
      }
      for (const ing of expanded.ingredients.values()) {
        specs.push({
          entityType: 'INGREDIENT',
          ingredientId: ing.ingredientId,
          delta: -ing.totalQuantity,
          note: `${notePrefix} via "${p.name}"`,
        });
      }
      for (const sub of expanded.subproducts.values()) {
        specs.push({
          entityType: 'SUBPRODUCT',
          subproductId: sub.subproductId,
          delta: -sub.totalQuantity,
          note: `${notePrefix} via "${p.name}"`,
        });
      }
    };

    for (const line of lines) {
      const product = saleProductMap.get(line.productId);
      if (!product) {
        throw new BadRequestException(`Producto ${line.productId} ya no existe.`);
      }
      if (product.isCombo) {
        for (const comp of product.comboComponents) {
          const cp = componentMap.get(comp.productId);
          if (!cp) {
            throw new BadRequestException(
              `Combo "${product.name}" referencia un producto inexistente (${comp.productId}).`,
            );
          }
          if (cp.isCombo) {
            throw new BadRequestException(
              `Combo anidado no soportado en "${product.name}".`,
            );
          }
          await consume(cp, line.quantity * comp.quantity);
        }
      } else {
        await consume(product, line.quantity, line.sizeId);
      }
    }

    return specs;
  }

  /**
   * Valida que el stock actual sea suficiente para crear los movements de
   * consumo (delta < 0) de una venta. Suma los deltas por entidad y compara
   * contra el stock agregado leído en una sola groupBy.
   *
   * Lanza `ConflictException` con el nombre del primer faltante. Para evitar
   * que se cree la venta y se descubra después: la idea es no permitir stock
   * negativo aunque el sold-out UI haya fallado en bloquearla.
   *
   * Esta es la red de seguridad transaccional. Si dos ventas concurrentes
   * dejan stock negativo (TOCTOU), una pasa y la otra falla — comportamiento
   * aceptable: la primera transa, la segunda recibe error y el cajero retira
   * el item. (Para race-free total habría que SERIALIZABLE el tx.)
   */
  async assertStockSufficient(
    tx: Prisma.TransactionClient,
    movements: Prisma.InventoryMovementCreateManyInput[],
  ): Promise<void> {
    // Agrupar por entidad la cantidad TOTAL que se va a consumir.
    type Key = string;
    const needs = new Map<Key, { type: 'INGREDIENT' | 'PRODUCT' | 'SUBPRODUCT'; id: string; qty: number; note: string }>();
    for (const m of movements) {
      const delta = Number(m.delta);
      if (delta >= 0) continue;
      const t = m.entityType;
      const id =
        t === 'INGREDIENT' ? m.ingredientId
        : t === 'PRODUCT' ? m.productId
        : t === 'SUBPRODUCT' ? m.subproductId
        : null;
      if (!t || !id || typeof id !== 'string') continue;
      const k = `${t}:${id}`;
      const prev = needs.get(k);
      needs.set(k, {
        type: t as 'INGREDIENT' | 'PRODUCT' | 'SUBPRODUCT',
        id,
        qty: (prev?.qty ?? 0) + Math.abs(delta),
        note: typeof m.notes === 'string' ? m.notes : '',
      });
    }
    if (needs.size === 0) return;

    const ingredientIds: string[] = [];
    const productIds: string[] = [];
    const subproductIds: string[] = [];
    for (const n of needs.values()) {
      if (n.type === 'INGREDIENT') ingredientIds.push(n.id);
      else if (n.type === 'PRODUCT') productIds.push(n.id);
      else subproductIds.push(n.id);
    }
    const where: Prisma.InventoryMovementWhereInput[] = [];
    if (ingredientIds.length) where.push({ entityType: 'INGREDIENT', ingredientId: { in: ingredientIds } });
    if (productIds.length) where.push({ entityType: 'PRODUCT', productId: { in: productIds } });
    if (subproductIds.length) where.push({ entityType: 'SUBPRODUCT', subproductId: { in: subproductIds } });

    const rows = await tx.inventoryMovement.groupBy({
      by: ['entityType', 'ingredientId', 'productId', 'subproductId'],
      where: { OR: where },
      _sum: { delta: true },
    });
    const stock = new Map<Key, number>();
    for (const r of rows) {
      const id =
        r.entityType === 'INGREDIENT' ? r.ingredientId
        : r.entityType === 'PRODUCT' ? r.productId
        : r.subproductId;
      if (!id) continue;
      const k = `${r.entityType}:${id}`;
      stock.set(k, (stock.get(k) ?? 0) + Number(r._sum.delta ?? 0));
    }

    // Para nombres legibles cuando hay shortage, miramos en lookups baratos.
    const shortageKeys: { key: Key; need: number; have: number }[] = [];
    for (const [k, n] of needs) {
      const have = stock.get(k) ?? 0;
      if (have < n.qty) {
        shortageKeys.push({ key: k, need: n.qty, have });
      }
    }
    if (shortageKeys.length === 0) return;

    // Resolver nombres en una sola pasada por entidad.
    const ingNeeded = shortageKeys.filter((s) => s.key.startsWith('INGREDIENT:')).map((s) => s.key.slice('INGREDIENT:'.length));
    const prodNeeded = shortageKeys.filter((s) => s.key.startsWith('PRODUCT:')).map((s) => s.key.slice('PRODUCT:'.length));
    const subNeeded = shortageKeys.filter((s) => s.key.startsWith('SUBPRODUCT:')).map((s) => s.key.slice('SUBPRODUCT:'.length));
    const [ings, prods, subs] = await Promise.all([
      ingNeeded.length
        ? tx.ingredient.findMany({ where: { id: { in: ingNeeded } }, select: { id: true, name: true } })
        : Promise.resolve([]),
      prodNeeded.length
        ? tx.product.findMany({ where: { id: { in: prodNeeded } }, select: { id: true, name: true } })
        : Promise.resolve([]),
      subNeeded.length
        ? tx.subproduct.findMany({ where: { id: { in: subNeeded } }, select: { id: true, name: true } })
        : Promise.resolve([]),
    ]);
    const nameOf = new Map<Key, string>();
    for (const x of ings) nameOf.set(`INGREDIENT:${x.id}`, x.name);
    for (const x of prods) nameOf.set(`PRODUCT:${x.id}`, x.name);
    for (const x of subs) nameOf.set(`SUBPRODUCT:${x.id}`, x.name);

    const lines = shortageKeys.map(
      (s) => `${nameOf.get(s.key) ?? s.key} (necesita ${roundCost(s.need)}, hay ${roundCost(s.have)})`,
    );
    throw new ConflictException(
      `Stock insuficiente para esta venta:\n· ${lines.join('\n· ')}`,
    );
  }
}
