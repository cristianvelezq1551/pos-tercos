import { Injectable } from '@nestjs/common';
import type { RecipeEdgeNode, RecipeGraph } from '@pos-tercos/domain';
import type {
  RecipeBookEntry,
  RecipeBookResponse,
  RecipeComponent,
  RecipeVariant,
} from '@pos-tercos/types';
import { PrismaService } from '../prisma/prisma.service';
import { RecipesService, variantEdgesAsProductChildren } from '../recipes/recipes.service';
import { toPrepImages } from '../common/prep-images';

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
    const [graph, products, subproducts, comboComponents, ingredientesOcultos, sizes, sizeEdges] =
      await Promise.all([
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
      // Lo que existe SOLO para costear (empaques, recipientes): no se le
      // muestra al cocinero, ni como ficha ni dentro de un "Lleva".
      this.prisma.ingredient.findMany({
        where: { showInKitchen: false },
        select: { id: true },
      }),
      // La receta de cada variante: `loadFullGraph` no la trae (excluye las
      // aristas de variante a propósito) y sin ella la biblia le mostraba al
      // cocinero un plato que nadie pide — las papas y las salsas, sin ninguna
      // de las tres proteínas.
      this.prisma.productSize.findMany({ orderBy: { sortOrder: 'asc' } }),
      this.prisma.recipeEdge.findMany({ where: { parentSizeId: { not: null } } }),
    ]);
    const ocultos = new Set<string>([
      ...ingredientesOcultos.map((i) => `i:${i.id}`),
      ...subproducts.filter((s) => !s.showInKitchen).map((s) => `s:${s.id}`),
    ]);

    // Unidad por subproducto (el grafo solo trae name+yield).
    const unitBySub = new Map(subproducts.map((s) => [s.id, s.unit]));

    const aristasPorVariante = new Map<string, typeof sizeEdges>();
    for (const e of sizeEdges) {
      const k = e.parentSizeId as string;
      aristasPorVariante.set(k, [...(aristasPorVariante.get(k) ?? []), e]);
    }
    const variantesPorProducto = new Map<string, RecipeVariant[]>();
    for (const size of sizes) {
      const propias = aristasPorVariante.get(size.id) ?? [];
      // Una variante sin receta propia no aporta nada que mostrar: repetir la
      // base debajo de su nombre solo agrega ruido a una pantalla de cocina.
      if (propias.length === 0) continue;
      const lista = variantesPorProducto.get(size.productId) ?? [];
      lista.push({
        sizeId: size.id,
        name: size.name,
        components: this.visibles(
          variantEdgesAsProductChildren(propias, size.productId),
          graph,
          unitBySub,
          ocultos,
        ),
      });
      variantesPorProducto.set(size.productId, lista);
    }

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
        prepImages: toPrepImages(p.prepImages),
        description: p.description,
        isCombo: p.isCombo,
        yield: null,
        unit: null,
        components: this.visibles(edges, graph, unitBySub, ocultos),
        comboItems,
        variants: variantesPorProducto.get(p.id) ?? [],
        preparationSteps: p.preparationSteps,
      };
    });

    const subproductEntries: RecipeBookEntry[] = subproducts
      .filter((s) => s.showInKitchen)
      .map((s) => {
      const edges = graph.edgesByParent.get(`s:${s.id}`) ?? [];
      return {
        kind: 'SUBPRODUCT',
        id: s.id,
        name: s.name,
        category: null,
        imageUrl: null,
        prepImages: toPrepImages(s.prepImages),
        description: null,
        isCombo: false,
        yield: Number(s.yield),
        unit: s.unit,
        components: this.visibles(edges, graph, unitBySub, ocultos),
        comboItems: [],
        variants: [],
        preparationSteps: s.preparationSteps,
      };
    });

    return {
      // La biblia es la guía de PREPARACIÓN. Un producto que se compra y se
      // revende —una gaseosa, un paquete de papas— no tiene receta, ni
      // componentes, ni paso a paso: en la app del cocinero era una ficha
      // vacía que solo estorbaba para llegar a lo que sí se prepara.
      //
      // El filtro mira lo que HAY que hacer, no la categoría: no se puede
      // hardcodear "Bebidas" porque el dueño renombra y crea categorías. Y si
      // algún día le escribe pasos a una bebida (un granizado, una limonada),
      // vuelve sola a la biblia sin tocar código.
      products: productEntries.filter(hayAlgoQuePreparar),
      subproducts: subproductEntries,
      asOf: new Date().toISOString(),
    };
  }

  /**
   * Los componentes que el cocinero SÍ tiene que ver. Un empaque o un
   * recipiente está en la receta para costear, no para prepararse: en la ficha
   * de la biblia solo agrega ruido a la lista de "Lleva".
   */
  private visibles(
    edges: RecipeEdgeNode[],
    graph: RecipeGraph,
    unitBySub: Map<string, string>,
    ocultos: ReadonlySet<string>,
  ): RecipeComponent[] {
    return edges
      .filter((e) => !ocultos.has(`${e.child.kind === 'ingredient' ? 'i' : 's'}:${e.child.id}`))
      .map((e) => this.toComponent(e, graph, unitBySub));
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

/** Tiene receta, es un combo que se arma, o alguien escribió cómo se prepara. */
function hayAlgoQuePreparar(entry: RecipeBookEntry): boolean {
  return (
    entry.components.length > 0 ||
    entry.comboItems.length > 0 ||
    (entry.preparationSteps ?? []).some((paso) => paso.trim().length > 0)
  );
}
