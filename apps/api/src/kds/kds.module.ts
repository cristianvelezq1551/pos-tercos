import { forwardRef, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SalesModule } from '../sales/sales.module';
import { KdsController } from './kds.controller';
import { KdsGateway } from './kds.gateway';
import { KdsService } from './kds.service';

@Module({
  imports: [AuthModule, forwardRef(() => SalesModule)],
  controllers: [KdsController],
  providers: [KdsService, KdsGateway],
  exports: [KdsGateway],
})
export class KdsModule {}
