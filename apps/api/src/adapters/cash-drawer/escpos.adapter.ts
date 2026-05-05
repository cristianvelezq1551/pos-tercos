import { Injectable, Logger } from '@nestjs/common';
import type { CashDrawerProvider, DrawerOpenResult } from '@pos-tercos/domain';

/**
 * Cash drawer adapter para producción. POSTea a `/drawer-open` del Print
 * Agent local, que envía el comando ESC/POS DRAWER_KICK al puerto RJ-11
 * de la impresora (el cajón está conectado ahí en la mayoría de las
 * tiendas con Epson TM-T20III).
 */
@Injectable()
export class EscPosCashDrawerAdapter implements CashDrawerProvider {
  readonly name = 'escpos';
  private readonly logger = new Logger(EscPosCashDrawerAdapter.name);
  private readonly agentUrl: string;
  private readonly agentSecret: string | null;

  constructor() {
    this.agentUrl = process.env.PRINT_AGENT_URL ?? 'http://localhost:9100';
    this.agentSecret = process.env.PRINT_AGENT_SECRET ?? null;
  }

  async open(input: { reason?: string | null }): Promise<DrawerOpenResult> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.agentSecret) headers['X-Agent-Secret'] = this.agentSecret;

    const res = await fetch(`${this.agentUrl}/drawer-open`, {
      method: 'POST',
      headers,
      body: '{}',
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `Print agent rejected drawer-open (${res.status}): ${text.slice(0, 200)}`,
      );
    }
    const at = new Date().toISOString();
    this.logger.log(`Drawer kicked via agent (reason=${input.reason ?? 'sale'})`);
    return { ok: true, at, reason: input.reason ?? null };
  }
}
