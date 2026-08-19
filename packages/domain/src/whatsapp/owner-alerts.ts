/**
 * Mensajes de ALERTA al Dueño (no al cliente) — antifraude y costos.
 * Builders puros; el envío real lo hace OwnerNotificationService en la API
 * vía WhatsAppProvider. Complementan `buildDiscrepancyAlertLink` (descuadre).
 */

import { formatCop } from './format';

export function buildVoidAlertMessage(input: {
  businessName: string;
  cashierName: string | null;
  receiptNumber: number;
  total: number;
  reason: string;
}): string {
  return (
    `[${input.businessName}] 🚫 Venta ANULADA\n\n` +
    `Recibo: #${input.receiptNumber}\n` +
    `Monto: ${formatCop(input.total)}\n` +
    `Cajero: ${input.cashierName ?? 'desconocido'}\n` +
    `Motivo: ${input.reason}`
  );
}

export function buildNoSaleDrawerAlertMessage(input: {
  businessName: string;
  cashierName: string | null;
  reason: string;
}): string {
  return (
    `[${input.businessName}] 🔓 Cajón abierto SIN venta\n\n` +
    `Cajero: ${input.cashierName ?? 'desconocido'}\n` +
    `Motivo: ${input.reason}`
  );
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
  return (
    `[${input.businessName}] 🏷️ Descuento manual aplicado\n\n` +
    `Recibo: #${input.receiptNumber}\n` +
    `${input.customerName ? `Cliente: ${input.customerName}\n` : ''}` +
    `Subtotal: ${formatCop(input.subtotal)}\n` +
    `Descuento: -${formatCop(input.discountTotal)}\n` +
    `Total cobrado: ${formatCop(input.total)}\n` +
    `Cajero: ${input.cashierName ?? 'desconocido'}\n` +
    `Motivo: ${input.reason}`
  );
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
  return (
    `[${input.businessName}] 📈 Aumento de costos en factura confirmada` +
    `${input.supplierName ? ` de ${input.supplierName}` : ''}:\n\n` +
    `${lines.join('\n')}\n\n` +
    `Revisa si los precios de venta siguen dando el margen esperado.`
  );
}
