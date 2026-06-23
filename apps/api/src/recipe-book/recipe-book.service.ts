import { Injectable } from '@nestjs/common';
import type { RecipeEdgeNode, RecipeGraph } from '@pos-tercos/domain';
import type {
  RecipeBookEntry,
  RecipeBookResponse,
  RecipeComponent,
} from '@pos-tercos/types';
import { PrismaService } from '../prisma/prisma.service';
import { RecipesService } from '../recipes/recipes.service';

/**
 * Biblia de productos para el cocinero (KDS): cada producto y subproducto con
 * su composición (qué lleva + cantidades, desde la receta) y su paso a paso.
 * Solo lectura; la composición se arma del grafo de recetas y los pasos del
 * campo `preparationSteps` que edita el admin.
 */
@Injectable()
export class RecipeBookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly recipes: RecipesService,
  ) {}

  async getRecipeBook(): Promise<RecipeBookResponse> {
    const [graph, products, subproducts, comboComponents] = await Promise.all([
      this.recipes.loadFullGraph(),
      this.prisma.product.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.subproduct.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.comboComponent.findMany({
        include: { product: { select: { id: true, name: true } } },
      }),
    ]);

    // Unidad por subproducto (el grafo solo trae name+yield).
    const unitBySub = new Map(subproducts.map((s) => [s.id, s.unit]));

    const productEntries: RecipeBookEntry[] = products.map((p) => {
      const edges = graph.edgesByParent.get(`p:${p.id}`) ?? [];
      const comboItems = p.isCombo
        ? comboComponents
            .filter((c) => c.comboId === p.id)
            .map((c) => ({
              productId: c.productId,
              name: c.product.name,
              quantity: c.quantity,
            }))
        : [];
      return {
        kind: 'PRODUCT',
        id: p.id,
        name: p.name,
        category: p.category,
        imageUrl: p.imageUrl,
        description: p.description,
        isCombo: p.isCombo,
        yield: null,
        unit: null,
        components: edges.map((e) => this.toComponent(e, graph, unitBySub)),
        comboItems,
        preparationSteps: p.preparationSteps,
      };
    });

    const subproductEntries: RecipeBookEntry[] = subproducts.map((s) => {
      const edges = graph.edgesByParent.get(`s:${s.id}`) ?? [];
      return {
        kind: 'SUBPRODUCT',
        id: s.id,
        name: s.name,
        category: null,
        imageUrl: null,
        description: null,
        isCombo: false,
        yield: Number(s.yield),
        unit: s.unit,
        components: edges.map((e) => this.toComponent(e, graph, unitBySub)),
        comboItems: [],
        preparationSteps: s.preparationSteps,
      };
    });

    return {
      products: productEntries,
      subproducts: subproductEntries,
      asOf: new Date().toISOString(),
    };
  }

  private toComponent(
    edge: RecipeEdgeNode,
    graph: RecipeGraph,
    unitBySub: Map<string, string>,
  ): RecipeComponent {
    if (edge.child.kind === 'ingredient') {
      const ing = graph.ingredients.get(edge.child.id);
      return {
        type: 'INGREDIENT',
        id: edge.child.id,
        name: ing?.name ?? '—',
        quantity: edge.quantityNeta,
        unit: ing?.unitRecipe ?? '',
        mermaPct: edge.mermaPct,
      };
    }
    const sub = graph.subproducts.get(edge.child.id);
    return {
      type: 'SUBPRODUCT',
      id: edge.child.id,
      name: sub?.name ?? '—',
      quantity: edge.quantityNeta,
      unit: unitBySub.get(edge.child.id) ?? '',
      mermaPct: edge.mermaPct,
    };
  }
}
