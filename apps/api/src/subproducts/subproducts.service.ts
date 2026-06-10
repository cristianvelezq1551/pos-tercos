import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateSubproduct, Subproduct, UpdateSubproduct } from '@pos-tercos/types';
import type { Subproduct as DbSubproduct, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SubproductsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(opts: { onlyActive?: boolean } = {}): Promise<Subproduct[]> {
    const where: Prisma.SubproductWhereInput = {};
    if (opts.onlyActive) where.isActive = true;
    const rows = await this.prisma.subproduct.findMany({ where, orderBy: { name: 'asc' } });
    return rows.map(toSubproductDto);
  }

  async getById(id: string): Promise<Subproduct> {
    const row = await this.prisma.subproduct.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException(`Subproduct ${id} not found`);
    }
    return toSubproductDto(row);
  }

  async create(input: CreateSubproduct): Promise<Subproduct> {
    const row = await this.prisma.subproduct.create({
      data: {
        name: input.name,
        yield: input.yield,
        unit: input.unit ?? 'unidad',
        thresholdMin: input.thresholdMin ?? 0,
      },
    });
    return toSubproductDto(row);
  }

  async update(id: string, input: UpdateSubproduct): Promise<Subproduct> {
    await this.assertExists(id);
    const row = await this.prisma.subproduct.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.yield !== undefined && { yield: input.yield }),
        ...(input.unit !== undefined && { unit: input.unit }),
        ...(input.thresholdMin !== undefined && { thresholdMin: input.thresholdMin }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
    });
    return toSubproductDto(row);
  }

  async deactivate(id: string): Promise<Subproduct> {
    await this.assertExists(id);
    const row = await this.prisma.subproduct.update({
      where: { id },
      data: { isActive: false },
    });
    return toSubproductDto(row);
  }

  /**
   * Elimina DEFINITIVAMENTE el subproducto. Bloqueado por dos razones:
   *  - usado como child en otra receta → 409 (quitarlo primero)
   *  - tiene movements de inventario (producción/venta) → 409 (usar Desactivar)
   * Cascada: borra su propia receta (recipe_edges donde es parent).
   */
  async remove(id: string): Promise<void> {
    await this.assertExists(id);
    const [usedAsChild, hasMovements] = await Promise.all([
      this.prisma.recipeEdge.count({ where: { childSubproductId: id } }),
      this.prisma.inventoryMovement.count({ where: { subproductId: id } }),
    ]);
    if (usedAsChild > 0) {
      throw new ConflictException(
        'No se puede eliminar: el subproducto se usa en la receta de otro producto o subproducto. Quítalo de esas recetas primero, o usa "Desactivar".',
      );
    }
    if (hasMovements > 0) {
      throw new ConflictException(
        'No se puede eliminar: el subproducto tiene historial de movimientos (producción/venta). Usá "Desactivar" para sacarlo del catálogo sin perder la trazabilidad.',
      );
    }
    await this.prisma.$transaction([
      this.prisma.recipeEdge.deleteMany({ where: { parentSubproductId: id } }),
      this.prisma.subproduct.delete({ where: { id } }),
    ]);
  }

  private async assertExists(id: string): Promise<void> {
    const exists = await this.prisma.subproduct.findUnique({ where: { id }, select: { id: true } });
    if (!exists) {
      throw new NotFoundException(`Subproduct ${id} not found`);
    }
  }
}

function toSubproductDto(row: DbSubproduct): Subproduct {
  return {
    id: row.id,
    name: row.name,
    yield: Number(row.yield),
    unit: row.unit,
    thresholdMin: Number(row.thresholdMin),
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export { toSubproductDto };
