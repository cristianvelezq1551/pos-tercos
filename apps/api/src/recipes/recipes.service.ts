import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  expandRecipe,
  RecipeCycleError,
  RecipeMissingNodeError,
  type ParentRef,
  type RecipeEdgeNode,
  type RecipeGraph,
} from '@pos-tercos/domain';
import type {
  ExpandedCostResponse,
  RecipeEdge,
  RecipeEdgeInput,
  RecipeResponse,
} from '@pos-tercos/types';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type DbRecipeEdge = Prisma.RecipeEdgeGetPayload<Record<string, never>>;

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

  /**
   * Carga el grafo completo necesario para expandir recursivamente la receta
   * de un producto raíz, hasta sus insumos. Usado por el endpoint
   * `/products/:id/expanded-cost`.
   */
  async loadGraphForProduct(productId: string): Promise<{ graph: RecipeGraph; root: ParentRef }> {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      throw new NotFoundException(`Product ${productId} not found`);
    }

    const productEdges = await this.prisma.recipeEdge.findMany({
      where: { parentProductId: productId },
    });

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
      edgesByParent: groupEdgesByParent([...productEdges, ...subproductEdges]),
    };

    return { graph, root: { kind: 'product', id: productId } };
  }

  async expandedCost(productId: string): Promise<ExpandedCostResponse> {
    const { graph, root } = await this.loadGraphForProduct(productId);
    try {
      const expanded = expandRecipe(graph, root);
      return {
        productId,
        totals: Array.from(expanded.values()).map((e) => ({
          ingredientId: e.ingredientId,
          name: e.name,
          unitRecipe: e.unitRecipe,
          totalQuantity: e.totalQuantity,
        })),
      };
    } catch (err) {
      if (err instanceof RecipeCycleError) {
        throw new BadRequestException({
          message: 'Recipe contains a cycle',
          cyclePath: err.cyclePath,
        });
      }
      if (err instanceof RecipeMissingNodeError) {
        throw new BadRequestException({
          message: 'Recipe references missing node',
          missingId: err.missingId,
          kind: err.kind,
        });
      }
      throw err;
    }
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
      throw new BadRequestException(`Subproduct ${parentId} cannot reference itself in its recipe`);
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
          message: 'Recipe would create a cycle',
          cyclePath: err.cyclePath,
        });
      }
      if (err instanceof RecipeMissingNodeError) {
        throw new BadRequestException({
          message: 'Recipe references missing node',
          missingId: err.missingId,
          kind: err.kind,
        });
      }
      throw err;
    }
  }
}

function toRecipeEdgeDto(row: DbRecipeEdge): RecipeEdge {
  return {
    id: row.id,
    parentProductId: row.parentProductId,
    parentSubproductId: row.parentSubproductId,
    childIngredientId: row.childIngredientId,
    childSubproductId: row.childSubproductId,
    quantityNeta: Number(row.quantityNeta),
    mermaPct: Number(row.mermaPct),
    createdAt: row.createdAt.toISOString(),
  };
}

function groupEdgesByParent(
  edges: Array<DbRecipeEdge | RecipeEdgeNode>,
): Map<string, RecipeEdgeNode[]> {
  const map = new Map<string, RecipeEdgeNode[]>();
  for (const e of edges) {
    const node: RecipeEdgeNode = isDbEdge(e) ? dbEdgeToNode(e) : e;
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
  };
}
