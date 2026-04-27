import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  ComboComponent,
  CreateProduct,
  Product,
  ProductModifier,
  ProductSize,
  UpdateProduct,
} from '@pos-tercos/types';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type ProductWithChildren = Prisma.ProductGetPayload<{
  include: {
    sizes: true;
    modifiers: true;
    comboComponents: true;
  };
}>;

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

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
