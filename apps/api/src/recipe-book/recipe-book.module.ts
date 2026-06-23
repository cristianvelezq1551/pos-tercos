import { Module } from '@nestjs/common';
import { RecipesModule } from '../recipes/recipes.module';
import { RecipeBookController } from './recipe-book.controller';
import { RecipeBookService } from './recipe-book.service';

@Module({
  imports: [RecipesModule],
  controllers: [RecipeBookController],
  providers: [RecipeBookService],
})
export class RecipeBookModule {}
