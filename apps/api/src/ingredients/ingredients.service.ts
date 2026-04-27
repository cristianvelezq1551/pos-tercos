import { Injectable, NotFoundException } from '@nestjs/common';
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
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
