import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BusinessConfigController } from './business-config.controller';
import { BusinessConfigService } from './business-config.service';

/**
 * Config global del negocio. @Global para que los reportes inyecten el
 * servicio sin re-importar el módulo en cada lugar.
 */
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [BusinessConfigController],
  providers: [BusinessConfigService],
  exports: [BusinessConfigService],
})
export class BusinessConfigModule {}
