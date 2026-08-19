'use client';

/** Cliente del print-agent local (misma PC que las impresoras). */

const AGENT_URL =
  process.env.NEXT_PUBLIC_PRINT_AGENT_URL ?? 'http://localhost:9120';

export interface AgentPrinters {
  printers: string[];
  defaultPrinter: string | null;
  platform: string;
}

/** Lista las impresoras instaladas en la PC que corre el print-agent. */
export async function listAgentPrinters(): Promise<AgentPrinters> {
  let res: Response;
  try {
    res = await fetch(`${AGENT_URL}/printers`, { method: 'GET' });
  } catch {
    throw new Error(
      'No se pudo contactar la impresora local (print-agent). ¿Está corriendo en esta PC?',
    );
  }
  if (!res.ok) {
    throw new Error(`El print-agent no respondió las impresoras (${res.status}).`);
  }
  return (await res.json()) as AgentPrinters;
}
