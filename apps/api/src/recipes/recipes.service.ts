import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  computeComboCost,
  computeProductCost,
  expandRecipe,
  expandRecipeOneLevel,
  roundCost,
  RecipeCycleError,
  RecipeMissingNodeError,
  type IngredientCostMap,
  type ParentRef,
  type RecipeEdgeNode,
  type RecipeGraph,
} from '@pos-tercos/domain';
import type {
  ComboComponentCost,
  DirectRecipeComponent,
  ExpandedCostResponse,
  ProductCostSummary,
  ProductCostWithVariants,
  ProductVariantCost,
  RecipeEdge,
  RecipeEdgeInput,
  RecipeResponse,
} from '@pos-tercos/types';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type DbRecipeEdge = Prisma.RecipeEdgeGetPayload<Record<string, never>>;
type DbProductSize = Prisma.ProductSizeGetPayload<Record<string, never>>;

/** Consulta de costos ya resuelta: producto o producto+variante. */
export interface CatalogCostLookup {
  unitCost(productId: string, sizeId?: string | null): number | null;
}

const variantKey = (productId: string, sizeId: string): string => `${productId}:${sizeId}`;

type ParentKind = 'product' | 'subproduct';

@Injectable()
export class RecipesService {
  constructor(private readonly prisma: PrismaService) {}

  async getRecipe(kind: ParentKind, parentId: string): Promise<RecipeResponse> {
    await this.assertParentExists(kind, parentId);
    const edges = await this.prisma.recipeEdge.findMany({
      where:
        kind === 'product'
          ? { parentProductId: parentId }
          : { parentSubproductId: parentId },
      orderBy: { createdAt: 'asc' },
    });
    return {
      parentType: kind,
      parentId,
      edges: edges.map(toRecipeEdgeDto),
    };
  }

