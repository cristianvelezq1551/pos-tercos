import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ModifierRecipeDeltaSchema } from '@pos-tercos/types';
import type {
  ComboComponent,
  CreateProduct,
  ModifierConsumption,
  Product,
  ProductAvailability,
  ProductModifier,
  ProductSize,
  SetComboComponents,
  SetProductOptions,
  UpdateProduct,
} from '@pos-tercos/types';
import {
  evaluateAvailability,
  serializeRecipeGraph,
  type AvailabilityProduct,
  type OfflineAvailabilitySnapshot,
  type RecipeGraph,
  type StorageProvider,
} from '@pos-tercos/domain';
import type { Prisma } from '@prisma/client';
import { assertNombreDisponible, conNombreUnico } from '../common/nombre-unico';
import { PrismaService } from '../prisma/prisma.service';
import { RecipesService } from '../recipes/recipes.service';
import { ProductCategoriesService } from '../product-categories/product-categories.service';
import { STORAGE_PROVIDER } from '../adapters/storage/storage.module';
import { mimeForExtension } from '../common/image-mime';
import { normalizePrepImages, toPrepImages } from '../common/prep-images';

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
    private readonly categories: ProductCategoriesService,
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
    // Una categoría desactivada oculta sus productos de los listados de VENTA
    // (only_active = caja/web). El admin sin only_active los sigue viendo.
    const hidden = opts.onlyActive ? await this.categories.inactiveNames() : null;
    const visible = hidden ? rows.filter((r) => !r.category || !hidden.has(r.category)) : rows;
    return visible.map(toProductDto);
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

  /**
   * Valida que cada consumo de modificador apunte a un insumo/subproducto
   * existente y activo. Sin FK (recipe_delta es JSON) — esta es la única
   * integridad referencial, por eso es obligatoria en cada escritura.
   */
  private async assertModifierConsumptions(
    modifiers: ReadonlyArray<{ name: string; recipeDelta?: ModifierConsumption[] }> | undefined,
  ): Promise<void> {
    const items = (modifiers ?? []).flatMap((m) =>
      (m.recipeDelta ?? []).map((c) => ({ modifierName: m.name, ...c })),
    );
    if (items.length === 0) return;
    const ingIds = items.filter((i) => i.childType === 'ingredient').map((i) => i.childId);
    const subIds = items.filter((i) => i.childType === 'subproduct').map((i) => i.childId);
    const [ings, subs] = await Promise.all([
      this.prisma.ingredient.findMany({
        where: { id: { in: ingIds }, isActive: true },
        select: { id: true },
      }),
      this.prisma.subproduct.findMany({
        where: { id: { in: subIds }, isActive: true },
        select: { id: true },
      }),
    ]);
    const found = new Set([...ings.map((x) => x.id), ...subs.map((x) => x.id)]);
    const missing = items.find((i) => !found.has(i.childId));
    if (missing) {
      throw new BadRequestException(
        `El extra "${missing.modifierName}" consume un ${missing.childType === 'ingredient' ? 'insumo' : 'subproducto'} inexistente o inactivo.`,
      );
    }
  }

  /** Busca un producto ACTIVO con ese nombre, sin distinguir mayúsculas. */
  private buscarActivoPorNombre = (nombre: string) =>
    this.prisma.product.findFirst({
      where: { name: { equals: nombre, mode: 'insensitive' as const }, isActive: true },
      select: { id: true },
    });

  async create(input: CreateProduct): Promise<Product> {
    await assertNombreDisponible(this.buscarActivoPorNombre, input.name, 'producto');
    await this.assertModifierConsumptions(input.modifiers);
    if (input.isCombo) {
      await this.assertComboComponentsAreNonComboProducts(input.comboComponents ?? []);
    }
    const category = await this.categories.resolveCanonicalName(input.category);
    const row = await conNombreUnico('producto', input.name, () =>
      this.prisma.product.create({
        data: {
          name: input.name,
          description: input.description ?? null,
          preparationSteps: input.preparationSteps ?? [],
          basePrice: input.basePrice,
          category,
          imageUrl: input.imageUrl ?? null,
          prepImages: normalizePrepImages(input.prepImages ?? []),
          emoji: input.emoji?.trim() || null,
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
                  recipeDelta: (m.recipeDelta ?? []) as unknown as Prisma.InputJsonValue,
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
      }),
    );
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
      throw new BadRequestException('Un combo necesita un precio de combo.');
    }
    if (!nextIsCombo && nextComboPrice !== null && nextComboPrice !== undefined) {
      throw new BadRequestException('Solo los combos llevan precio de combo.');
    }

    // Normaliza la categoría contra el catálogo curado (evita duplicados por tipeo).
    const category =
      input.category !== undefined
        ? await this.categories.resolveCanonicalName(input.category)
        : undefined;

    // Reactivar también compite por el nombre: uno dormido no estorba, pero al
    // volver a la vida choca con el que ocupó su lugar.
    if (input.name !== undefined || input.isActive === true) {
      await assertNombreDisponible(
        this.buscarActivoPorNombre,
        input.name ?? existing.name,
        'producto',
        id,
      );
    }
    const row = await conNombreUnico('producto', input.name ?? existing.name, () =>
      this.prisma.product.update({
        where: { id },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.description !== undefined && { description: input.description }),
          ...(input.preparationSteps !== undefined && { preparationSteps: input.preparationSteps }),
          ...(input.basePrice !== undefined && { basePrice: input.basePrice }),
          ...(category !== undefined && { category }),
          ...(input.imageUrl !== undefined && { imageUrl: input.imageUrl }),
          ...(input.prepImages !== undefined && {
            prepImages: normalizePrepImages(input.prepImages),
          }),
          ...(input.emoji !== undefined && { emoji: input.emoji?.trim() || null }),
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
      }),
    );
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
    await this.assertModifierConsumptions(input.modifiers);
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
          throw new BadRequestException(`Una de las variantes no pertenece a este producto.`);
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
            recipeDelta: (m.recipeDelta ?? []) as unknown as Prisma.InputJsonValue,
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
  /** SIEMPRE fresco. Lo usa el endpoint INTERNO (cajero) y el snapshot offline,
   *  donde reponer stock / agotar debe reflejarse al instante. */
  async getAvailability(): Promise<ProductAvailability[]> {
    return evaluateAvailability(await this.loadAvailabilityData());
  }

  /**
   * §2.8: variante con caché TTL corto para el endpoint `@Public` (web).
   * `loadAvailabilityData` hace 3 groupBy FULL-TABLE sobre inventory_movements
   * (insert-only → crece para siempre) + el grafo de recetas. El público lo
   * pollea cualquier cliente anónimo → sin caché, a 12-18 meses de historia cada
   * hit son 3 seq-scans que degradan el API entero. Memoizar la PROMESA dedupe
   * además los hits concurrentes. El cajero (interno) NO pasa por acá → ve el
   * cambio al instante; la web tolera ≤ TTL de staleness (86/forzado invalidan).
   */
  async getAvailabilityCached(): Promise<ProductAvailability[]> {
    const now = Date.now();
    if (this.availabilityCache && now - this.availabilityCache.at < ProductsService.AVAILABILITY_TTL_MS) {
      return this.availabilityCache.promise;
    }
    const promise = this.getAvailability();
    this.availabilityCache = { promise, at: now };
    // No cachear un error: si falla, limpiar para reintentar en el próximo hit.
    void promise.catch(() => {
      if (this.availabilityCache?.promise === promise) this.availabilityCache = null;
    });
    return promise;
  }

  private static readonly AVAILABILITY_TTL_MS = 15_000;
  private availabilityCache: { promise: Promise<ProductAvailability[]>; at: number } | null = null;

  /** Invalida el caché público de disponibilidad (86 manual / forzar disponible
   *  se reflejan en la web al instante; ventas/producciones, dentro del TTL). */
  private invalidateAvailability(): void {
    this.availabilityCache = null;
  }

  /** Productos + stock (productos/insumos/subproductos) + grafo (sin N+1). */
  private async loadAvailabilityData(): Promise<{
    products: AvailabilityProduct[];
    graph: RecipeGraph;
    productStock: Map<string, number>;
    ingredientStock: Map<string, number>;
    subproductStock: Map<string, number>;
  }> {
    const [allProducts, prodStockRows, ingStockRows, subStockRows, graph] = await Promise.all([
      this.prisma.product.findMany({
        select: {
          id: true,
          name: true,
          isActive: true,
          directResale: true,
          isCombo: true,
          soldOut: true,
          forceAvailable: true,
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
      this.prisma.inventoryMovement.groupBy({
        by: ['subproductId'],
        where: { entityType: 'SUBPRODUCT' },
        _sum: { delta: true },
      }),
      this.recipes.loadFullGraph(),
    ]);

    const productStock = new Map<string, number>();
    for (const r of prodStockRows) {
      if (r.productId) productStock.set(r.productId, Number(r._sum.delta ?? 0));
    }
    const ingredientStock = new Map<string, number>();
    for (const r of ingStockRows) {
      if (r.ingredientId) ingredientStock.set(r.ingredientId, Number(r._sum.delta ?? 0));
    }
    const subproductStock = new Map<string, number>();
    for (const r of subStockRows) {
      if (r.subproductId) subproductStock.set(r.subproductId, Number(r._sum.delta ?? 0));
    }
    return { products: allProducts, graph, productStock, ingredientStock, subproductStock };
  }

  /** Snapshot serializable para calcular disponibilidad OFFLINE (B.2.2). */
  async getOfflineSnapshot(): Promise<OfflineAvailabilitySnapshot> {
    const { products, graph, productStock, ingredientStock, subproductStock } =
      await this.loadAvailabilityData();
    return {
      products,
      graph: serializeRecipeGraph(graph),
      productStock: Object.fromEntries(productStock),
      ingredientStock: Object.fromEntries(ingredientStock),
      subproductStock: Object.fromEntries(subproductStock),
      asOf: new Date().toISOString(),
    };
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
      // 86 y forzado son excluyentes: agotar a mano limpia el forzado.
      data: { soldOut, ...(soldOut ? { forceAvailable: false } : {}) },
      include: { sizes: true, modifiers: true, comboComponents: true },
    });
    this.invalidateAvailability();
    return toProductDto(row);
  }

  /**
   * Fuerza (o revierte) que un producto sea vendible aunque su stock de
   * insumos/subproductos no alcance en el sistema. Excluyente con soldOut:
   * forzar limpia el 86 manual.
   */
  async setForceAvailable(id: string, forceAvailable: boolean): Promise<Product> {
    const exists = await this.prisma.product.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException(`Product ${id} not found`);
    const row = await this.prisma.product.update({
      where: { id },
      data: { forceAvailable, ...(forceAvailable ? { soldOut: false } : {}) },
      include: { sizes: true, modifiers: true, comboComponents: true },
    });
    this.invalidateAvailability();
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

  /**
   * Elimina DEFINITIVAMENTE el producto. Solo si NO tiene historial operativo:
   * cero ventas, cero movimientos de inventario, cero facturas, y no es
   * componente de ningún combo. Cascada: borra su propia receta, sizes,
   * modifiers, combo_components (donde es el combo), promotion_products,
   * supplier_products. Si tiene historial → 409 guiando a "Desactivar".
   */
  async remove(id: string): Promise<void> {
    const exists = await this.prisma.product.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException(`Product ${id} not found`);
    const [saleCount, partOfCombo, moveCount, invoiceCount] = await Promise.all([
      this.prisma.saleItem.count({ where: { productId: id } }),
      this.prisma.comboComponent.count({ where: { productId: id } }),
      this.prisma.inventoryMovement.count({ where: { productId: id } }),
      this.prisma.invoiceItem.count({ where: { productId: id } }),
    ]);
    if (saleCount > 0 || partOfCombo > 0 || moveCount > 0 || invoiceCount > 0) {
      throw new ConflictException(
        'No se puede eliminar: el producto tiene historial (ventas, movimientos, facturas) o forma parte de un combo. Usa "Desactivar" para inactivarlo conservando el historial.',
      );
    }
    await this.prisma.$transaction([
      this.prisma.recipeEdge.deleteMany({ where: { parentProductId: id } }),
      this.prisma.productSize.deleteMany({ where: { productId: id } }),
      this.prisma.productModifier.deleteMany({ where: { productId: id } }),
      this.prisma.comboComponent.deleteMany({ where: { comboId: id } }),
      this.prisma.promotionProduct.deleteMany({ where: { productId: id } }),
      this.prisma.supplierProduct.deleteMany({ where: { productId: id } }),
      this.prisma.product.delete({ where: { id } }),
    ]);
  }

  private async assertComboComponentsAreNonComboProducts(
    components: Array<{ productId: string }>,
  ): Promise<void> {
    if (components.length === 0) return;
    const ids = components.map((c) => c.productId);
    const found = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, isCombo: true },
    });
    const missing = ids.filter((id) => !found.some((p) => p.id === id));
    if (missing.length > 0) {
      throw new BadRequestException(`El combo incluye productos que ya no existen en el catálogo.`);
    }
    const nestedCombo = found.find((p) => p.isCombo);
    if (nestedCombo) {
      throw new BadRequestException(`Un combo no puede incluir otro combo ("${nestedCombo.name}").`);
    }
  }
}

function toProductDto(row: ProductWithChildren): Product {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    preparationSteps: row.preparationSteps,
    basePrice: Number(row.basePrice),
    category: row.category,
    imageUrl: row.imageUrl,
    prepImages: toPrepImages(row.prepImages),
    emoji: row.emoji,
    modifiersEnabled: row.modifiersEnabled,
    isCombo: row.isCombo,
    comboPrice: row.comboPrice !== null ? Number(row.comboPrice) : null,
    isActive: row.isActive,
    soldOut: row.soldOut,
    forceAvailable: row.forceAvailable,
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
    // Legacy: filas viejas tienen '{}' — todo lo que no parsee es lista vacía.
    recipeDelta: ModifierRecipeDeltaSchema.catch([]).parse(row.recipeDelta),
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
