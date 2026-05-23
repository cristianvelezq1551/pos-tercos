import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  ComboComponent,
  CreateProduct,
  Product,
  ProductModifier,
  ProductSize,
  SetComboComponents,
  SetProductOptions,
  UpdateProduct,
} from '@pos-tercos/types';
import type { StorageProvider } from '@pos-tercos/domain';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_PROVIDER } from '../adapters/storage/storage.module';
import { mimeForExtension } from '../common/image-mime';

type ProductWithChildren = Prisma.ProductGetPayload<{
  include: {
    sizes: true;
    modifiers: true;
    comboComponents: true;
  };
}>;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
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