  async setRecipe(
    kind: ParentKind,
    parentId: string,
    edges: RecipeEdgeInput[],
  ): Promise<RecipeResponse> {
    await this.assertParentExists(kind, parentId);
    await this.assertChildrenExist(edges);
    this.assertNoDirectSelfCycle(kind, parentId, edges);

    // Pre-flight cycle detection: build a hypothetical graph (existing edges of
    // all subproducts + the proposed edges replacing this parent's edges) and
    // run expandRecipe from the new parent. If cycle detected, reject before
    // touching DB.
    await this.assertNoTransitiveCycle(kind, parentId, edges);

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.recipeEdge.deleteMany({
        where:
          kind === 'product'
            ? { parentProductId: parentId }
            : { parentSubproductId: parentId },
      });

      const created = await Promise.all(
        edges.map((e) =>
          tx.recipeEdge.create({
            data: {
              parentProductId: kind === 'product' ? parentId : null,
              parentSubproductId: kind === 'subproduct' ? parentId : null,
              childIngredientId: e.childType === 'ingredient' ? e.childId : null,
              childSubproductId: e.childType === 'subproduct' ? e.childId : null,
              quantityNeta: e.quantityNeta,
              mermaPct: e.mermaPct ?? 0,
              // null = hereda el flag del insumo/subproducto.
              blocksAvailability: e.blocksAvailability ?? null,
            },
          }),
        ),
      );
      return created;
    });

    return {
      parentType: kind,
      parentId,
      edges: result.map(toRecipeEdgeDto),
    };
  }

  /** Receta de una variante (proteína). Aditiva sobre la receta base. */
  async getSizeRecipe(productId: string, sizeId: string): Promise<RecipeResponse> {
    await this.assertSizeBelongsToProduct(productId, sizeId);
    const edges = await this.prisma.recipeEdge.findMany({
      where: { parentSizeId: sizeId },
      orderBy: { createdAt: 'asc' },
    });
    return { parentType: 'size', parentId: sizeId, edges: edges.map(toRecipeEdgeDto) };
  }

  async setSizeRecipe(
    productId: string,
    sizeId: string,
    edges: RecipeEdgeInput[],
  ): Promise<RecipeResponse> {
    await this.assertSizeBelongsToProduct(productId, sizeId);
    await this.assertChildrenExist(edges);
    // Una variante nunca es nodo del grafo (nada la referencia como hijo): el
    // único riesgo de ciclo está entre subproductos, que esta verificación cubre
    // tratando los edges de la variante como hijos directos del producto.
    await this.assertNoTransitiveCycle('product', productId, edges);

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.recipeEdge.deleteMany({ where: { parentSizeId: sizeId } });
      return Promise.all(
        edges.map((e) =>
          tx.recipeEdge.create({
            data: {
              parentSizeId: sizeId,
              childIngredientId: e.childType === 'ingredient' ? e.childId : null,
              childSubproductId: e.childType === 'subproduct' ? e.childId : null,
              quantityNeta: e.quantityNeta,
              mermaPct: e.mermaPct ?? 0,
              // null = hereda el flag del insumo/subproducto.
              blocksAvailability: e.blocksAvailability ?? null,
            },
          }),
        ),
      );
    });

    return { parentType: 'size', parentId: sizeId, edges: result.map(toRecipeEdgeDto) };
  }

  private async assertSizeBelongsToProduct(productId: string, sizeId: string): Promise<void> {
    const size = await this.prisma.productSize.findUnique({
      where: { id: sizeId },
      select: { productId: true },
    });
    if (!size) throw new NotFoundException(`Variante ${sizeId} no existe`);
    if (size.productId !== productId) {
      throw new BadRequestException(`Esa variante no pertenece a este producto.`);
    }
  }

  /**
   * Carga el grafo completo necesario para expandir recursivamente la receta
   * de un producto raíz, hasta sus insumos. Usado por el endpoint
   * `/products/:id/expanded-cost`.
   */
  async loadGraphForProduct(
    productId: string,
    sizeId?: string,
  ): Promise<{ graph: RecipeGraph; root: ParentRef }> {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      throw new NotFoundException(`Product ${productId} not found`);
    }

    const productEdges = await this.prisma.recipeEdge.findMany({
      where: { parentProductId: productId },
    });

    // Receta de la variante (aditiva): sus edges se inyectan como hijos directos
    // del producto en el grafo, así expandRecipe los suma a la receta base sin
    // que el dominio (ParentRef product|subproduct) tenga que conocer "size".
    const sizeNodes: RecipeEdgeNode[] = sizeId
      ? variantEdgesAsProductChildren(
          await this.prisma.recipeEdge.findMany({ where: { parentSizeId: sizeId } }),
          productId,
        )
      : [];

    const subproducts = await this.prisma.subproduct.findMany();
    const subproductEdges = await this.prisma.recipeEdge.findMany({
      where: { parentSubproductId: { not: null } },
    });
    const ingredients = await this.prisma.ingredient.findMany();

    const graph: RecipeGraph = {
      products: new Map([[product.id, { id: product.id, name: product.name }]]),
      subproducts: new Map(
        subproducts.map((s) => [s.id, { id: s.id, name: s.name, yield: Number(s.yield) }]),
      ),
      ingredients: new Map(
        ingredients.map((i) => [
          i.id,
          { id: i.id, name: i.name, unitRecipe: i.unitRecipe },
        ]),
      ),
      edgesByParent: groupEdgesByParent(
        [...productEdges, ...sizeNodes, ...subproductEdges],
        buildBlocksDefaults(ingredients, subproducts),
      ),
    };

    return { graph, root: { kind: 'product', id: productId } };
  }

  /**
   * Carga el grafo de recetas COMPLETO en una sola pasada (todos los productos,
   * subproductos, insumos y aristas base). Pensado para evaluar disponibilidad
   * de muchos productos sin N+1: el llamador construye `root` por producto y
   * llama `expandRecipe`. Excluye aristas de variante (parentSizeId) — la
   * disponibilidad se evalúa sobre la receta base.
   */
  async loadFullGraph(): Promise<RecipeGraph> {
    const [products, subproducts, ingredients, edges] = await Promise.all([
      this.prisma.product.findMany({ select: { id: true, name: true } }),
      this.prisma.subproduct.findMany(),
      this.prisma.ingredient.findMany(),
      this.prisma.recipeEdge.findMany({
        where: {
          OR: [
            { parentProductId: { not: null } },
            { parentSubproductId: { not: null } },
          ],
        },
      }),
    ]);

    return {
      products: new Map(products.map((p) => [p.id, { id: p.id, name: p.name }])),
      subproducts: new Map(
        subproducts.map((s) => [
          s.id,
          { id: s.id, name: s.name, yield: Number(s.yield) },
        ]),
      ),
      ingredients: new Map(
        ingredients.map((i) => [
          i.id,
          { id: i.id, name: i.name, unitRecipe: i.unitRecipe },
        ]),
      ),
      edgesByParent: groupEdgesByParent(edges, buildBlocksDefaults(ingredients, subproducts)),
    };
  }

  /** Componentes DIRECTOS (un nivel) de una receta — insumos + subproductos que
   *  se consumen tal cual por 1 unidad. Espeja cómo el FIFO descuenta al vender. */
  private directComponentsOf(
    recipe: { graph: RecipeGraph; root: ParentRef } | null,
    multiplier: number,
  ): DirectRecipeComponent[] {
    if (!recipe) return [];
    const ol = expandRecipeOneLevel(recipe.graph, recipe.root, multiplier);
    return [
      ...Array.from(ol.ingredients.values()).map((i) => ({
        entityType: 'INGREDIENT' as const,
        id: i.ingredientId,
        name: i.name,
        unitRecipe: i.unitRecipe,
        totalQuantity: i.totalQuantity,
      })),
      ...Array.from(ol.subproducts.values()).map((s) => ({
        entityType: 'SUBPRODUCT' as const,
        id: s.subproductId,
        name: s.name,
        unitRecipe: s.unit,
        totalQuantity: s.totalQuantity,
      })),
    ];
  }

  async expandedCost(productId: string, sizeId?: string): Promise<ExpandedCostResponse> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { comboComponents: true },
    });
    if (!product) throw new NotFoundException(`Product ${productId} not found`);
    if (sizeId) await this.assertSizeBelongsToProduct(productId, sizeId);

    // Pre-cargar TODOS los ingredientes una vez (para tener lastUnitCost +
    // conversionFactor a mano sin n+1).
    const allIngredients = await this.prisma.ingredient.findMany({
      select: { id: true, lastUnitCost: true, conversionFactor: true, lastUnitCostDate: true },
    });
    const ingredientCosts: IngredientCostMap = new Map(
      allIngredients.map((i) => [
        i.id,
        i.lastUnitCost !== null && Number(i.conversionFactor) > 0
          ? Number(i.lastUnitCost) / Number(i.conversionFactor)
          : null,
      ]),
    );
    const ingredientCostDates = new Map(
      allIngredients.map((i) => [i.id, i.lastUnitCostDate?.toISOString() ?? null]),
    );

    try {
      // ============= COMBO PATH =============
      if (product.isCombo) {
        const componentIds = product.comboComponents.map((c) => c.productId);
        const componentProducts = await this.prisma.product.findMany({
          where: { id: { in: componentIds } },
        });
        const compMap = new Map(componentProducts.map((p) => [p.id, p]));

        const componentResults: ComboComponentCost[] = [];
        for (const cc of product.comboComponents) {
          const comp = compMap.get(cc.productId);
          if (!comp) {
            componentResults.push({
              productId: cc.productId,
              productName: '(eliminado)',
              quantity: cc.quantity,
              unitCost: null,
              costContribution: null,
              missingReason: `Un componente del combo ya no existe en el catálogo.`,
            });
            continue;
          }

          // Para cada componente, compute su unit cost
          let recipe: { graph: RecipeGraph; root: ParentRef } | null = null;
          if (!comp.directResale) {
            recipe = await this.loadGraphForProduct(comp.id);
          }
          const r = computeProductCost({
            product: {
              id: comp.id,
              name: comp.name,
              directResale: comp.directResale,
              lastUnitCost:
                comp.lastUnitCost !== null ? Number(comp.lastUnitCost) : null,
              conversionFactor:
                comp.conversionFactor !== null ? Number(comp.conversionFactor) : null,
              isCombo: comp.isCombo,
            },
            recipe,
            ingredientCosts,
          });
          componentResults.push({
            productId: comp.id,
            productName: comp.name,
            quantity: cc.quantity,
            unitCost: r.totalCost,
            costContribution:
              r.totalCost !== null ? round(r.totalCost * cc.quantity) : null,
            missingReason:
              r.totalCost === null ? r.missingReasons.join(' · ') : null,
          });
        }

        const comboResult = computeComboCost({
          components: componentResults.map((c) => ({
            productId: c.productId,
            productName: c.productName,
            quantity: c.quantity,
            unitCost: c.unitCost,
            missingReason: c.missingReason,
          })),
        });

        return {
          productId,
          kind: 'combo',
          totals: [],
          directComponents: [],
          components: comboResult.components.map((c) => ({
            productId: c.productId,
            productName: c.productName,
            quantity: c.quantity,
            unitCost: c.unitCost,
            costContribution: c.costContribution,
            missingReason: c.missingReason,
          })),
          totalCost: comboResult.totalCost,
          missingReasons: comboResult.missingReasons,
        };
      }

      // ============= NON-COMBO PATH =============
      let recipe: { graph: RecipeGraph; root: ParentRef } | null = null;
      let ingredients: ReturnType<typeof Array.from<ReturnType<typeof expandRecipe> extends Map<unknown, infer V> ? V : never>> = [];
      if (!product.directResale) {
        recipe = await this.loadGraphForProduct(productId, sizeId);
        const expanded = expandRecipe(recipe.graph, recipe.root);
        ingredients = Array.from(expanded.values());
      }

      const r = computeProductCost({
        product: {
          id: product.id,
          name: product.name,
          directResale: product.directResale,
          lastUnitCost:
            product.lastUnitCost !== null ? Number(product.lastUnitCost) : null,
          conversionFactor:
            product.conversionFactor !== null
              ? Number(product.conversionFactor)
              : null,
          isCombo: false,
        },
        recipe,
        ingredientCosts,
      });

      return {
        productId,
        kind: 'product',
        totals: ingredients.map((e) => {
          const unitCost = ingredientCosts.get(e.ingredientId) ?? null;
          return {
            ingredientId: e.ingredientId,
            name: e.name,
            unitRecipe: e.unitRecipe,
            totalQuantity: e.totalQuantity,
            unitCostInRecipe: unitCost,
            costContribution:
              unitCost !== null ? round(e.totalQuantity * unitCost) : null,
            lastUnitCostDate: ingredientCostDates.get(e.ingredientId) ?? null,
          };
        }),
        directComponents: this.directComponentsOf(recipe, 1),
        components: [],
        totalCost: r.totalCost,
        missingReasons: r.missingReasons,
      };
    } catch (err) {
      if (err instanceof RecipeCycleError) {
        throw new BadRequestException({
          message: 'La receta se referencia a sí misma: revisa sus subproductos.',
          cyclePath: err.cyclePath,
        });
      }
      if (err instanceof RecipeMissingNodeError) {
        throw new BadRequestException({
          message: 'La receta usa un item que ya no existe en el catálogo.',
          missingId: err.missingId,
          kind: err.kind,
        });
      }
      throw err;
    }
  }

  /**
   * Costo por unidad de TODOS los productos, SOLO de la receta base.
   *
   * En un producto con variantes ese número describe un plato que no se puede
   * comprar (elegir variante es obligatorio para vender). Se conserva tal cual
   * porque es lo que hoy consumen los reportes; quien tenga que mostrarlo en
   * pantalla debe usar `listProductCostsWithVariants`, que agrega lo que de
   * verdad sale por la ventana.
   */
  async listProductCosts(): Promise<ProductCostSummary[]> {
    return (await this.catalogCosts(false)).map(({ productId, totalCost, missingReasons }) => ({
      productId,
      totalCost,
      missingReasons,
    }));
  }

  /**
   * Lo mismo, más el costo de cada variante (receta base + la de la variante).
   * Aditivo: `totalCost` sigue siendo el de la base, bit por bit igual al de
   * `listProductCosts` — los dos salen del mismo cálculo.
   */
  async listProductCostsWithVariants(): Promise<ProductCostWithVariants[]> {
    return this.catalogCosts(true);
  }

  /**
   * Costo por unidad de cada producto Y de cada variante, listo para consultar.
   *
   * Lo usan los reportes que costean lo que se VENDIÓ: una venta lleva su
   * `sizeId`, y costearla con la receta base cobra de menos exactamente lo que
   * vale la variante (la proteína, casi siempre lo más caro del plato).
   */
  async buildCostLookup(): Promise<CatalogCostLookup> {
    const costs = await this.catalogCosts(true);
    const base = new Map(costs.map((c) => [c.productId, c.totalCost]));
    const byVariant = new Map<string, number | null>();
    for (const c of costs) {
      for (const v of c.variants) byVariant.set(variantKey(c.productId, v.sizeId), v.totalCost);
    }
    return {
      unitCost(productId, sizeId) {
        if (sizeId) {
          const conVariante = byVariant.get(variantKey(productId, sizeId));
          // Una variante borrada del catálogo no vuelve desconocido el costo:
          // se cae a la base, que es lo que se sabe.
          if (conVariante !== undefined) return conVariante;
        }
        return base.get(productId) ?? null;
      },
    };
  }

  /**
   * El costo de toda la carta en una sola pasada: carga el grafo completo + los
   * costos de insumos UNA vez y computa cada producto en memoria (reemplaza el
   * N+1 de pedir `expanded-cost` por producto).
   */
  private async catalogCosts(withVariants: boolean): Promise<ProductCostWithVariants[]> {
    const [products, allIngredients, graph, sizes, sizeEdges] = await Promise.all([
      this.prisma.product.findMany({ include: { comboComponents: true } }),
      this.prisma.ingredient.findMany({
        select: { id: true, lastUnitCost: true, conversionFactor: true },
      }),
      this.loadFullGraph(),
      withVariants
        ? this.prisma.productSize.findMany({
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          })
        : Promise.resolve([] as DbProductSize[]),
      withVariants
        ? this.prisma.recipeEdge.findMany({ where: { parentSizeId: { not: null } } })
        : Promise.resolve([] as DbRecipeEdge[]),
    ]);
    const ingredientCosts: IngredientCostMap = new Map(
      allIngredients.map((i) => [
        i.id,
        i.lastUnitCost !== null && Number(i.conversionFactor) > 0
          ? Number(i.lastUnitCost) / Number(i.conversionFactor)
          : null,
      ]),
    );
    const productById = new Map(products.map((p) => [p.id, p]));

    // Mismo cálculo que `expandedCost` pero sobre el grafo ya cargado (sin hit a DB).
    const costOf = (p: (typeof products)[number]) =>
      computeProductCost({
        product: {
          id: p.id,
          name: p.name,
          directResale: p.directResale,
          lastUnitCost: p.lastUnitCost !== null ? Number(p.lastUnitCost) : null,
          conversionFactor:
            p.conversionFactor !== null ? Number(p.conversionFactor) : null,
          isCombo: p.isCombo,
        },
        recipe: p.directResale
          ? null
          : { graph, root: { kind: 'product' as const, id: p.id } },
        ingredientCosts,
      });

    const sizesByProduct = new Map<string, typeof sizes>();
    for (const size of sizes) {
      const list = sizesByProduct.get(size.productId);
      if (list) list.push(size);
      else sizesByProduct.set(size.productId, [size]);
    }
    const edgesBySize = new Map<string, typeof sizeEdges>();
    for (const edge of sizeEdges) {
      const key = edge.parentSizeId as string;
      const list = edgesBySize.get(key);
      if (list) list.push(edge);
      else edgesBySize.set(key, [edge]);
    }

    /**
     * El costo del producto CON una variante: se le cuelgan al producto, solo
     * durante este cálculo, las aristas de esa variante, y se deja el grafo
     * exactamente como estaba. `expandRecipe` es síncrono y puro, así que nadie
     * más puede ver el grafo a medio camino.
     */
    const costWithVariant = (
      p: (typeof products)[number],
      edges: typeof sizeEdges,
    ): ReturnType<typeof costOf> => {
      if (edges.length === 0) return costOf(p);
      const key = `p:${p.id}`;
      const previo = graph.edgesByParent.get(key);
      graph.edgesByParent.set(key, [
        ...(previo ?? []),
        ...variantEdgesAsProductChildren(edges, p.id),
      ]);
      try {
        return costOf(p);
      } finally {
        // Restaurar EXACTO: si la clave no existía, tiene que volver a no existir.
        if (previo === undefined) graph.edgesByParent.delete(key);
        else graph.edgesByParent.set(key, previo);
      }
    };

    const variantsOf = (product: (typeof products)[number]): ProductVariantCost[] =>
      (sizesByProduct.get(product.id) ?? []).map((size) => {
        try {
          // Un combo o una reventa no costean por receta: su variante cuesta lo
          // mismo que el producto (una receta de variante ahí no se consume).
          const r =
            product.isCombo || product.directResale
              ? null
              : costWithVariant(product, edgesBySize.get(size.id) ?? []);
          return {
            sizeId: size.id,
            name: size.name,
            priceModifier: Number(size.priceModifier),
            totalCost: r?.totalCost ?? null,
            missingReasons: r?.missingReasons ?? [],
          };
        } catch {
          return {
            sizeId: size.id,
            name: size.name,
            priceModifier: Number(size.priceModifier),
            totalCost: null,
            missingReasons: ['No se pudo calcular el costo'],
          };
        }
      });

    return products.map((product) => {
      try {
        if (product.isCombo) {
          const components = product.comboComponents.map((cc) => {
            const comp = productById.get(cc.productId);
            if (!comp) {
              return {
                productId: cc.productId,
                productName: '(eliminado)',
                quantity: cc.quantity,
                unitCost: null,
                missingReason: `Un componente del combo ya no existe en el catálogo.`,
              };
            }
            const r = costOf(comp);
            return {
              productId: comp.id,
              productName: comp.name,
              quantity: cc.quantity,
              unitCost: r.totalCost,
              missingReason:
                r.totalCost === null ? r.missingReasons.join(' · ') : null,
            };
          });
          const combo = computeComboCost({ components });
          return {
            productId: product.id,
            totalCost: combo.totalCost,
            missingReasons: combo.missingReasons,
            variants: variantsOf(product),
          };
        }
        const r = costOf(product);
        return {
          productId: product.id,
          totalCost: r.totalCost,
          missingReasons: r.missingReasons,
          variants: variantsOf(product),
        };
      } catch (err) {
        return {
          productId: product.id,
          totalCost: null,
          missingReasons: [
            err instanceof RecipeCycleError
              ? 'La receta tiene un ciclo'
              : 'No se pudo calcular el costo',
          ],
          variants: [],
        };
      }
    });
  }

  /**
   * Costo estimado de UN subproducto, por unidad (porción) — no por corrida.
   * `expandRecipe` con root subproducto y factor 1 daría los insumos de una
   * corrida completa; dividimos por `yield` (multiplier 1/yield) para obtener
   * el costo de 1 unidad del subproducto, que es como lo consume cada receta.
   */
  async expandedSubproductCost(subproductId: string): Promise<ExpandedCostResponse> {
    const subproduct = await this.prisma.subproduct.findUnique({
      where: { id: subproductId },
    });
    if (!subproduct) throw new NotFoundException(`Subproduct ${subproductId} not found`);
    const yieldN = Number(subproduct.yield);

    const allIngredients = await this.prisma.ingredient.findMany({
      select: { id: true, lastUnitCost: true, conversionFactor: true, lastUnitCostDate: true },
    });
    const ingredientCosts: IngredientCostMap = new Map(
      allIngredients.map((i) => [
        i.id,
        i.lastUnitCost !== null && Number(i.conversionFactor) > 0
          ? Number(i.lastUnitCost) / Number(i.conversionFactor)
          : null,
      ]),
    );
    const ingredientCostDates = new Map(
      allIngredients.map((i) => [i.id, i.lastUnitCostDate?.toISOString() ?? null]),
    );

    try {
      const graph = await this.loadFullGraph();
      const root: ParentRef = { kind: 'subproduct', id: subproductId };
      const expanded = expandRecipe(graph, root, yieldN > 0 ? 1 / yieldN : 1);
      const ingredients = Array.from(expanded.values());

      let total = 0;
      let allKnown = true;
      const missing: string[] = [];
      const totals = ingredients.map((e) => {
        const unitCost = ingredientCosts.get(e.ingredientId) ?? null;
        const costContribution = unitCost !== null ? round(e.totalQuantity * unitCost) : null;
        if (unitCost === null) {
          allKnown = false;
          missing.push(`Falta el costo de "${e.name}" (sin facturas de compra confirmadas)`);
        } else {
          total += costContribution!;
        }
        return {
          ingredientId: e.ingredientId,
          name: e.name,
          unitRecipe: e.unitRecipe,
          totalQuantity: e.totalQuantity,
          unitCostInRecipe: unitCost,
          costContribution,
          lastUnitCostDate: ingredientCostDates.get(e.ingredientId) ?? null,
        };
      });

      return {
        productId: subproductId,
        kind: 'product',
        totals,
        directComponents: this.directComponentsOf({ graph, root }, yieldN > 0 ? 1 / yieldN : 1),
        components: [],
        totalCost: allKnown ? round(total) : null,
        missingReasons: missing,
      };
    } catch (err) {
      if (err instanceof RecipeCycleError) {
        throw new BadRequestException({ message: 'La receta se referencia a sí misma: revisa sus subproductos.', cyclePath: err.cyclePath });
      }
      if (err instanceof RecipeMissingNodeError) {
        throw new BadRequestException({
          message: 'La receta usa un item que ya no existe en el catálogo.',
          missingId: err.missingId,
          kind: err.kind,
        });
      }
      throw err;
    }
  }

  /**
   * Costo por unidad de TODOS los subproductos en una sola pasada (sin N+1):
   * carga el grafo completo + costos de insumos una vez y expande cada
   * subproducto. Un subproducto con receta rota (ciclo/insumo faltante) o sin
   * costo conocido queda con `totalCost: null` sin tumbar el resto.
   */
  async listSubproductCosts(): Promise<{ subproductId: string; totalCost: number | null }[]> {
    const [graph, allIngredients] = await Promise.all([
      this.loadFullGraph(),
      this.prisma.ingredient.findMany({
        select: { id: true, lastUnitCost: true, conversionFactor: true },
      }),
    ]);
    const ingredientCosts: IngredientCostMap = new Map(
      allIngredients.map((i) => [
        i.id,
        i.lastUnitCost !== null && Number(i.conversionFactor) > 0
          ? Number(i.lastUnitCost) / Number(i.conversionFactor)
          : null,
      ]),
    );

    const result: { subproductId: string; totalCost: number | null }[] = [];
    for (const sub of graph.subproducts.values()) {
      let totalCost: number | null = null;
      try {
        const yieldN = sub.yield;
        const expanded = expandRecipe(
          graph,
          { kind: 'subproduct', id: sub.id },
          yieldN > 0 ? 1 / yieldN : 1,
        );
        let total = 0;
        let allKnown = true;
        for (const e of expanded.values()) {
          const unitCost = ingredientCosts.get(e.ingredientId) ?? null;
          if (unitCost === null) {
            allKnown = false;
            break;
          }
          total += e.totalQuantity * unitCost;
        }
        totalCost = allKnown ? round(total) : null;
      } catch {
        totalCost = null; // receta rota → sin costo, no rompe el batch
      }
      result.push({ subproductId: sub.id, totalCost });
    }
    return result;
  }

  private async assertParentExists(kind: ParentKind, id: string): Promise<void> {
    if (kind === 'product') {
      const exists = await this.prisma.product.findUnique({ where: { id }, select: { id: true } });
      if (!exists) throw new NotFoundException(`Product ${id} not found`);
    } else {
      const exists = await this.prisma.subproduct.findUnique({ where: { id }, select: { id: true } });
      if (!exists) throw new NotFoundException(`Subproduct ${id} not found`);
    }
  }

  private async assertChildrenExist(edges: RecipeEdgeInput[]): Promise<void> {
    const ingredientIds = edges.filter((e) => e.childType === 'ingredient').map((e) => e.childId);
    const subproductIds = edges.filter((e) => e.childType === 'subproduct').map((e) => e.childId);

    if (ingredientIds.length > 0) {
      const found = await this.prisma.ingredient.findMany({
        where: { id: { in: ingredientIds } },
        select: { id: true },
      });
      const missing = ingredientIds.filter((id) => !found.some((f) => f.id === id));
      if (missing.length > 0) {
        throw new BadRequestException(`Recipe references missing ingredients: ${missing.join(', ')}`);
      }
    }

    if (subproductIds.length > 0) {
      const found = await this.prisma.subproduct.findMany({
        where: { id: { in: subproductIds } },
        select: { id: true },
      });
      const missing = subproductIds.filter((id) => !found.some((f) => f.id === id));
      if (missing.length > 0) {
        throw new BadRequestException(`Recipe references missing subproducts: ${missing.join(', ')}`);
      }
    }
  }

  private assertNoDirectSelfCycle(
    kind: ParentKind,
    parentId: string,
    edges: RecipeEdgeInput[],
  ): void {
    if (kind !== 'subproduct') return;
    const selfRef = edges.find((e) => e.childType === 'subproduct' && e.childId === parentId);
    if (selfRef) {
      throw new BadRequestException(`Un subproducto no puede usarse a sí mismo en su receta.`);
    }
  }

  private async assertNoTransitiveCycle(
    kind: ParentKind,
    parentId: string,
    edges: RecipeEdgeInput[],
  ): Promise<void> {
    const subproducts = await this.prisma.subproduct.findMany();
    const ingredients = await this.prisma.ingredient.findMany();
    const allSubproductEdges = await this.prisma.recipeEdge.findMany({
      where: {
        parentSubproductId: { not: null },
        // Replace edges of THIS parent if it's a subproduct: exclude its current edges
        ...(kind === 'subproduct' && { NOT: { parentSubproductId: parentId } }),
      },
    });

    const proposedEdges: RecipeEdgeNode[] = edges.map((e) => ({
      parent:
        kind === 'product'
          ? { kind: 'product', id: parentId }
          : { kind: 'subproduct', id: parentId },
      child:
        e.childType === 'ingredient'
          ? { kind: 'ingredient', id: e.childId }
          : { kind: 'subproduct', id: e.childId },
      quantityNeta: e.quantityNeta,
      mermaPct: e.mermaPct ?? 0,
    }));

    const existingSubpEdges: RecipeEdgeNode[] = allSubproductEdges
      .filter((e) => e.parentSubproductId !== null)
      .map((e) => ({
        parent: { kind: 'subproduct', id: e.parentSubproductId as string },
        child:
          e.childIngredientId !== null
            ? { kind: 'ingredient', id: e.childIngredientId }
            : { kind: 'subproduct', id: e.childSubproductId as string },
        quantityNeta: Number(e.quantityNeta),
        mermaPct: Number(e.mermaPct),
      }));

    const allEdges = [...existingSubpEdges, ...proposedEdges];

    const productMap = new Map<string, { id: string; name: string }>();
    if (kind === 'product') {
      productMap.set(parentId, { id: parentId, name: 'product' });
    }

    const graph: RecipeGraph = {
      products: productMap,
      subproducts: new Map(
        subproducts.map((s) => [s.id, { id: s.id, name: s.name, yield: Number(s.yield) }]),
      ),
      ingredients: new Map(
        ingredients.map((i) => [
          i.id,
          { id: i.id, name: i.name, unitRecipe: i.unitRecipe },
        ]),
      ),
      edgesByParent: groupEdgesByParent(allEdges),
    };

    const root: ParentRef =
      kind === 'product'
        ? { kind: 'product', id: parentId }
        : { kind: 'subproduct', id: parentId };

    try {
      expandRecipe(graph, root);
    } catch (err) {
      if (err instanceof RecipeCycleError) {
        throw new BadRequestException({
          message: 'Ese cambio haría que la receta se referencie a sí misma.',
          cyclePath: err.cyclePath,
        });
      }
      if (err instanceof RecipeMissingNodeError) {
        throw new BadRequestException({
          message: 'La receta usa un item que ya no existe en el catálogo.',
          missingId: err.missingId,
          kind: err.kind,
        });
      }
      throw err;
    }
  }
}

