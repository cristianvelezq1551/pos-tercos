import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UsePipes } from '@nestjs/common';
import {
  CreateIngredientSchema,
  UpdateIngredientSchema,
  type CreateIngredient,
  type Ingredient,
  type JwtAccessPayload,
  type UpdateIngredient,
} from '@pos-tercos/types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminAccess, OnlyDueno } from '../auth/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { IngredientsService } from './ingredients.service';

/** Roles que pueden ver el costo de compra (mismo criterio que /products). */
const COST_ROLES = new Set(['ADMIN_OPERATIVO', 'DUENO']);

/**
 * Oculta el costo de compra a roles que no son admin/dueño (cajero/cocinero
 * necesitan el insumo — recetas, biblia, stock — pero el costo es información
 * financiera del negocio; espejo de `stripCostForRole` de products).
 */
function stripCostForRole(i: Ingredient, role: string): Ingredient {
  if (COST_ROLES.has(role)) return i;
  return { ...i, lastUnitCost: null, lastUnitCostDate: null };
}

@Controller('ingredients')
export class IngredientsController {
  constructor(private readonly ingredients: IngredientsService) {}

  @Get()
  async list(
    @CurrentUser() user: JwtAccessPayload,
    @Query('only_active') onlyActive?: string,
  ): Promise<Ingredient[]> {
    const rows = await this.ingredients.list({ onlyActive: onlyActive === 'true' });
    return rows.map((i) => stripCostForRole(i, user.role));
  }

  @Get(':id')
  async getById(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Ingredient> {
    return stripCostForRole(await this.ingredients.getById(id), user.role);
  }

  @AdminAccess()
  @Post()
  @UsePipes(new ZodValidationPipe(CreateIngredientSchema))
  create(@Body() body: CreateIngredient): Promise<Ingredient> {
    return this.ingredients.create(body);
  }

  @AdminAccess()
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateIngredientSchema)) body: UpdateIngredient,
  ): Promise<Ingredient> {
    return this.ingredients.update(id, body);
  }

  /** Desactiva (soft): el insumo queda inactivo conservando todo el historial. */
  @AdminAccess()
  @Post(':id/deactivate')
  deactivate(@Param('id', ParseUUIDPipe) id: string): Promise<Ingredient> {
    return this.ingredients.deactivate(id);
  }

  /** Elimina DEFINITIVAMENTE — Dueño-only (acción destructiva). */
  @OnlyDueno()
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.ingredients.remove(id);
  }
}
