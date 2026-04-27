import type { ReceiptData } from './types';

/**
 * Renderiza un recibo como HTML 80mm-térmico-friendly. Función pura.
 *
 * Diseño:
 * - Width fijo en 80mm para coincidir con el rollo de impresora térmica.
 * - Tipografía monoespaciada (cuando llegue ESC/POS real será así igual).
 * - Sin método de pago impreso (pos-spec.v1.md:168 — privacidad).
 * - DUPLICADO label visible cuando reprintLabel != null.
 *
 * El llamador puede:
 *   1. Servirlo inline desde el backend (POST /sales/:id/print → text/html).
 *   2. Guardar en disco (LocalFsPrinterAdapter).
 *   3. Convertir a bytes ESC/POS en FASE 15 (EscPosPrinterAdapter).
 */
export function renderReceiptHtml(r: ReceiptData): string {
  const date = formatDateTime(r.createdAt);
  const reprintBanner = r.reprintLabel
    ? `<div class="reprint">⚠ ${escape(r.reprintLabel)} ⚠</div>`
    : '';

  const itemsRows = r.items
    .map((it) => {
      const sizeLine = it.sizeName ? ` (${escape(it.sizeName)})` : '';
      const promoLine = it.appliedPromotionName
        ? `<div class="promo">→ ${escape(it.appliedPromotionName)} (-${formatCop(it.lineDiscount)})</div>`
        : '';
      const modsLines = it.modifiers
        .map(
          (m) =>
            `<div class="mod">  + ${escape(m.name)}${m.priceDelta !== 0 ? ` (${formatCop(m.priceDelta)})` : ''}</div>`,
        )
        .join('');

      return `
        <tr class="item">
          <td class="qty">${it.quantity}×</td>
          <td class="name">${escape(it.productName)}${sizeLine}${modsLines}${promoLine}</td>
          <td class="price">${formatCop(it.lineTotal)}</td>
        </tr>`;
    })
    .join('');

  return `<!doctype html>
<html lang="es-CO">
<head>
<meta charset="utf-8" />
<title>Recibo #${r.receiptNumber}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  body { width: 72mm; margin: 0 auto; padding: 0; font-family: 'Courier New', monospace; font-size: 11px; line-height: 1.35; color: #000; }
  .biz { text-align: center; }
  .biz .name { font-size: 14px; font-weight: 700; letter-spacing: 0.5px; }
  .biz .meta { font-size: 10px; }
  .reprint { text-align: center; font-weight: 700; padding: 4px 0; border: 1px dashed #000; margin: 6px 0; font-size: 12px; letter-spacing: 1px; }
  .meta-row { display: flex; justify-content: space-between; font-size: 10px; padding: 2px 0; }
  hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
  table.items { width: 100%; border-collapse: collapse; }
  table.items td { vertical-align: top; padding: 2px 0; }
  td.qty { width: 26px; text-align: left; }
  td.name { padding-right: 4px; }
  td.price { width: 60px; text-align: right; white-space: nowrap; }
  .mod { font-size: 9px; padding-left: 2px; color: #333; }
  .promo { font-size: 9px; color: #555; padding-left: 2px; }
  .totals { margin-top: 6px; }
  .totals .row { display: flex; justify-content: space-between; padding: 1px 0; }
  .totals .row.grand { font-weight: 700; font-size: 14px; padding: 4px 0; border-top: 1px solid #000; margin-top: 4px; }
  .footer { text-align: center; margin-top: 12px; font-size: 10px; }
  .footer .thanks { font-weight: 700; padding-bottom: 2px; }
</style>
</head>
<body>
  <div class="biz">
    <div class="name">${escape(r.business.name)}</div>
    <div class="meta">${escape(r.business.address)}</div>
    <div class="meta">NIT ${escape(r.business.nit)}${r.business.phone ? ` · ${escape(r.business.phone)}` : ''}</div>
  </div>

  ${reprintBanner}

  <hr />

  <div class="meta-row"><span>Recibo</span><span>#${r.receiptNumber}</span></div>
  <div class="meta-row"><span>Fecha</span><span>${date}</span></div>
  ${r.cashierName ? `<div class="meta-row"><span>Cajero</span><span>${escape(r.cashierName)}</span></div>` : ''}
  ${r.customerName ? `<div class="meta-row"><span>Cliente</span><span>${escape(r.customerName)}</span></div>` : ''}

  <hr />

  <table class="items">${itemsRows}</table>

  <div class="totals">
    <div class="row"><span>Subtotal</span><span>${formatCop(r.subtotal)}</span></div>
    ${r.discountTotal > 0 ? `<div class="row"><span>Descuento</span><span>-${formatCop(r.discountTotal)}</span></div>` : ''}
    <div class="row grand"><span>TOTAL</span><span>${formatCop(r.total)}</span></div>
  </div>

  <div class="footer">
    <div class="thanks">¡Gracias por tu compra!</div>
    <div>Este documento no es factura electrónica.</div>
  </div>
</body>
</html>`;
}

function formatCop(amount: number): string {
  // Locale-free format for determinism (no Intl.NumberFormat). ej: $ 18.000
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? '-' : '';
  const abs = Math.abs(rounded).toString();
  const withSeparator = abs.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `$ ${sign}${withSeparator}`;
}

function formatDateTime(iso: string): string {
  // ISO → "27/04/2026 17:23"
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
