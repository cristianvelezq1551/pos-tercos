import { Global, Module } from '@nestjs/common';
import { LocalFsPrinterAdapter } from './local-fs.adapter';

/**
 * Token DI para inyectar la implementación concreta de PrinterProvider.
 * Pattern idéntico a STORAGE_PROVIDER.
 */
export const PRINTER_PROVIDER = Symbol('PRINTER_PROVIDER');

@Global()
@Module({
  providers: [
    LocalFsPrinterAdapter,
    {
      provide: PRINTER_PROVIDER,
      useExisting: LocalFsPrinterAdapter,
    },
  ],
  exports: [PRINTER_PROVIDER, LocalFsPrinterAdapter],
})
export class PrinterModule {}