/** Redondeo de costo (4 dec) — delega al canónico del dominio. */
function round(n: number): number {
  return roundCost(n);
}

function toRecipeEdgeDto(row: DbRecipeEdge): RecipeEdge {
  return {
    id: row.id,
    parentProductId: row.parentProductId,
    parentSubproductId: row.parentSubproductId,
    parentSizeId: row.parentSizeId,
    childIngredientId: row.childIngredientId,
    childSubproductId: row.childSubproductId,
    quantityNeta: Number(row.quantityNeta),
    mermaPct: Number(row.mermaPct),
    blocksAvailability: row.blocksAvailability,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Defaults de `blocksAvailability` por child (`i:<id>` / `s:<id>`), para que
 * `groupEdgesByParent` resuelva el valor EFECTIVO de cada edge.
 */
export function buildBlocksDefaults(
  ingredients: Array<{ id: string; blocksAvailability: boolean }>,
  subproducts: Array<{ id: string; blocksAvailability: boolean }>,
): Map<string, boolean> {
  const m = new Map<string, boolean>();
  for (const i of ingredients) m.set(`i:${i.id}`, i.blocksAvailability);
  for (const s of subproducts) m.set(`s:${s.id}`, s.blocksAvailability);
  return m;
}

/**
 * ÚNICO lugar donde se resuelve `blocksAvailability`: `edge ?? insumo ?? true`.
 * El dominio recibe siempre el valor efectivo ya resuelto (y así viaja también
 * al snapshot offline). Sin defaults → todo bloquea (comportamiento histórico).
 */
function groupEdgesByParent(
  edges: Array<DbRecipeEdge | RecipeEdgeNode>,
  blocksDefaults?: Map<string, boolean>,
): Map<string, RecipeEdgeNode[]> {
  const map = new Map<string, RecipeEdgeNode[]>();
  for (const e of edges) {
    const raw: RecipeEdgeNode = isDbEdge(e) ? dbEdgeToNode(e) : e;
    const childKey = `${raw.child.kind === 'ingredient' ? 'i' : 's'}:${raw.child.id}`;
    const node: RecipeEdgeNode = {
      ...raw,
      blocksAvailability:
        raw.blocksAvailability ?? blocksDefaults?.get(childKey) ?? true,
    };
    const key =
      node.parent.kind === 'product' ? `p:${node.parent.id}` : `s:${node.parent.id}`;
    const list = map.get(key);
    if (list) {
      list.push(node);
    } else {
      map.set(key, [node]);
    }
  }
  return map;
}

/**
 * Las aristas de una variante colgadas del PRODUCTO.
 *
 * La receta de una variante es aditiva: se inyecta como hijos directos del
 * producto para que `expandRecipe` la sume a la base sin que el dominio
 * (ParentRef product|subproduct) tenga que conocer "size". Vive acá, en un solo
 * lugar, porque la usan dos caminos —la ficha de una variante y el costo del
 * catálogo— y dos copias de una regla de plata se separan siempre.
 */
function variantEdgesAsProductChildren(
  rows: DbRecipeEdge[],
  productId: string,
): RecipeEdgeNode[] {
  return rows.map((e) => ({
    parent: { kind: 'product', id: productId },
    child:
      e.childIngredientId !== null
        ? { kind: 'ingredient', id: e.childIngredientId }
        : { kind: 'subproduct', id: e.childSubproductId as string },
    quantityNeta: Number(e.quantityNeta),
    mermaPct: Number(e.mermaPct),
    blocksAvailability: e.blocksAvailability ?? undefined,
  }));
}

function isDbEdge(e: DbRecipeEdge | RecipeEdgeNode): e is DbRecipeEdge {
  return 'parentProductId' in e;
}

function dbEdgeToNode(row: DbRecipeEdge): RecipeEdgeNode {
  const parent: ParentRef =
    row.parentProductId !== null
      ? { kind: 'product', id: row.parentProductId }
      : { kind: 'subproduct', id: row.parentSubproductId as string };
  const child =
    row.childIngredientId !== null
      ? ({ kind: 'ingredient', id: row.childIngredientId } as const)
      : ({ kind: 'subproduct', id: row.childSubproductId as string } as const);
  return {
    parent,
    child,
    quantityNeta: Number(row.quantityNeta),
    mermaPct: Number(row.mermaPct),
    // null en DB = "hereda" → undefined para que groupEdgesByParent resuelva.
    blocksAvailability: row.blocksAvailability ?? undefined,
  };
}
