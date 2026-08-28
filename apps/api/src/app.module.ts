import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { GuiaModule } from './guia/guia.module';
import { CashDrawerModule } from './adapters/cash-drawer/cash-drawer.module';
import { LLMModule } from './adapters/llm/llm.module';
import { PrinterModule } from './adapters/printer/printer.module';
import { StorageModule } from './adapters/storage/storage.module';
import { WhatsAppModule } from './adapters/whatsapp/whatsapp.module';
import { NotificationModule } from './notifications/notification.module';
import { PaymentMethodsModule } from './payment-methods/payment-methods.module';
import { ApprovalsModule } from './approvals/approvals.module';
import { AuditModule } from './audit/audit.module';
import { LedgerFreshnessModule } from './common/ledger-freshness/ledger-freshness.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { IdempotencyModule } from './common/idempotency/idempotency.module';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { InstanceGuardService } from './health/instance-guard.service';
import { IngredientsModule } from './ingredients/ingredients.module';
import { InventoryModule } from './inventory/inventory.module';
import { InvoicesModule } from './invoices/invoices.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { ProductCategoriesModule } from './product-categories/product-categories.module';
import { PromotionsModule } from './promotions/promotions.module';
import { DisplayModule } from './display/display.module';
import { KitchenModule } from './kitchen/kitchen.module';
import { RecipeBookModule } from './recipe-book/recipe-book.module';
import { PurchaseListsModule } from './purchase-lists/purchase-lists.module';
import { PurchaseSuggestionsModule } from './purchase-suggestions/purchase-suggestions.module';
import { WorkersModule } from './workers/workers.module';
import { RecipesModule } from './recipes/recipes.module';
import { FixedCostsModule } from './fixed-costs/fixed-costs.module';
import { ReportsModule } from './reports/reports.module';
import { SalesModule } from './sales/sales.module';
import { ShiftsModule } from './shifts/shifts.module';
import { SubproductsModule } from './subproducts/subproducts.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { UsersModule } from './users/users.module';
import { WebHeroModule } from './web-hero/web-hero.module';
import { WebMenuModule } from './web-menu/web-menu.module';
import { WebOrdersModule } from './web-orders/web-orders.module';
import { ServerErrorAlertFilter } from './common/server-error-alert.filter';
import { ClientLogsModule } from './client-logs/client-logs.module';
import { TokenVersionModule } from './auth/token-version/token-version.module';
import { BusinessConfigModule } from './business-config/business-config.module';
import { TreasuryModule } from './treasury/treasury.module';
import { PayablesModule } from './payables/payables.module';
import { CortesiasModule } from './cortesias/cortesias.module';

@Module({
  imports: [
    GuiaModule,
    TokenVersionModule,
    ClientLogsModule,
    ScheduleModule.forRoot(),
    // El mensaje viaja tal cual a la pantalla del cajero: por defecto Nest
    // manda "ThrottlerException: Too Many Requests", que no le dice nada a
    // quien está tratando de entrar. Se explica QUÉ pasó y QUÉ hacer.
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 100 }],
      errorMessage: 'Demasiados intentos seguidos. Espera un minuto y vuelve a intentar.',
    }),
    PrismaModule,
    AuditModule,
    LedgerFreshnessModule,
    BusinessConfigModule,
    StorageModule,
    LLMModule,
    PrinterModule,
    CashDrawerModule,
    WhatsAppModule,
    NotificationModule,
    PaymentMethodsModule,
    IdempotencyModule,
    ApprovalsModule,
    UsersModule,
    AuthModule,
    IngredientsModule,
    SubproductsModule,
    ProductsModule,
    ProductCategoriesModule,
    RecipesModule,
    PromotionsModule,
    InventoryModule,
    SuppliersModule,
    InvoicesModule,
    ShiftsModule,
    SalesModule,
    DisplayModule,
    RecipeBookModule,
    KitchenModule,
    WebHeroModule,
    WebMenuModule,
    WebOrdersModule,
    ReportsModule,
    PurchaseSuggestionsModule,
    PurchaseListsModule,
    WorkersModule,
    FixedCostsModule,
    TreasuryModule,
    PayablesModule,
    CortesiasModule,
  ],
  controllers: [HealthController],
  providers: [
    HealthService,
    InstanceGuardService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // 5xx inesperados → log con stack + alerta WhatsApp al dueño (throttled).
    { provide: APP_FILTER, useClass: ServerErrorAlertFilter },
  ],
})
export class AppModule {}
