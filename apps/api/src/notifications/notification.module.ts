import { Global, Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { OwnerNotificationService } from './owner-notification.service';
import { PushController } from './push.controller';
import { PushSubscriptionsService } from './push-subscriptions.service';

/**
 * @Global para que SalesService inyecte NotificationService
 * sin importarlo en cada módulo. WHATSAPP_PROVIDER (WhatsAppModule global)
 * y PrismaService (PrismaModule global) se resuelven globalmente.
 */
@Global()
@Module({
  controllers: [PushController],
  providers: [NotificationService, OwnerNotificationService, PushSubscriptionsService],
  exports: [NotificationService, OwnerNotificationService, PushSubscriptionsService],
})
export class NotificationModule {}
