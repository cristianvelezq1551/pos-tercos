import { Global, Module } from '@nestjs/common';
import { PublicDisplayController } from './public-display.controller';
import { PublicDisplayService } from './public-display.service';

@Global()
@Module({
  controllers: [PublicDisplayController],
  providers: [PublicDisplayService],
  exports: [PublicDisplayService],
})
export class PublicDisplayModule {}
