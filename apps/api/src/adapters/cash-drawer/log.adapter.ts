import { Injectable, Logger } from '@nestjs/common';
import type { CashDrawerProvider, DrawerOpenResult } from '@pos-tercos/domain';

/**
 * Mock cash drawer adapter para desarrollo. Solo loggea la apertura.
 *
 * En FASE 15 se reemplaza por adapter real que envía un comando ESC/POS
 * al puerto al que está conectado el cajón monedero (típicamente RJ11
 * detrás de la impresora).
 */
@Injectable()
export class LogCashDrawerAdapter implements CashDrawerProvider {
  readonly name = 'log';
  private readonly logger = new Logger(LogCashDrawerAdapter.name);

  async open(input: { reason?: string | null }): Promise<DrawerOpenResult> {
    const at = new Date().toISOString();
    const reason = input.reason ?? null;
    if (reason) {
      this.logger.warn(`Cash drawer opened WITHOUT sale: reason="${reason}"`);
    } else {
      this.logger.log(`Cash drawer opened (with sale)`);
    }
    return { ok: true, at, reason };
  }
}
