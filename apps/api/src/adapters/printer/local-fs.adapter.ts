import { Injectable, Logger } from '@nestjs/common';
import {
  renderReceiptHtml,
  type PrinterProvider,
  type PrintResult,
  type ReceiptData,
} from '@pos-tercos/domain';
import { mkdir, writeFile } from 'fs/promises';
import { join, resolve } from 'path';

/**
 * Mock printer adapter para desarrollo. Renderiza el recibo como HTML
 * y lo escribe a `./tmp/receipts/{receiptNumber}.html`. El POS abre el
 * archivo en una nueva pestaña (window.open) para imprimir desde el
 * navegador.
 *
 * En FASE 15 se reemplaza por `EscPosPrinterAdapter` que talkea via
 * Print Agent local a una impresora térmica USB.
 */
@Injectable()
export class LocalFsPrinterAdapter implements PrinterProvider {
  readonly name = 'local-fs';
  private readonly logger = new Logger(LocalFsPrinterAdapter.name);
  private readonly basePath: string;

  constructor() {
    this.basePath = resolve(
      process.cwd(),
      process.env.RECEIPTS_LOCAL_PATH ?? './tmp/receipts',
    );
  }

  async print(receipt: ReceiptData): Promise<PrintResult> {
    await mkdir(this.basePath, { recursive: true });

    const html = renderReceiptHtml(receipt);
    const body = Buffer.from(html, 'utf-8');

    // Para reimpresiones agregamos sufijo del timestamp para no pisar el
    // archivo original (auditable: cuántas veces se imprimió).
    const suffix = receipt.reprintLabel
      ? `-rep-${Date.now()}`
      : '';
    const filename = `receipt-${receipt.receiptNumber}${suffix}.html`;
    const fullPath = join(this.basePath, filename);
    await writeFile(fullPath, body);

    this.logger.log(`Printed receipt #${receipt.receiptNumber} → ${fullPath}`);

    return {
      key: filename,
      url: `file://${fullPath}`,
      contentType: 'text/html; charset=utf-8',
      body,
    };
  }
}
