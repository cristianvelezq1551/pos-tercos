import { Body, Controller, Get, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import {
  SetRecipeRequestSchema,
  type ExpandedCostResponse,
  type RecipeResponse,
  type SetRecipeRequest,
  type SubproductCostSummary,
} from '@pos-tercos/types';
import { OnlyDueno } from '../auth/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RecipesService } from './recipes.service';

@Controller()
export class RecipesController {
  constructor(private readonly recipes: RecipesService) {}

  @Get('products/:id/recipe')
  getProductRecipe(@Param('id', ParseUUIDPipe) id: string): Promise<RecipeResponse> {
    return this.recipes.getRecipe('product', id);
  }

  @OnlyDueno()
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

  @OnlyDueno()
  @Put('subproducts/:id/recipe')
  setSubproductRecipe(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(SetRecipeRequestSchema)) body: SetRecipeRequest,
  ): Promise<RecipeResponse> {
    return this.recipes.setRecipe('subproduct', id, body.edges);
  }

  @Get('products/:id/sizes/:sizeId/recipe')
  getSizeRecipe(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sizeId', ParseUUIDPipe) sizeId: string,
  ): Promise<RecipeResponse> {
    return this.recipes.getSizeRecipe(id, sizeId);
  }

  @OnlyDueno()
  @Put('products/:id/sizes/:sizeId/recipe')
  setSizeRecipe(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sizeId', ParseUUIDPipe) sizeId: string,
    @Body(new ZodValidationPipe(SetRecipeRequestSchema)) body: SetRecipeRequest,
  ): Promise<RecipeResponse> {
    return this.recipes.setSizeRecipe(id, sizeId, body.edges);
  }

  @Get('products/:id/expanded-cost')
  expandedCost(@Param('id', ParseUUIDPipe) id: string): Promise<ExpandedCostResponse> {
    return this.recipes.expandedCost(id);
  }

  @Get('products/:id/sizes/:sizeId/expanded-cost')
  expandedSizeCost(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sizeId', ParseUUIDPipe) sizeId: string,
  ): Promise<ExpandedCostResponse> {
    return this.recipes.expandedCost(id, sizeId);
  }

  @Get('subproducts/:id/expanded-cost')
  expandedSubproductCost(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ExpandedCostResponse> {
    return this.recipes.expandedSubproductCost(id);
  }

  // Ruta top-level (no bajo /subproducts) para no chocar con `subproducts/:id`.
  @Get('subproduct-costs')
  subproductCosts(): Promise<SubproductCostSummary[]> {
    return this.recipes.listSubproductCosts();
  }
}
