import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { LLMModule } from './adapters/llm/llm.module';
import { StorageModule } from './adapters/storage/storage.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { HealthController } from './health/health.controller';
import { IngredientsModule } from './ingredients/ingredients.module';
import { InventoryModule } from './inventory/inventory.module';
import { InvoicesModule } from './invoices/invoices.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { RecipesModule } from './recipes/recipes.module';
import { SubproductsModule } from './subproducts/subproducts.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    StorageModule,
    LLMModule,
    UsersModule,
    AuthModule,
    IngredientsModule,
    SubproductsModule,
    ProductsModule,
    RecipesModule,
    InventoryModule,
    SuppliersModule,
    InvoicesModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
