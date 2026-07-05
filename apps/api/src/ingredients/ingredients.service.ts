import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateIngredient, Ingredient, UpdateIngredient } from '@pos-tercos/types';
import type { Ingredient as DbIngredient, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class IngredientsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(opts: { onlyActive?: boolean; lowStock?: boolean } = {}): Promise<Ingredient[]> {
    const where: Prisma.IngredientWhereInput = {};
    if (opts.onlyActive) where.isActive = true;
    const rows = await this.prisma.ingredient.findMany({
      where,
      orderBy: { name: 'asc' },
    });
    return rows.map(toIngredientDto);
  }

  async getById(id: string): Promise<Ingredient> {
    const row = await this.prisma.ingredient.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException(`Ingredient ${id} not found`);
    }
    return toIngredientDto(row);
  }

  async create(input: CreateIngredient): Promise<Ingredient> {
    const row = await this.prisma.ingredient.create({
      data: {
        name: input.name,
        unitPurchase: input.unitPurchase,
        unitRecipe: input.unitRecipe,
        conversionFactor: input.conversionFactor,
        thresholdMin: input.thresholdMin ?? 0,
        portionSize: input.portionSize ?? null,
      },
    });
    return toIngredientDto(row);
  }

  async update(id: string, input: UpdateIngredient): Promise<Ingredient> {
    await this.assertExists(id);
    const row = await this.prisma.ingredient.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.unitPurchase !== undefined && { unitPurchase: input.unitPurchase }),
        ...(input.unitRecipe !== undefined && { unitRecipe: input.unitRecipe }),
        ...(input.conversionFactor !== undefined && { conversionFactor: input.conversionFactor }),
        ...(input.thresholdMin !== undefined && { thresholdMin: input.thresholdMin }),
        ...(input.portionSize !== undefined && { portionSize: input.portionSize }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
    });
    return toIngredientDto(row);
  }

  async deactivate(id: string): Promise<Ingredient> {
    await this.assertExists(id);
    const row = await this.prisma.ingredient.update({
      where: { id },
      data: { isActive: false },
    });
    return toIngredientDto(row);
  }

  /**
   * Elimina DEFINITIVAMENTE el insumo. Solo si no fue usado nunca:
   * sin recetas, sin movimientos de inventario, sin facturas. Si tiene
   * historial → 409 con mensaje guiando a "Desactivar" (preserva historia).
   * Cascada: borra supplier_products y purchase_suggestions ligados.
   */
  async remove(id: string): Promise<void> {
    await this.assertExists(id);
    const [recipeCount, moveCount, invoiceCount] = await Promise.all([
      this.prisma.recipeEdge.count({ where: { childIngredientId: id } }),
      this.prisma.inventoryMovement.count({ where: { ingredientId: id } }),
      this.prisma.invoiceItem.count({ where: { ingredientId: id } }),
    ]);
    if (recipeCount > 0 || moveCount > 0 || invoiceCount > 0) {
      throw new ConflictException(
        'No se puede eliminar: el insumo está en uso (recetas, movimientos de inventario o facturas). Usa "Desactivar" para inactivarlo conservando el historial.',
      );
    }
    await this.prisma.$transaction([
      this.prisma.supplierProduct.deleteMany({ where: { ingredientId: id } }),
      this.prisma.purchaseSuggestion.deleteMany({ where: { ingredientId: id } }),
      this.prisma.ingredient.delete({ where: { id } }),
    ]);
  }

  private async assertExists(id: string): Promise<void> {
    const exists = await this.prisma.ingredient.findUnique({ where: { id }, select: { id: true } });
    if (!exists) {
      throw new NotFoundException(`Ingredient ${id} not found`);
    }
  }
}

function toIngredientDto(row: DbIngredient): Ingredient {
  return {
    id: row.id,
    name: row.name,
    unitPurchase: row.unitPurchase,
    unitRecipe: row.unitRecipe,
    conversionFactor: Number(row.conversionFactor),
    thresholdMin: Number(row.thresholdMin),
    portionSize: row.portionSize !== null ? Number(row.portionSize) : null,
    lastUnitCost: row.lastUnitCost !== null ? Number(row.lastUnitCost) : null,
    lastUnitCostDate: row.lastUnitCostDate?.toISOString() ?? null,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
