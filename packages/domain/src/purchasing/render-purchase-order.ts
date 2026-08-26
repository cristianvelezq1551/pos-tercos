/**
 * Orden de compra imprimible (HTML → "Guardar como PDF" del navegador).
 *
 * Por qué HTML y no una librería de PDF: el navegador ya sabe hacer PDF y lo
 * hace bien. Meter jsPDF/puppeteer sumaría cientos de KB al bundle (o un
 * binario al servidor) para producir un documento de una página que además
 * quedaría peor tipografiado. Es el mismo camino que ya usa el recibo
 * (`renderReceiptHtml`).
 *
 * Sirve para lo que WhatsApp no cubre: dejar constancia en papel, mandarlo por
 * correo, o entregárselo a alguien que llega a recoger el pedido.
 */

import { cop, esc, num, STYLES } from './doc-shared';

export interface PurchaseOrderItem {
  name: string;
  /** Cantidad en unidad de COMPRA. */
  quantity: number;
  unitPurchase: string;
  /** Equivalencia en unidad de inventario ("48 unidad"). Opcional. */
  equivalence?: string | null;
  /** Costo estimado de la línea, en COP. Interno: puede omitirse. */
  estTotal?: number | null;
}

export interface PurchaseOrderDoc {
  businessName: string;
  businessPhone?: string | null;
  businessAddress?: string | null;
  supplierName: string;
  supplierPhone?: string | null;
  /** Fecha de emisión ya formateada. */
  issuedOnLabel: string;
  /** Día de entrega ya formateado ("mañana, martes 28 de julio"). */
  neededByLabel?: string | null;
  requestedBy?: string | null;
  note?: string | null;
  items: PurchaseOrderItem[];
  /**
   * Costo estimado total. Es un dato INTERNO (lo que nos cobraron la última
   * vez), no una cotización: el documento lo rotula como tal para que nadie
   * lo lea como un precio acordado.
   */
  estTotal?: number | null;
}

function renderRows(items: PurchaseOrderItem[]): string {
  return items
    .map(
      (it) => `
        <tr>
          <td>${esc(it.name)}</td>
          <td class="num">
            <strong>${num(it.quantity)} ${esc(it.unitPurchase)}</strong>
            ${it.equivalence ? `<div class="sub">${esc(it.equivalence)}</div>` : ''}
          </td>
          <td class="num">${it.estTotal === null || it.estTotal === undefined ? '—' : cop(it.estTotal)}</td>
        </tr>`,
    )
    .join('');
}

function renderMeta(doc: PurchaseOrderDoc): string {
  const meta = [
    doc.neededByLabel ? ['Entregar', doc.neededByLabel] : null,
    doc.businessAddress ? ['Entregar en', doc.businessAddress] : null,
    doc.requestedBy ? ['Pedido por', doc.requestedBy] : null,
    doc.businessPhone ? ['Contacto', doc.businessPhone] : null,
  ].filter((x): x is [string, string] => x !== null);
  if (meta.length === 0) return '';
  return `<dl>${meta.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
}

export function renderPurchaseOrderHtml(doc: PurchaseOrderDoc): string {
  const rows = renderRows(doc.items);

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Orden de compra · ${esc(doc.supplierName)}</title>
${STYLES}
</head>
<body>
  <div class="noprint"><button onclick="window.print()">Guardar como PDF</button></div>

  <header>
    <div>
      <h1>Orden de compra</h1>
      <div class="muted">${esc(doc.issuedOnLabel)}</div>
    </div>
    <div class="biz">
      <strong>${esc(doc.businessName)}</strong>
      ${doc.businessPhone ? `<div class="muted">${esc(doc.businessPhone)}</div>` : ''}
      ${doc.businessAddress ? `<div class="muted">${esc(doc.businessAddress)}</div>` : ''}
    </div>
  </header>

  <div class="to">
    <div class="muted">Proveedor</div>
    <strong>${esc(doc.supplierName)}</strong>
    ${doc.supplierPhone ? `<div class="muted">${esc(doc.supplierPhone)}</div>` : ''}
  </div>

  ${renderMeta(doc)}

  <table>
    <thead>
      <tr><th>Producto</th><th class="num">Cantidad</th><th class="num">Costo estimado</th></tr>
    </thead>
    <tbody>${rows}</tbody>
    ${
      doc.estTotal === null || doc.estTotal === undefined
        ? ''
        : `<tfoot><tr><td colspan="2">Total estimado</td><td class="num">${cop(doc.estTotal)}</td></tr></tfoot>`
    }
  </table>

  ${doc.note ? `<div class="note"><strong>Nota:</strong> ${esc(doc.note)}</div>` : ''}

  <footer>
    El costo estimado es de referencia interna, tomado de la última compra: no es un precio
    acordado ni una cotización. El valor a pagar es el que confirme ${esc(doc.supplierName)}.
  </footer>
</body>
</html>`;
}
