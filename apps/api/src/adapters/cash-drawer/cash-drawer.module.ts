import { Global, Logger, Module } from '@nestjs/common';
import type { CashDrawerProvider } from '@pos-tercos/domain';
import { EscPosCashDrawerAdapter } from './escpos.adapter';
import { LogCashDrawerAdapter } from './log.adapter';

export const CASH_DRAWER_PROVIDER = Symbol('CASH_DRAWER_PROVIDER');

const logger = new Logger('CashDrawerModule');

@Global()
@Module({
  providers: [
    LogCashDrawerAdapter,
    EscPosCashDrawerAdapter,
    {
      provide: CASH_DRAWER_PROVIDER,
      useFactory: (
        log: LogCashDrawerAdapter,
        escpos: EscPosCashDrawerAdapter,
      ): CashDrawerProvider => {
        // Reusa la misma env var que el printer — en deploy real ambos
        // siempre van juntos (cajón conectado al RJ-11 de la impresora).
        const choice = (process.env.PRINTER_PROVIDER ?? 'local').toLowerCase();
        if (choice === 'escpos') {
          logger.log('Using EscPosCashDrawerAdapter (production via print-agent)');
          return escpos;
        }
        logger.log('Using LogCashDrawerAdapter (dev — log only)');
        return log;
      },
      inject: [LogCashDrawerAdapter, EscPosCashDrawerAdapter],
    },
  ],
  exports: [CASH_DRAWER_PROVIDER, LogCashDrawerAdapter, EscPosCashDrawerAdapter],
})
export class CashDrawerModule {}
