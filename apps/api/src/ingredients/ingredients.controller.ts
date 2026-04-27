import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UsePipes } from '@nestjs/common';
import {
  CreateIngredientSchema,
  UpdateIngredientSchema,
  type CreateIngredient,
  type Ingredient,
  type UpdateIngredient,
} from '@pos-tercos/types';
import { AdminAccess } from '../auth/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { IngredientsService } from './ingredients.service';

@Controller('ingredients')
export class IngredientsController {
  constructor(private readonly ingredients: IngredientsService) {}

  @Get()
  list(@Query('only_active') onlyActive?: string): Promise<Ingredient[]> {
    return this.ingredients.list({ onlyActive: onlyActive === 'true' });
  }

  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<Ingredient> {
    return this.ingredients.getById(id);
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

  @AdminAccess()
  @Delete(':id')
  deactivate(@Param('id', ParseUUIDPipe) id: string): Promise<Ingredient> {
    return this.ingredients.deactivate(id);
  }
}
