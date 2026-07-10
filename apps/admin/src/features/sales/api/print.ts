/**
 * Impresión del recibo y la comanda desde el NAVEGADOR del mostrador.
 *
 * RUTEO MULTI-IMPRESORA: lee la config local de la terminal
 * (features/printing) y manda cada documento a la(s) impresora(s) asignada(s)
 * por nombre. Si NO hay config, cae al comportamiento histórico de una sola
 * impresora (la del .env del print-agent).
 *
 * Recibo: online-first (bytes ESC/POS del backend) con respaldo offline (el
 * print-agent lo renderiza desde los datos de la venta). Comanda de cocina
 * excluye reventa directa (bebidas) vía ?variant=kitchen.
 *
 * Los bytes siempre salen del print-agent LOCAL (misma PC que la impresora).
 * NO usa el diálogo del navegador (causaba papel infinito).
 */
import {
  SendToKitchenResponseSchema,
  type Sale,
  type SendToKitchenResponse,
} from '@pos-tercos/types';
import { buildReceiptDataInput, type ReceiptDataInput } from '../lib/build-receipt-data';
import { printersForDoc } from '../../printing/lib/printer-config';
import { logError, logInfo } from '../../../lib/client-log';

const AGENT_URL =
  process.env.NEXT_PUBLIC_PRINT_AGENT_URL ?? 'http://localhost:9120';
/** Corte si el agent no responde (caído/colgado) — no colgar la UI del cajero. */
const AGENT_TIMEOUT_MS = 15_000;

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
  const targets = printersForDoc('factura');
  logInfo('print', 'recibo: inicio', { saleId, targets, agent: AGENT_URL });
  const escposBase64 = await tryBackendBytes(saleId);
  if (escposBase64) {
    logInfo('print', 'recibo: bytes del backend OK', { saleId, bytes: escposBase64.length });
    await sendToTargets({ escposBase64 }, targets);
    return;
  }
  // Backend inalcanzable → respaldo offline con los datos que tenemos.
  if (!opts.fallback) {
    throw new Error(
      'No se pudo generar el recibo (sin conexión) y no hay datos para imprimirlo offline.',
    );
  }
  logInfo('print', 'recibo: backend inalcanzable → respaldo offline', { saleId });
  const receipt = buildReceiptDataInput(opts.fallback, { reprint: opts.reprint });
  await sendToTargets({ receipt }, targets);
}

/**
 * Imprime la COMANDA vía print-agent local. Se dispara al COBRAR (la venta
 * puede seguir PENDIENTE_PAGO). Rutea:
 *  - impresoras "comanda-cocina" → variante sin bebidas (reventa directa),
 *  - impresoras "comanda-completa" → variante con todo.
 * `cancel` → ticket de ANULACIÓN para que la cocina descarte el pedido.
 * Sin config: una sola comanda completa a la impresora por defecto (histórico).
 */
export async function printComanda(
  saleId: string,
  opts: { cancel?: boolean; corrected?: boolean } = {},
): Promise<void> {
  const kitchen = printersForDoc('comanda-cocina');
  const full = printersForDoc('comanda-completa');
  logInfo('print', 'comanda: inicio', {
    saleId,
    kitchen,
    full,
    cancel: !!opts.cancel,
    corrected: !!opts.corrected,
  });

  // Sin config de comandas → comportamiento histórico (una impresora default).
  if (kitchen.length === 0 && full.length === 0) {
    const { escposBase64 } = await fetchComanda(saleId, {
      cancel: opts.cancel,
      corrected: opts.corrected,
    });
    await sendToTargets({ escposBase64 }, []);
    return;
  }

  if (kitchen.length > 0) {
    const { escposBase64, itemCount } = await fetchComanda(saleId, {
      cancel: opts.cancel,
      corrected: opts.corrected,
      variant: 'kitchen',
    });
    // No imprimir comanda de cocina vacía (pedido solo de bebidas), salvo que
    // sea un ticket de anulación (la cocina igual debe enterarse).
    if (itemCount > 0 || opts.cancel) {
      await sendToTargets({ escposBase64 }, kitchen);
    }
  }

  if (full.length > 0) {
    const { escposBase64 } = await fetchComanda(saleId, {
      cancel: opts.cancel,
      corrected: opts.corrected,
      variant: 'full',
    });
    await sendToTargets({ escposBase64 }, full);
  }
}

/**
 * Cuentas abiertas (#3): manda a cocina SOLO lo pendiente. El backend estampa
 * las líneas como enviadas y devuelve ambas variantes de comanda; acá se rutean
 * a las impresoras igual que printComanda. Si no había nada pendiente
 * (pendingCount 0) no se imprime nada.
 */
