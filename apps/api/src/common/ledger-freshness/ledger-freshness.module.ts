import { Global, Module } from '@nestjs/common';
import { LedgerFreshnessService } from './ledger-freshness.service';

/** Global: lo escribe inventario y lo lee reportes, sin acoplarlos entre sí. */
@Global()
@Module({
  providers: [LedgerFreshnessService],
  exports: [LedgerFreshnessService],
})
export class LedgerFreshnessModule {}
