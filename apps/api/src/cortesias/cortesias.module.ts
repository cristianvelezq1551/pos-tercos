import { Module } from '@nestjs/common';
import { RecipesModule } from '../recipes/recipes.module';
import { ReportsModule } from '../reports/reports.module';
import { SalesModule } from '../sales/sales.module';
import { CortesiasController } from './cortesias.controller';
import { CortesiaPrintService } from './cortesia-print.service';
import { CortesiasService } from './cortesias.service';

@Module({
  imports: [RecipesModule, SalesModule, ReportsModule],
  controllers: [CortesiasController],
  providers: [CortesiasService, CortesiaPrintService],
})
export class CortesiasModule {}
