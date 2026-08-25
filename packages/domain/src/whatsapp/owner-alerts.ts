/**
 * Mensajes de ALERTA al Dueño (no al cliente) — antifraude y costos.
 * Builders puros; el envío real lo hace OwnerNotificationService en la API
 * vía WhatsAppProvider. Complementan `buildDiscrepancyAlertLink` (descuadre).
 *
 * ⚠️ SIN EMOJI, acá y en todos los builders de WhatsApp (decisión del dueño
 * 2026-08-24): los pictogramas que usábamos están fuera del plano básico de
 * Unicode (4 bytes) y en el teléfono del dueño llegaban como `�`. Un aviso que
 * depende de un icono para entenderse es un aviso que a veces no se entiende.
 * La jerarquía la da la negrita de WhatsApp (`*texto*`) y el salto de línea.
 */

import { formatCop } from './format';

/**
 * Encabezado común de TODA alerta al dueño. Existe para que las 14 se lean
 * como el mismo remitente: llegan mezcladas con sus chats personales, y sin
 * una forma reconocible tiene que abrir cada una para saber si es del negocio.
 */
export function buildOwnerAlert(input: {
  businessName: string;
  title: string;
  body: string;
}): string {
  return `[${input.businessName}] *${input.title}*\n\n${input.body}`;
}

export function buildVoidAlertMessage(input: {
  businessName: string;
  cashierName: string | null;
  receiptNumber: number;
  total: number;
  reason: string;
  /** Un reembolso devuelve plata de un pedido ya entregado — no es lo mismo
   *  que anular uno que la cocina no tocó, y el dueño reacciona distinto. */
  kind?: 'void' | 'refund';
}): string {
  return buildOwnerAlert({
    businessName: input.businessName,
    title: input.kind === 'refund' ? 'Reembolso' : 'Venta anulada',
    body:
      `Recibo: #${input.receiptNumber}\n` +
      `Monto: ${formatCop(input.total)}\n` +
      `Cajero: ${input.cashierName ?? 'desconocido'}\n` +
      `Motivo: ${input.reason}`,
  });
}

export function buildNoSaleDrawerAlertMessage(input: {
  businessName: string;
  cashierName: string | null;
  reason: string;
}): string {
  return buildOwnerAlert({
    businessName: input.businessName,
    title: 'Cajón abierto sin venta',
    body: `Cajero: ${input.cashierName ?? 'desconocido'}\nMotivo: ${input.reason}`,
  });
}

/**
 * Alerta de descuento MANUAL aplicado por el cajero (#5b): sin aprobación,
 * pero el dueño se entera al instante de cada uno.
 */
export function buildManualDiscountAlertMessage(input: {
  businessName: string;
  cashierName: string | null;
  receiptNumber: number;
  customerName: string | null;
  subtotal: number;
  discountTotal: number;
  total: number;
  reason: string;
}): string {
  return buildOwnerAlert({
    businessName: input.businessName,
    title: 'Descuento manual aplicado',
    body:
      `Recibo: #${input.receiptNumber}\n` +
      `${input.customerName ? `Cliente: ${input.customerName}\n` : ''}` +
      `Subtotal: ${formatCop(input.subtotal)}\n` +
      `Descuento: -${formatCop(input.discountTotal)}\n` +
      `Total cobrado: ${formatCop(input.total)}\n` +
      `Cajero: ${input.cashierName ?? 'desconocido'}\n` +
      `Motivo: ${input.reason}`,
  });
}

/** Cortesía entregada: el negocio no cobró un pedido que la cocina sí preparó. */
export function buildCortesiaAlertMessage(input: {
  businessName: string;
  cashierName: string | null;
  quantity: number;
  productName: string;
  /** Lo que costó producirla (FIFO). null si todavía no se puede estimar. */
  costAmount: number | null;
  reason: string;
}): string {
  const costo =
    input.costAmount === null ? '' : `Costo: ${formatCop(input.costAmount)}\n`;
  return buildOwnerAlert({
    businessName: input.businessName,
    title: 'Cortesía entregada',
    body:
      `${input.quantity}x ${input.productName}\n` +
      costo +
      `Cajero: ${input.cashierName ?? 'desconocido'}\n` +
      `Motivo: ${input.reason}`,
  });
}

export interface CostIncreaseItem {
  name: string;
  /** Costo anterior por unidad de compra. */
  oldUnitCost: number;
  /** Costo nuevo según la factura confirmada. */
  newUnitCost: number;
}

/**
 * Alerta de suba de costos al confirmar una factura. El caller filtra qué
 * items superan el umbral; acá solo se redacta.
 */
export function buildCostIncreaseAlertMessage(input: {
  businessName: string;
  supplierName: string | null;
  items: CostIncreaseItem[];
}): string {
  const lines = input.items.map((it) => {
    const pct = ((it.newUnitCost - it.oldUnitCost) / it.oldUnitCost) * 100;
    return `· ${it.name}: ${formatCop(it.oldUnitCost)} → ${formatCop(it.newUnitCost)} (+${pct.toFixed(0)}%)`;
  });
  return buildOwnerAlert({
    businessName: input.businessName,
    title: input.supplierName
      ? `Aumento de costos — ${input.supplierName}`
      : 'Aumento de costos',
    body:
      `${lines.join('\n')}\n\n` +
      `Revisa si los precios de venta siguen dando el margen esperado.`,
  });
}
