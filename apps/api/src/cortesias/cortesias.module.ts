import { Module } from '@nestjs/common';
import { RecipesModule } from '../recipes/recipes.module';
import { SalesModule } from '../sales/sales.module';
import { CortesiasController } from './cortesias.controller';
import { CortesiasService } from './cortesias.service';

@Module({
  imports: [RecipesModule, SalesModule],
  controllers: [CortesiasController],
  providers: [CortesiasService],
})
export class CortesiasModule {}
