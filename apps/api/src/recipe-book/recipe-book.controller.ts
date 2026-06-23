import { Controller, Get } from '@nestjs/common';
import type { RecipeBookResponse } from '@pos-tercos/types';
import { KitchenAccess } from '../auth/decorators/roles.decorator';
import { RecipeBookService } from './recipe-book.service';

/** Biblia de productos para el KDS (cocinero). */
@Controller('recipe-book')
export class RecipeBookController {
  constructor(private readonly recipeBook: RecipeBookService) {}

  @KitchenAccess()
  @Get()
  get(): Promise<RecipeBookResponse> {
    return this.recipeBook.getRecipeBook();
  }
}
