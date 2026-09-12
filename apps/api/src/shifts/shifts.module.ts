import { Module } from '@nestjs/common';
import { RecipesModule } from '../recipes/recipes.module';
import { TreasuryModule } from '../treasury/treasury.module';
import { ShiftsController } from './shifts.controller';
import { ShiftsService } from './shifts.service';

@Module({
  imports: [RecipesModule, TreasuryModule],
  controllers: [ShiftsController],
  providers: [ShiftsService],
  exports: [ShiftsService],
})
export class ShiftsModule {}
