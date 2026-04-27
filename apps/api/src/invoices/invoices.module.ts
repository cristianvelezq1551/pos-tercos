import { Module } from '@nestjs/common';
import { LLMModule } from '../adapters/llm/llm.module';
import { StorageModule } from '../adapters/storage/storage.module';
import { InventoryModule } from '../inventory/inventory.module';
import { SuppliersModule } from '../suppliers/suppliers.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

@Module({
  imports: [LLMModule, StorageModule, SuppliersModule, InventoryModule],
  controllers: [InvoicesController],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
