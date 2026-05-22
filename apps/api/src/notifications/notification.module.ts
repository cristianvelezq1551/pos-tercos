import { Global, Module } from '@nestjs/common';
import { NotificationService } from './notification.service';

/**
 * @Global para que SalesService/KdsService inyecten NotificationService
 * sin importarlo en cada módulo. WHATSAPP_PROVIDER (WhatsAppModule global)
 * y PrismaService (PrismaModule global) se resuelven globalmente.
 */
@Global()
@Module({
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
