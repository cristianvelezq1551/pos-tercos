import { Module } from '@nestjs/common';
import { BusinessConfigModule } from '../business-config/business-config.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PurchaseListDocsService } from './purchase-list-docs.service';
import { PurchaseListReviewService } from './purchase-list-review.service';
import { PurchaseListsController } from './purchase-lists.controller';
import { PurchaseListsService } from './purchase-lists.service';
import { ShortageCandidatesService } from './shortage-candidates.service';

@Module({
  imports: [InventoryModule, BusinessConfigModule],
  controllers: [PurchaseListsController],
  providers: [
    PurchaseListsService,
    ShortageCandidatesService,
    PurchaseListDocsService,
    PurchaseListReviewService,
  ],
  exports: [PurchaseListsService],
})
export class PurchaseListsModule {}
