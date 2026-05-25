/**
 * Impresión del recibo desde el NAVEGADOR del mostrador, online-first con
 * respaldo offline:
 *  1) intenta los bytes ESC/POS del backend (GET /sales/:id/escpos) — camino
 *     online de siempre (con su audit y banner DUPLICADO server-side),
 *  2) si el backend está INALCANZABLE (sin conexión / 5xx) y tenemos los datos
 *     de la venta, arma el recibo y deja que el print-agent lo renderice
 *     ({receipt}) → imprime SIN depender del backend.
 *
 * En ambos casos los bytes salen del print-agent LOCAL (misma PC que la
 * impresora). NO usa el diálogo del navegador (eso causaba papel infinito).
 */
import type { Sale } from '@pos-tercos/types';
import { buildReceiptDataInput, type ReceiptDataInput } from '../lib/build-receipt-data';

const AGENT_URL =
  process.env.NEXT_PUBLIC_PRINT_AGENT_URL ?? 'http://localhost:9120';

export interface PrintOptions {
  /** Datos de la venta para imprimir offline si el backend no responde. */
  fallback?: Sale;
  /** Marca "DUPLICADO" en el recibo offline (reimpresiones desde el historial). */
  reprint?: boolean;
}

export async function printReceipt(
  saleId: string,
  opts: PrintOptions = {},
): Promise<void> {
  const escposBase64 = await tryBackendBytes(saleId);
  if (escposBase64) {
    await sendToAgent({ escposBase64 });
    return;
  }
  // Backend inalcanzable → respaldo offline con los datos que tenemos.
  if (!opts.fallback) {
    throw new Error(
      'No se pudo generar el recibo (sin conexión) y no hay datos para imprimirlo offline.',
    );
  }
  const receipt = buildReceiptDataInput(opts.fallback, { reprint: opts.reprint });
  await sendToAgent({ receipt });
}

/**
 * Imprime un recibo OFFLINE directo desde los datos (no hay venta en el backend).
 * El agent lo renderiza y rellena el negocio desde su .env. Lo usa la venta
 * offline (B.2): el recibo lleva el número provisional OFF-N.
 */
export async function printReceiptData(receipt: ReceiptDataInput): Promise<void> {
  await sendToAgent({ receipt });
}

/**
 * Pide los bytes al backend. Devuelve null SOLO si el backend está inalcanzable
 * (fetch falla o 5xx) → ahí entra el respaldo offline. Un 4xx (backend que
 * RECHAZA, ej. status inválido) se propaga como error: no lo enmascaramos.
 */
async function tryBackendBytes(saleId: string): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch(`/api/sales/${saleId}/escpos`, { credentials: 'include' });
  } catch {
    return null; // sin conexión
  }
  if (res.ok) {
    const { escposBase64 } = (await res.json()) as { escposBase64: string };
    return escposBase64;
  }
  if (res.status >= 500) {
    return null; // backend caído / gateway → respaldo offline
  }
  const text = await res.text().catch(() => '');
  throw new Error(
    `No se pudo generar el recibo (${res.status})${text ? `: ${text.slice(0, 150)}` : ''}`,
  );
}

async function sendToAgent(
  body: { escposBase64: string } | { receipt: ReceiptDataInput },
): Promise<void> {
  let agentRes: Response;
  try {
    agentRes = await fetch(`${AGENT_URL}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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
