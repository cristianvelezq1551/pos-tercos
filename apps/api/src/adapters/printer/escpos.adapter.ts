import { Injectable, Logger } from '@nestjs/common';
import {
  renderReceiptEscPos,
  renderReceiptHtml,
  type PrinterProvider,
  type PrintResult,
  type ReceiptData,
} from '@pos-tercos/domain';
import { mkdir, writeFile } from 'fs/promises';
import { join, resolve } from 'path';

/**
 * Printer adapter para producción. Renderiza el recibo a bytes ESC/POS
 * y los envía al Print Agent local (apps/print-agent) que corre en la
 * Raspberry Pi conectada a la impresora térmica.
 *
 * Adicionalmente persiste el HTML en disco (igual que LocalFs) para
 * tener un backup navegable + servir desde POS si alguien quiere
 * reabrir el recibo desde el navegador.
 *
 * Si el agente no responde, levanta un error claro — el cajero podrá
 * usar "imprimir desde browser" como fallback (el HTML sigue ahí).
 *
 * Variables env:
 *  - PRINT_AGENT_URL — `http://192.168.1.50:9100` (default localhost:9100)
 *  - PRINT_AGENT_SECRET — opcional, header X-Agent-Secret.
 */
@Injectable()
export class EscPosPrinterAdapter implements PrinterProvider {
  readonly name = 'escpos';
  private readonly logger = new Logger(EscPosPrinterAdapter.name);
  private readonly agentUrl: string;
  private readonly agentSecret: string | null;
  private readonly basePath: string;

  constructor() {
    this.agentUrl = process.env.PRINT_AGENT_URL ?? 'http://localhost:9100';
    this.agentSecret = process.env.PRINT_AGENT_SECRET ?? null;
    this.basePath = resolve(
      process.cwd(),
      process.env.RECEIPTS_LOCAL_PATH ?? './tmp/receipts',
    );
  }

  async print(receipt: ReceiptData): Promise<PrintResult> {
    // Backup HTML navegable (mismo flujo que LocalFs).
    await mkdir(this.basePath, { recursive: true });
    const html = renderReceiptHtml(receipt);
    const htmlBody = Buffer.from(html, 'utf-8');
    const suffix = receipt.reprintLabel ? `-rep-${Date.now()}` : '';
    const filename = `receipt-${receipt.receiptNumber}${suffix}.html`;
    const fullPath = join(this.basePath, filename);
    await writeFile(fullPath, htmlBody);

    // ESC/POS bytes → agent.
    const bytes = renderReceiptEscPos(receipt);
    await this.sendToAgent(bytes);

    this.logger.log(
      `Printed receipt #${receipt.receiptNumber} via agent (${bytes.length}B) + HTML backup`,
    );

    return {
      key: filename,
      url: `file://${fullPath}`,
      contentType: 'text/html; charset=utf-8',
      body: htmlBody,
    };
  }

  private async sendToAgent(bytes: Buffer): Promise<void> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.agentSecret) headers['X-Agent-Secret'] = this.agentSecret;

    const res = await fetch(`${this.agentUrl}/print`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ escposBase64: bytes.toString('base64') }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `Print agent rejected request (${res.status}): ${text.slice(0, 200)}`,
      );
    }
  }
}
