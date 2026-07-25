import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateProductCategory,
  ProductCategory,
  UpdateProductCategory,
} from '@pos-tercos/types';
import type { ProductCategory as ProductCategoryRow } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProductCategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(opts: { onlyActive?: boolean } = {}): Promise<ProductCategory[]> {
    const rows = await this.prisma.productCategory.findMany({
      where: opts.onlyActive ? { isActive: true } : undefined,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    const counts = await this.countByName();
    return rows.map((r) => toDto(r, counts.get(r.name) ?? 0));
  }

  async create(input: CreateProductCategory, actorId: string): Promise<ProductCategory> {
    const name = input.name.trim();
    await this.assertNameFree(name, null);
    const sortOrder =
      input.sortOrder ??
      (await this.prisma.productCategory.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ??
      -1;
    const row = await this.prisma.productCategory.create({
      data: { name, sortOrder: input.sortOrder ?? sortOrder + 1 },
    });
    await this.audit.log({
      userId: actorId,
      action: 'PRODUCT_CATEGORY_CREATED',
      entityType: 'product_category',
      entityId: row.id,
      metadata: { name },
    });
    return toDto(row, 0);
  }

  async update(
    id: string,
    input: UpdateProductCategory,
    actorId: string,
  ): Promise<ProductCategory> {
    const existing = await this.prisma.productCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`ProductCategory ${id} not found`);

    const nextName = input.name?.trim();
    const renaming = nextName !== undefined && nextName !== existing.name;
    if (renaming) await this.assertNameFree(nextName!, id);

    // Renombrar cascada a los productos: guardan el NOMBRE, no un FK.
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.productCategory.update({
        where: { id },
        data: {
          ...(nextName !== undefined && { name: nextName }),
          ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
          ...(input.isActive !== undefined && { isActive: input.isActive }),
        },
      });
      if (renaming) {
        await tx.product.updateMany({
          where: { category: existing.name },
          data: { category: nextName },
        });
      }
      return updated;
    });

    await this.audit.log({
      userId: actorId,
      action: 'PRODUCT_CATEGORY_UPDATED',
      entityType: 'product_category',
      entityId: id,
      metadata: renaming
        ? { renamedFrom: existing.name, renamedTo: nextName }
        : { name: existing.name, sortOrder: input.sortOrder, isActive: input.isActive },
    });
    const count = await this.countForName(row.name);
    return toDto(row, count);
  }

  async remove(id: string, actorId: string): Promise<void> {
    const existing = await this.prisma.productCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`ProductCategory ${id} not found`);
    const inUse = await this.countForName(existing.name);
    if (inUse > 0) {
      throw new ConflictException(
        `No se puede borrar "${existing.name}": ${inUse} producto(s) la usan. Reasigna esos productos o desactiva la categoría.`,
      );
    }
    await this.prisma.productCategory.delete({ where: { id } });
    await this.audit.log({
      userId: actorId,
      action: 'PRODUCT_CATEGORY_DELETED',
      entityType: 'product_category',
      entityId: id,
      metadata: { name: existing.name },
    });
  }

  /**
   * Normaliza el nombre de categoría de un producto contra el catálogo curado:
   * - vacío/null → null (producto sin categoría).
   * - match case-insensitive → devuelve el nombre CANÓNICO guardado (evita
   *   duplicados por mayúsculas/tildes de tipeo).
   * - sin match → 400 (no se crean categorías nuevas por tipeo desde el producto).
   */
  async resolveCanonicalName(name: string | null | undefined): Promise<string | null> {
    const trimmed = name?.trim();
    if (!trimmed) return null;
    const match = await this.prisma.productCategory.findFirst({
      where: { name: { equals: trimmed, mode: 'insensitive' } },
    });
    if (!match) {
      throw new BadRequestException(
        `La categoría "${trimmed}" no existe. Créala primero en Categorías.`,
      );
    }
    return match.name;
  }

  private async assertNameFree(name: string, exceptId: string | null): Promise<void> {
    const clash = await this.prisma.productCategory.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
    });
    if (clash) {
      throw new ConflictException(`Ya existe la categoría "${clash.name}".`);
    }
  }

  private async countForName(name: string): Promise<number> {
    return this.prisma.product.count({ where: { category: name } });
  }

  private async countByName(): Promise<Map<string, number>> {
    const grouped = await this.prisma.product.groupBy({
      by: ['category'],
      where: { category: { not: null } },
      _count: { _all: true },
    });
    const map = new Map<string, number>();
    for (const g of grouped) {
      if (g.category) map.set(g.category, g._count._all);
    }
    return map;
  }
}

function toDto(row: ProductCategoryRow, productCount: number): ProductCategory {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    productCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
