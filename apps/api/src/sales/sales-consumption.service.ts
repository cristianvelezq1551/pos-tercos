import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { expandRecipeOneLevel, roundCost } from '@pos-tercos/domain';
import { ModifierRecipeDeltaSchema } from '@pos-tercos/types';
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
  /**
   * Producto (línea de la venta) que originó este consumo. Permite tolerar el
   * faltante de stock cuando ese producto está "forzado disponible".
   */
  originProductId: string;
  /**
   * Si este consumo frena la venta cuando no alcanza el stock. `false` =
   * consumible (servilletas): se descuenta y se costea, pero no bloquea.
   * La reventa directa siempre bloquea (su stock ES el producto vendido).
   */
  blocksAvailability: boolean;
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
   *  - modificadores aplicados → su `recipeDelta` (ej. "Doble carne" descuenta
   *    la porción extra). Se resuelve por la definición ACTUAL del modificador
   *    (mismo criterio que las recetas); si el modificador ya no existe, no
   *    consume (el snapshot de precio en sale_items queda intacto).
   * Devuelve SPECS sin saleId/userId: cada caller los inyecta al crear los
   * movements. `notePrefix` etiqueta el origen ("Sale abc123" / "Offline venta").
   */
  async computeConsumptionSpecs(
    lines: ReadonlyArray<{
      productId: string;
      quantity: number;
      sizeId: string | null;
      modifiers?: ReadonlyArray<{ modifierId: string }>;
    }>,
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

    // Defs actuales de los modificadores aplicados (para su consumo extra).
    const appliedModifierIds = Array.from(
      new Set(lines.flatMap((l) => (l.modifiers ?? []).map((m) => m.modifierId))),
    );
    const modifierDefs = appliedModifierIds.length
      ? await this.prisma.productModifier.findMany({
          where: { id: { in: appliedModifierIds } },
          select: { id: true, name: true, recipeDelta: true },
        })
      : [];
    const modifierMap = new Map(
      modifierDefs.map((m) => [
        m.id,
        { name: m.name, recipeDelta: ModifierRecipeDeltaSchema.catch([]).parse(m.recipeDelta) },
      ]),
    );

    const consumeModifiers = (
      line: { productId: string; quantity: number; modifiers?: ReadonlyArray<{ modifierId: string }> },
    ): void => {
      for (const applied of line.modifiers ?? []) {
        const def = modifierMap.get(applied.modifierId);
        if (!def) continue; // modificador borrado después de la venta — no consume
        for (const c of def.recipeDelta) {
          specs.push({
            entityType: c.childType === 'ingredient' ? 'INGREDIENT' : 'SUBPRODUCT',
            ...(c.childType === 'ingredient'
              ? { ingredientId: c.childId }
              : { subproductId: c.childId }),
            delta: -(c.quantity * line.quantity),
            note: `${notePrefix} extra "${def.name}"`,
            originProductId: line.productId,
            // El extra de un modificador es un pedido explícito del cliente:
            // si no hay, la venta debe frenar (no es un consumible de fondo).
            blocksAvailability: true,
          });
        }
      }
    };

    const consume = async (
      p: { id: string; name: string; directResale: boolean },
      qty: number,
      originProductId: string,
      sizeId?: string | null,
    ): Promise<void> => {
      if (p.directResale) {
        specs.push({
          entityType: 'PRODUCT',
          productId: p.id,
          delta: -qty,
          note: `${notePrefix} item ${p.name}`,
          originProductId,
          // Reventa directa: su stock ES lo que se vende → siempre bloquea.
          blocksAvailability: true,
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
      // OJO: se consumen TODOS los children, bloqueantes o no. El flag solo se
      // propaga para que el guard de stock no frene por un consumible.
      for (const ing of expanded.ingredients.values()) {
        specs.push({
          entityType: 'INGREDIENT',
          ingredientId: ing.ingredientId,
          delta: -ing.totalQuantity,
          note: `${notePrefix} via "${p.name}"`,
          originProductId,
          blocksAvailability: ing.blocksAvailability,
        });
      }
      for (const sub of expanded.subproducts.values()) {
        specs.push({
          entityType: 'SUBPRODUCT',
          subproductId: sub.subproductId,
          delta: -sub.totalQuantity,
          note: `${notePrefix} via "${p.name}"`,
          originProductId,
          blocksAvailability: sub.blocksAvailability,
        });
      }
    };

    for (const line of lines) {
      const product = saleProductMap.get(line.productId);
      if (!product) {
        throw new BadRequestException(`Producto ${line.productId} ya no existe.`);
      }
      consumeModifiers(line);
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
          // El origen es el combo (line.productId): si el combo está forzado,
          // se toleran los faltantes de todos sus componentes.
          await consume(cp, line.quantity * comp.quantity, line.productId);
        }
      } else {
        await consume(product, line.quantity, line.productId, line.sizeId);
      }
    }

    return specs;
  }

  /**
   * Claves `TYPE:id` cuyo faltante NO debe frenar la venta:
   *  - consumos de productos "forzados disponibles" (el dueño los reactivó),
   *  - consumibles (`blocksAvailability=false`: servilletas, sal).
   *
   * Una entidad se tolera SOLO si NINGÚN consumo bloqueante de esta venta la
   * usa: la lechuga sigue frenando la ensalada aunque sea adorno en la
   * hamburguesa del mismo ticket.
   *
   * Compartido por el cobro y la edición para que no puedan divergir (si la UI
   * muestra disponible y el guard rechaza, el cajero queda trabado).
   */
  tolerableKeys(
    specs: readonly ConsumptionSpec[],
    forcedProductIds: ReadonlySet<string>,
  ): Set<string> {
    const blocking = new Set<string>();
    const tolerable = new Set<string>();
    for (const s of specs) {
      const id = s.ingredientId ?? s.productId ?? s.subproductId;
      if (!id) continue;
      const key = `${s.entityType}:${id}`;
      if (forcedProductIds.has(s.originProductId) || !s.blocksAvailability) {
        tolerable.add(key);
      } else {
        blocking.add(key);
      }
    }
    for (const k of blocking) tolerable.delete(k);
    return tolerable;
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
   * Esta es la red de seguridad transaccional. Los tres callers (cobro, sync
   * offline, edición) la corren DENTRO de una tx SERIALIZABLE (`SALE_TX_OPTS`)
   * con retry 40001: dos ventas concurrentes sobre el mismo stock se
   * serializan — una transa y la otra recomputa fresco o falla con el
   * faltante.
   */
  async assertStockSufficient(
    tx: Prisma.TransactionClient,
    movements: Prisma.InventoryMovementCreateManyInput[],
    /**
     * Claves `TYPE:id` cuyo faltante se TOLERA (no bloquea): consumos de
     * productos "forzados disponibles". Su stock queda en negativo (auditado
     * por el caller) para no frenar la venta cuando el stock no se registró.
     */
    tolerateKeys?: ReadonlySet<string>,
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
      if (tolerateKeys?.has(k)) continue; // forzado disponible → se permite negativo
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
