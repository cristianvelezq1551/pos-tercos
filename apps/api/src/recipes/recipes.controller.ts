import { Body, Controller, Get, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import {
  SetRecipeRequestSchema,
  type ExpandedCostResponse,
  type RecipeResponse,
  type SetRecipeRequest,
} from '@pos-tercos/types';
import { AdminAccess } from '../auth/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RecipesService } from './recipes.service';

@Controller()
export class RecipesController {
  constructor(private readonly recipes: RecipesService) {}

  @Get('products/:id/recipe')
  getProductRecipe(@Param('id', ParseUUIDPipe) id: string): Promise<RecipeResponse> {
    return this.recipes.getRecipe('product', id);
  }

  @AdminAccess()
  @Put('products/:id/recipe')
  setProductRecipe(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(SetRecipeRequestSchema)) body: SetRecipeRequest,
  ): Promise<RecipeResponse> {
    return this.recipes.setRecipe('product', id, body.edges);
  }

  @Get('subproducts/:id/recipe')
  getSubproductRecipe(@Param('id', ParseUUIDPipe) id: string): Promise<RecipeResponse> {
    return this.recipes.getRecipe('subproduct', id);
  }

  @AdminAccess()
  @Put('subproducts/:id/recipe')
  setSubproductRecipe(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(SetRecipeRequestSchema)) body: SetRecipeRequest,
  ): Promise<RecipeResponse> {
    return this.recipes.setRecipe('subproduct', id, body.edges);
  }

  @Get('products/:id/expanded-cost')
  expandedCost(@Param('id', ParseUUIDPipe) id: string): Promise<ExpandedCostResponse> {
    return this.recipes.expandedCost(id);
  }
}
