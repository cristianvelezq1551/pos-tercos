import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { CashDrawerModule } from './adapters/cash-drawer/cash-drawer.module';
import { LLMModule } from './adapters/llm/llm.module';
import { PrinterModule } from './adapters/printer/printer.module';
import { StorageModule } from './adapters/storage/storage.module';
import { WhatsAppModule } from './adapters/whatsapp/whatsapp.module';
import { NotificationModule } from './notifications/notification.module';
import { ApprovalsModule } from './approvals/approvals.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { IdempotencyModule } from './common/idempotency/idempotency.module';
import { HealthController } from './health/health.controller';
import { IngredientsModule } from './ingredients/ingredients.module';
import { InventoryModule } from './inventory/inventory.module';
import { InvoicesModule } from './invoices/invoices.module';
import { KdsModule } from './kds/kds.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { PromotionsModule } from './promotions/promotions.module';
import { PublicDisplayModule } from './public-display/public-display.module';
import { PurchaseSuggestionsModule } from './purchase-suggestions/purchase-suggestions.module';
import { WorkersModule } from './workers/workers.module';
import { RecipesModule } from './recipes/recipes.module';
import { ReportsModule } from './reports/reports.module';
import { SalesModule } from './sales/sales.module';
import { ShiftsModule } from './shifts/shifts.module';
import { SubproductsModule } from './subproducts/subproducts.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { UsersModule } from './users/users.module';
import { WebMenuModule } from './web-menu/web-menu.module';
import { WebOrdersModule } from './web-orders/web-orders.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    AuditModule,
    StorageModule,
    LLMModule,
    PrinterModule,
    CashDrawerModule,
    WhatsAppModule,
    NotificationModule,
    IdempotencyModule,
    ApprovalsModule,
    UsersModule,
    AuthModule,
    IngredientsModule,
    SubproductsModule,
    ProductsModule,
    RecipesModule,
    PromotionsModule,
    InventoryModule,
    SuppliersModule,
    InvoicesModule,
    ShiftsModule,
    SalesModule,
    KdsModule,
    PublicDisplayModule,
    WebMenuModule,
    WebOrdersModule,
    ReportsModule,
    PurchaseSuggestionsModule,
    WorkersModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
