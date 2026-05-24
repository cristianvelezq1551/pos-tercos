/**
 * Impresión del recibo desde el NAVEGADOR del mostrador:
 *  1) pide los bytes ESC/POS al backend (GET /sales/:id/escpos),
 *  2) los manda al print-agent LOCAL (misma PC que la impresora).
 *
 * Así la impresora NO queda detrás del backend: imprime aunque la API esté
 * remota. NO usa el diálogo de impresión del navegador (eso causaba papel
 * infinito en la térmica) — manda bytes crudos que ya incluyen el corte.
 */
const AGENT_URL =
  process.env.NEXT_PUBLIC_PRINT_AGENT_URL ?? 'http://localhost:9120';

export async function printReceipt(saleId: string): Promise<void> {
  // 1) Bytes ESC/POS desde el backend (online).
  const res = await fetch(`/api/sales/${saleId}/escpos`, {
    credentials: 'include',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `No se pudo generar el recibo (${res.status})${text ? `: ${text.slice(0, 150)}` : ''}`,
    );
  }
  const { escposBase64 } = (await res.json()) as { escposBase64: string };

  // 2) Bytes → print-agent local (en la PC del cajero).
  let agentRes: Response;
  try {
    agentRes = await fetch(`${AGENT_URL}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ escposBase64 }),
    });
  } catch {
    throw new Error(
      'No se pudo contactar la impresora local (print-agent). ¿Está corriendo en esta PC?',
    );
  }
  if (!agentRes.ok) {
    const text = await agentRes.text().catch(() => '');
    throw new Error(
      `La impresora rechazó la impresión (${agentRes.status})${text ? `: ${text.slice(0, 150)}` : ''}`,
    );
  }
}
