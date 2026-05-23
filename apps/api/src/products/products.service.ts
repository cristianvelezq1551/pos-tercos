import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type {
  ComboComponent,
  CreateProduct,
  Product,
  ProductAvailability,
  ProductModifier,
  ProductSize,
  SetComboComponents,
  SetProductOptions,
  UpdateProduct,
} from '@pos-tercos/types';
import {
  expandRecipe,
  type ParentRef,
  type RecipeGraph,
  type StorageProvider,
} from '@pos-tercos/domain';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RecipesService } from '../recipes/recipes.service';
import { STORAGE_PROVIDER } from '../adapters/storage/storage.module';
import { mimeForExtension } from '../common/image-mime';

/** Tolerancia de punto flotante al comparar stock vs receta (en unitRecipe). */
const STOCK_EPSILON = 1e-6;

type ProductWithChildren = Prisma.ProductGetPayload<{
  include: {
    sizes: true;
    modifiers: true;
    comboComponents: true;
  };
}>;

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly recipes: RecipesService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  async uploadImage(input: {
    fileBuffer: Buffer;
    mimeType: string;
    extension: string;
  }): Promise<{ imageUrl: string; key: string }> {
    const stored = await this.storage.put(
      'products',
      input.fileBuffer,
      input.mimeType,
      input.extension,
    );
    const filename = stored.key.replace(/^products\//, '');
    return {
      key: stored.key,
      imageUrl: `/api/products/images/${filename}`,
    };
  }

  async getImage(filename: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
    const safe = filename.replace(/\.\.+/g, '').replace(/^\/+/, '');
    if (!safe || safe.includes('/')) return null;
    const key = `products/${safe}`;
    try {
      const buffer = await this.storage.get(key);
      const ext = safe.includes('.') ? safe.split('.').pop()! : '';
      return { buffer, mimeType: mimeForExtension(ext) };
    } catch {
      return null;
    }
  }

  async list(opts: { onlyActive?: boolean; category?: string } = {}): Promise<Product[]> {
    const where: Prisma.ProductWhereInput = {};
    if (opts.onlyActive) where.isActive = true;
    if (opts.category) where.category = opts.category;
    const rows = await this.prisma.product.findMany({
      where,
      include: { sizes: true, modifiers: true, comboComponents: true },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
    return rows.map(toProductDto);
  }

  async getById(id: string): Promise<Product> {
    const row = await this.prisma.product.findUnique({
      where: { id },
      include: { sizes: true, modifiers: true, comboComponents: true },
    });
    if (!row) {
      throw new NotFoundException(`Product ${id} not found`);
    }
    return toProductDto(row);
  }

  async create(input: CreateProduct): Promise<Product> {
    if (input.isCombo) {
      await this.assertComboComponentsAreNonComboProducts(input.comboComponents ?? []);
    }
    const row = await this.prisma.product.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        basePrice: input.basePrice,
        category: input.category ?? null,
        imageUrl: input.imageUrl ?? null,
        modifiersEnabled: input.modifiersEnabled ?? false,
        isCombo: input.isCombo ?? false,
        comboPrice: input.isCombo ? (input.comboPrice ?? null) : null,
        directResale: input.directResale ?? false,
        unitPurchase: input.directResale ? (input.unitPurchase ?? null) : null,
        unitStock: input.directResale ? (input.unitStock ?? null) : null,
        conversionFactor: input.directResale ? (input.conversionFactor ?? null) : null,
        thresholdMin: input.thresholdMin ?? 0,
        sizes: input.sizes
          ? {
              create: input.sizes.map((s) => ({
                name: s.name,
                priceModifier: s.priceModifier,
                sortOrder: s.sortOrder ?? 0,
              })),
            }
          : undefined,
        modifiers: input.modifiers
          ? {
              create: input.modifiers.map((m) => ({
                name: m.name,
                priceDelta: m.priceDelta,
                recipeDelta: (m.recipeDelta as Prisma.InputJsonValue | undefined) ?? {},
              })),
            }
          : undefined,
        comboComponents: input.isCombo && input.comboComponents
          ? {
              create: input.comboComponents.map((c) => ({
                productId: c.productId,
                quantity: c.quantity,
              })),
            }
          : undefined,
      },
      include: { sizes: true, modifiers: true, comboComponents: true },
    });
    return toProductDto(row);
  }

  async update(id: string, input: UpdateProduct): Promise<Product> {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Product ${id} not found`);
    }

    const nextIsCombo = input.isCombo ?? existing.isCombo;
    const nextComboPrice = input.comboPrice ?? (input.isCombo === false ? null : undefined);

    if (nextIsCombo && nextComboPrice === null) {
      throw new BadRequestException('comboPrice cannot be null when isCombo is true');
    }
    if (!nextIsCombo && nextComboPrice !== null && nextComboPrice !== undefined) {
      throw new BadRequestException('comboPrice must be null when isCombo is false');
    }

    const row = await this.prisma.product.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.basePrice !== undefined && { basePrice: input.basePrice }),
        ...(input.category !== undefined && { category: input.category }),
        ...(input.imageUrl !== undefined && { imageUrl: input.imageUrl }),
        ...(input.modifiersEnabled !== undefined && { modifiersEnabled: input.modifiersEnabled }),
        ...(input.isCombo !== undefined && { isCombo: input.isCombo }),
        ...(input.comboPrice !== undefined && { comboPrice: input.comboPrice }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
        ...(input.directResale !== undefined && { directResale: input.directResale }),
        ...(input.unitPurchase !== undefined && { unitPurchase: input.unitPurchase }),
        ...(input.unitStock !== undefined && { unitStock: input.unitStock }),
        ...(input.conversionFactor !== undefined && { conversionFactor: input.conversionFactor }),
        ...(input.thresholdMin !== undefined && { thresholdMin: input.thresholdMin }),
      },
      include: { sizes: true, modifiers: true, comboComponents: true },
    });
    return toProductDto(row);
  }

  /**
   * Reemplaza variantes (sizes) + extras (modifiers) de un producto.
   * - Variantes: upsert por id; las quitadas se borran SOLO si no tienen ventas
   *   (el histórico es inmutable). Borrar una variante arrastra su receta.
   * - Extras: snapshot en sale_items (sin FK) → reemplazo simple. `modifiersEnabled`
   *   se deriva de si hay extras.
   */
  async setOptions(productId: string, input: SetProductOptions): Promise<Product> {
    const existing = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { sizes: { select: { id: true, name: true } } },
    });
    if (!existing) throw new NotFoundException(`Product ${productId} not found`);

    const existingIds = new Set(existing.sizes.map((s) => s.id));
    const incomingIds = new Set<string>();
    for (const s of input.sizes) {
      if (s.id) {
        if (!existingIds.has(s.id)) {
          throw new BadRequestException(`La variante ${s.id} no pertenece a este producto`);
        }
        incomingIds.add(s.id);
      }
    }
    const toDelete = existing.sizes.filter((s) => !incomingIds.has(s.id)).map((s) => s.id);

    if (toDelete.length > 0) {
      const sold = await this.prisma.saleItem.findMany({
        where: { sizeId: { in: toDelete } },
        select: { sizeId: true },
        distinct: ['sizeId'],
      });
      if (sold.length > 0) {
        const names = existing.sizes
          .filter((s) => sold.some((r) => r.sizeId === s.id))
          .map((s) => s.name)
          .join(', ');
        throw new BadRequestException(
          `No se puede eliminar una variante con ventas registradas: ${names}. Crea una nueva en su lugar.`,
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      if (toDelete.length > 0) {
        await tx.recipeEdge.deleteMany({ where: { parentSizeId: { in: toDelete } } });
        await tx.productSize.deleteMany({ where: { id: { in: toDelete } } });
      }
      for (const s of input.sizes) {
        if (s.id) {
          await tx.productSize.update({
            where: { id: s.id },
            data: { name: s.name, priceModifier: s.priceModifier, sortOrder: s.sortOrder ?? 0 },
          });
        } else {
          await tx.productSize.create({
            data: {
              productId,
              name: s.name,
              priceModifier: s.priceModifier,
              sortOrder: s.sortOrder ?? 0,
            },
          });
        }
      }
      await tx.productModifier.deleteMany({ where: { productId } });
      if (input.modifiers.length > 0) {
        await tx.productModifier.createMany({
          data: input.modifiers.map((m) => ({
            productId,
            name: m.name,
            priceDelta: m.priceDelta,
            recipeDelta: (m.recipeDelta as Prisma.InputJsonValue | undefined) ?? {},
          })),
        });
      }
      await tx.product.update({
        where: { id: productId },
        data: { modifiersEnabled: input.modifiers.length > 0 },
      });
    });

    return this.getById(productId);
  }

  /** Reemplaza los componentes de un combo. */
  async setCombo(productId: string, input: SetComboComponents): Promise<Product> {
    const existing = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, isCombo: true },
    });
    if (!existing) throw new NotFoundException(`Product ${productId} not found`);
    if (!existing.isCombo) {
      throw new BadRequestException('El producto no es un combo.');
    }
    await this.assertComboComponentsAreNonComboProducts(input.components);

    await this.prisma.$transaction(async (tx) => {
      await tx.comboComponent.deleteMany({ where: { comboId: productId } });
      await tx.comboComponent.createMany({
        data: input.components.map((c) => ({
          comboId: productId,
          productId: c.productId,
          quantity: c.quantity,
        })),
      });
    });

    return this.getById(productId);
  }

  /**
   * Disponibilidad en vivo para vender (cajero + web): reventa directa se
   * invalida a 0 stock; los preparados/combos solo por "agotado" manual
   * (no dependen del stock de insumos, que puede no estar cargado).
   */
  /**
   * Disponibilidad en vivo de todo el catálogo, robusta por tipo de producto:
   *  - reventa directa → stock propio del producto > 0
   *  - preparado       → insumos de su receta base alcanzan para ≥1 unidad
   *  - combo           → todos sus componentes alcanzan para ≥1 combo
   *  - "86" manual (soldOut) invalida cualquier producto
   *
   * Hace ~3 queries + 1 grafo (sin N+1): stock de productos, stock de insumos
   * y el grafo completo de recetas; la expansión por producto es en memoria.
   */
  async getAvailability(): Promise<ProductAvailability[]> {
    const [allProducts, prodStockRows, ingStockRows, graph] = await Promise.all([
      this.prisma.product.findMany({
        select: {
          id: true,
          name: true,
          isActive: true,
          directResale: true,
          isCombo: true,
          soldOut: true,
          comboComponents: { select: { productId: true, quantity: true } },
        },
      }),
      this.prisma.inventoryMovement.groupBy({
        by: ['productId'],
        where: { entityType: 'PRODUCT' },
        _sum: { delta: true },
      }),
      this.prisma.inventoryMovement.groupBy({
        by: ['ingredientId'],
        where: { entityType: 'INGREDIENT' },
        _sum: { delta: true },
      }),
      this.recipes.loadFullGraph(),
    ]);

    const prodStock = new Map<string, number>();
    for (const r of prodStockRows) {
      if (r.productId) prodStock.set(r.productId, Number(r._sum.delta ?? 0));
    }
    const ingStock = new Map<string, number>();
    for (const r of ingStockRows) {
      if (r.ingredientId) ingStock.set(r.ingredientId, Number(r._sum.delta ?? 0));
    }
    const productById = new Map(allProducts.map((p) => [p.id, p]));

    return allProducts
      .filter((p) => p.isActive)
      .map((p) => {
        // 1) "86" manual gana sobre todo.
        if (p.soldOut) {
          return {
            productId: p.id,
            available: false,
            stock: p.directResale ? (prodStock.get(p.id) ?? 0) : null,
            reason: 'Agotado (manual)',
          };
        }

        // 2) Reventa directa: stock propio.
        if (p.directResale) {
          const stock = prodStock.get(p.id) ?? 0;
          return {
            productId: p.id,
            available: stock > 0,
            stock,
            reason: stock > 0 ? null : 'Sin stock',
          };
        }

        // 3) Combo: que alcance para armar al menos 1.
        if (p.isCombo) {
          const reason = this.evalComboShortages(
            p.comboComponents,
            graph,
            productById,
            ingStock,
            prodStock,
          );
          return { productId: p.id, available: reason === null, stock: null, reason };
        }

        // 4) Preparado: insumos de la receta base.
        const reason = this.evalRecipeShortages(p.id, p.name, graph, ingStock);
        return { productId: p.id, available: reason === null, stock: null, reason };
      });
  }

  /**
   * Expande la receta base de un preparado y verifica que cada insumo alcance
   * para ≥1 unidad. Devuelve el motivo ("Sin Pan, Papas") o null si disponible.
   * Sin receta definida → null (no se invalida; queda el "86" manual).
   */
  private evalRecipeShortages(
    productId: string,
    productName: string,
    graph: RecipeGraph,
    ingStock: Map<string, number>,
  ): string | null {
    const root: ParentRef = { kind: 'product', id: productId };
    let needs: ReturnType<typeof expandRecipe>;
    try {
      needs = expandRecipe(graph, root, 1);
    } catch (err) {
      // Receta rota (ciclo / nodo faltante): no bloqueamos la venta por eso.
      this.logger.warn(
        `Disponibilidad: receta inválida en "${productName}" (${productId}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
    if (needs.size === 0) return null;
    const missing: string[] = [];
    for (const ing of needs.values()) {
      const have = ingStock.get(ing.ingredientId) ?? 0;
      if (have + STOCK_EPSILON < ing.totalQuantity) missing.push(ing.name);
    }
    return missing.length > 0 ? `Sin ${missing.join(', ')}` : null;
  }

  /**
   * Verifica que un combo pueda armarse: agrega los insumos de los componentes
   * preparados y el stock de los componentes de reventa directa, todo escalado
   * por la cantidad de cada componente. Devuelve el motivo o null.
   */
  private evalComboShortages(
    components: { productId: string; quantity: number }[],
    graph: RecipeGraph,
    productById: Map<string, { name: string; directResale: boolean; soldOut: boolean }>,
    ingStock: Map<string, number>,
    prodStock: Map<string, number>,
  ): string | null {
    const aggIngredientNeeds = new Map<string, number>();
    const ingredientName = new Map<string, string>();
    const drNeeds = new Map<string, number>();

    for (const comp of components) {
      const cp = productById.get(comp.productId);
      if (!cp) return 'Combo mal configurado';
      if (cp.soldOut) return `Sin ${cp.name}`;
      if (cp.directResale) {
        drNeeds.set(comp.productId, (drNeeds.get(comp.productId) ?? 0) + comp.quantity);
        continue;
      }
      try {
        const needs = expandRecipe(
          graph,
          { kind: 'product', id: comp.productId },
          comp.quantity,
        );
        for (const ing of needs.values()) {
          aggIngredientNeeds.set(
            ing.ingredientId,
            (aggIngredientNeeds.get(ing.ingredientId) ?? 0) + ing.totalQuantity,
          );
          ingredientName.set(ing.ingredientId, ing.name);
        }
      } catch (err) {
        // Receta rota de un componente: no bloqueamos por eso.
        this.logger.warn(
          `Disponibilidad: receta inválida en componente "${cp.name}": ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    const missing: string[] = [];
    for (const [pid, qty] of drNeeds) {
      if ((prodStock.get(pid) ?? 0) + STOCK_EPSILON < qty) {
        missing.push(productById.get(pid)?.name ?? 'producto');
      }
    }
    for (const [ingId, qty] of aggIngredientNeeds) {
      if ((ingStock.get(ingId) ?? 0) + STOCK_EPSILON < qty) {
        missing.push(ingredientName.get(ingId) ?? 'insumo');
      }
    }
    return missing.length > 0 ? `Sin ${[...new Set(missing)].join(', ')}` : null;
  }

  /** Marca/desmarca un producto como agotado (86 manual). */
  async setSoldOut(id: string, soldOut: boolean): Promise<Product> {
    const exists = await this.prisma.product.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException(`Product ${id} not found`);
    const row = await this.prisma.product.update({
      where: { id },
      data: { soldOut },
      include: { sizes: true, modifiers: true, comboComponents: true },
    });
    return toProductDto(row);
  }

  async deactivate(id: string): Promise<Product> {
    const exists = await this.prisma.product.findUnique({ where: { id }, select: { id: true } });
    if (!exists) {
      throw new NotFoundException(`Product ${id} not found`);
    }
    const row = await this.prisma.product.update({
      where: { id },
      data: { isActive: false },
      include: { sizes: true, modifiers: true, comboComponents: true },
    });
    return toProductDto(row);
  }

  private async assertComboComponentsAreNonComboProducts(
    components: Array<{ productId: string }>,
  ): Promise<void> {
    if (components.length === 0) return;
    const ids = components.map((c) => c.productId);
    const found = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      select: { id: true, isCombo: true },
    });
    const missing = ids.filter((id) => !found.some((p) => p.id === id));
    if (missing.length > 0) {
      throw new BadRequestException(`Combo references missing products: ${missing.join(', ')}`);
    }
    const nestedCombo = found.find((p) => p.isCombo);
    if (nestedCombo) {
      throw new BadRequestException(`Combo cannot include another combo (${nestedCombo.id})`);
    }
  }
}

function toProductDto(row: ProductWithChildren): Product {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    basePrice: Number(row.basePrice),
    category: row.category,
    imageUrl: row.imageUrl,
    modifiersEnabled: row.modifiersEnabled,
    isCombo: row.isCombo,
    comboPrice: row.comboPrice !== null ? Number(row.comboPrice) : null,
    isActive: row.isActive,
    soldOut: row.soldOut,
    directResale: row.directResale,
    unitPurchase: row.unitPurchase,
    unitStock: row.unitStock,
    conversionFactor: row.conversionFactor !== null ? Number(row.conversionFactor) : null,
    thresholdMin: Number(row.thresholdMin),
    lastUnitCost: row.lastUnitCost !== null ? Number(row.lastUnitCost) : null,
    lastUnitCostDate: row.lastUnitCostDate?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    sizes: row.sizes.map(toSizeDto),
    modifiers: row.modifiers.map(toModifierDto),
    comboComponents: row.comboComponents.map(toComboComponentDto),
  };
}

function toSizeDto(row: { id: string; productId: string; name: string; priceModifier: Prisma.Decimal; sortOrder: number }): ProductSize {
  return {
    id: row.id,
    productId: row.productId,
    name: row.name,
    priceModifier: Number(row.priceModifier),
    sortOrder: row.sortOrder,
  };
}

function toModifierDto(row: { id: string; productId: string; name: string; priceDelta: Prisma.Decimal; recipeDelta: Prisma.JsonValue }): ProductModifier {
  return {
    id: row.id,
    productId: row.productId,
    name: row.name,
    priceDelta: Number(row.priceDelta),
    recipeDelta: row.recipeDelta,
  };
}

function toComboComponentDto(row: { id: string; comboId: string; productId: string; quantity: number }): ComboComponent {
  return {
    id: row.id,
    comboId: row.comboId,
    productId: row.productId,
    quantity: row.quantity,
  };
}

export { toProductDto };
