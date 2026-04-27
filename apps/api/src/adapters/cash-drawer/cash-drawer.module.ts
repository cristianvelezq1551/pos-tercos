import { Global, Module } from '@nestjs/common';
import { LogCashDrawerAdapter } from './log.adapter';

export const CASH_DRAWER_PROVIDER = Symbol('CASH_DRAWER_PROVIDER');

@Global()
@Module({
  providers: [
    LogCashDrawerAdapter,
    {
      provide: CASH_DRAWER_PROVIDER,
      useExisting: LogCashDrawerAdapter,
    },
  ],
  exports: [CASH_DRAWER_PROVIDER, LogCashDrawerAdapter],
})
export class CashDrawerModule {}
