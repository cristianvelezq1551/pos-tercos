import { Module } from '@nestjs/common';
import { SubproductsController } from './subproducts.controller';
import { SubproductsService } from './subproducts.service';

@Module({
  controllers: [SubproductsController],
  providers: [SubproductsService],
  exports: [SubproductsService],
})
export class SubproductsModule {}