export async function sendTabToKitchen(saleId: string): Promise<SendToKitchenResponse> {
  const res = await fetch(`/api/sales/${saleId}/send-to-kitchen`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `No se pudo enviar a cocina (${res.status})${text ? `: ${text.slice(0, 150)}` : ''}`,
    );
  }
  const data = SendToKitchenResponseSchema.parse(await res.json());
  if (data.pendingCount === 0) {
    logInfo('print', 'send-to-kitchen: sin pendientes, nada que imprimir', { saleId });
    return data;
  }
  const kitchen = printersForDoc('comanda-cocina');
  const full = printersForDoc('comanda-completa');
  logInfo('print', 'send-to-kitchen: imprimiendo tanda', {
    saleId,
    batch: data.batch,
    lines: data.pendingCount,
    kitchen,
    full,
  });
  // Sin config de comandas → comportamiento histórico (una impresora default).
  if (kitchen.length === 0 && full.length === 0) {
    if (data.full) await sendToTargets({ escposBase64: data.full.escposBase64 }, []);
    return data;
  }
  if (kitchen.length > 0 && data.kitchen && data.kitchen.itemCount > 0) {
    await sendToTargets({ escposBase64: data.kitchen.escposBase64 }, kitchen);
  }
  if (full.length > 0 && data.full) {
    await sendToTargets({ escposBase64: data.full.escposBase64 }, full);
  }
  return data;
}

/**
 * Imprime un recibo OFFLINE directo desde los datos (no hay venta en el backend).
 * El agent lo renderiza y rellena el negocio desde su .env. Lo usa la venta
 * offline (B.2): el recibo lleva el número provisional OFF-N.
 */
export async function printReceiptData(receipt: ReceiptDataInput): Promise<void> {
  await sendToTargets({ receipt }, printersForDoc('factura'));
}

/** Pide los bytes de la comanda al backend (variante opcional). */
async function fetchComanda(
  saleId: string,
  opts: { cancel?: boolean; corrected?: boolean; variant?: 'kitchen' | 'full' },
): Promise<{ escposBase64: string; itemCount: number }> {
  const params = new URLSearchParams();
  if (opts.cancel) params.set('cancel', 'true');
  if (opts.corrected) params.set('corrected', 'true');
  if (opts.variant) params.set('variant', opts.variant);
  const qs = params.toString();
  const res = await fetch(`/api/sales/${saleId}/comanda-escpos${qs ? `?${qs}` : ''}`, {
    credentials: 'include',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `No se pudo generar la comanda (${res.status})${text ? `: ${text.slice(0, 150)}` : ''}`,
    );
  }
  const data = (await res.json()) as { escposBase64: string; itemCount?: number };
  return { escposBase64: data.escposBase64, itemCount: data.itemCount ?? 1 };
}

/**
 * Pide los bytes del recibo al backend. Devuelve null SOLO si el backend está
 * inalcanzable (fetch falla o 5xx) → ahí entra el respaldo offline. Un 4xx
 * (backend que RECHAZA) se propaga como error.
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

type PrintPayload = { escposBase64: string } | { receipt: ReceiptDataInput };

/**
 * Manda el documento a cada impresora destino. Si `targets` está vacío,
 * imprime una vez SIN destino → el agent usa la impresora de su .env
 * (comportamiento de una sola impresora, retrocompatible).
 */
async function sendToTargets(body: PrintPayload, targets: string[]): Promise<void> {
  if (targets.length === 0) {
    await sendToAgent(body);
    return;
  }
  // Secuencial: comparten el spooler local; en serie evita choques raros.
  for (const printer of targets) {
    await sendToAgent({ ...body, printer });
  }
}

async function sendToAgent(
  body: PrintPayload & { printer?: string },
): Promise<void> {
  const dest = body.printer ?? '(impresora por defecto del agent)';
  logInfo('print', 'enviando al print-agent', { printer: dest });
  let agentRes: Response;
  // Timeout: si el agent está caído/colgado, NO dejamos la UI esperando para
  // siempre — abortamos a los 15s y reportamos como "agent no contactable".
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AGENT_TIMEOUT_MS);
  try {
    agentRes = await fetch(`${AGENT_URL}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    // Causa típica en Vercel: el navegador bloqueó el request a localhost
    // (Private Network Access / mixed-content), el agent no está corriendo, o
    // se colgó y el request agotó el timeout (abort).
    logError('print', e, { printer: dest, agent: AGENT_URL, hint: 'agent no contactable / PNA bloqueado / timeout' });
    throw new Error(
      'No se pudo contactar la impresora local (print-agent). ¿Está corriendo el agent en esta PC y el navegador permite conexiones a localhost?',
    );
  } finally {
    clearTimeout(timer);
  }
  if (!agentRes.ok) {
    const text = await agentRes.text().catch(() => '');
    logError('print', `agent ${agentRes.status}: ${text.slice(0, 150)}`, { printer: dest });
    throw new Error(
      `La impresora rechazó la impresión (${agentRes.status})${text ? `: ${text.slice(0, 150)}` : ''}`,
    );
  }
  logInfo('print', 'impreso OK', { printer: dest });
}
