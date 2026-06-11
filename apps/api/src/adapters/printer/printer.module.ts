import { Global, Logger, Module } from '@nestjs/common';
import type { PrinterProvider } from '@pos-tercos/domain';
import { EscPosPrinterAdapter } from './escpos.adapter';
import { LocalFsPrinterAdapter } from './local-fs.adapter';

/**
 * Token DI para inyectar la implementación concreta de PrinterProvider.
 * Pattern idéntico a STORAGE_PROVIDER.
 *
 * Selección via `PRINTER_PROVIDER=local|escpos`. Default `local` (dev).
 * `escpos` requiere que apps/print-agent esté corriendo en
 * PRINT_AGENT_URL (default `http://localhost:9120`).
 */
export const PRINTER_PROVIDER = Symbol('PRINTER_PROVIDER');

const logger = new Logger('PrinterModule');

@Global()
@Module({
  providers: [
    LocalFsPrinterAdapter,
    EscPosPrinterAdapter,
    {
      provide: PRINTER_PROVIDER,
      useFactory: (
        local: LocalFsPrinterAdapter,
        escpos: EscPosPrinterAdapter,
      ): PrinterProvider => {
        const choice = (process.env.PRINTER_PROVIDER ?? 'local').toLowerCase();
        if (choice === 'escpos') {
          logger.log('Using EscPosPrinterAdapter (production via print-agent)');
          return escpos;
        }
        logger.log('Using LocalFsPrinterAdapter (dev — HTML to ./tmp/receipts)');
        return local;
      },
      inject: [LocalFsPrinterAdapter, EscPosPrinterAdapter],
    },
  ],
  exports: [PRINTER_PROVIDER, LocalFsPrinterAdapter, EscPosPrinterAdapter],
})
export class PrinterModule {}
