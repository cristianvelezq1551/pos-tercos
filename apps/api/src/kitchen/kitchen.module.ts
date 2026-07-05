import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { UsersModule } from '../users/users.module';
import { KitchenChecklistService } from './kitchen-checklist.service';
import { KitchenController } from './kitchen.controller';
import { KitchenIncidentsService } from './kitchen-incidents.service';
import { KitchenInventoryService } from './kitchen-inventory.service';

/**
 * App de cocina (cocinero): inventario (ver stock sin costos + merma + conteo
 * ciego), bitácora de incidencias y checklist de apertura/cierre. La biblia y
 * la producción de subproductos viven en sus propios módulos (recipe-book,
 * subproducts) y ya son @KitchenAccess.
 */
@Module({
  imports: [InventoryModule, UsersModule],
  controllers: [KitchenController],
  providers: [KitchenInventoryService, KitchenIncidentsService, KitchenChecklistService],
})
export class KitchenModule {}
