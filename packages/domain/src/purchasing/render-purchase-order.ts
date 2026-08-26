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

function esc(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cop(amount: number): string {
  return `$ ${Math.round(amount).toLocaleString('es-CO')}`;
}

function num(value: number): string {
  return value.toLocaleString('es-CO', { maximumFractionDigits: 2 });
}

const STYLES = `<style>
  @page { size: A4; margin: 18mm; }
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
         color: #14181f; margin: 0; font-size: 12pt; line-height: 1.45; }
  header { display: flex; justify-content: space-between; align-items: flex-start;
           border-bottom: 2px solid #14181f; padding-bottom: 10px; margin-bottom: 18px; }
  h1 { font-size: 15pt; margin: 0 0 2px; letter-spacing: -0.01em; }
  .muted { color: #5b6472; font-size: 10pt; }
  .biz { text-align: right; }
  .biz strong { font-size: 12pt; }
  .to { margin-bottom: 16px; }
  .to strong { font-size: 13pt; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 3px 14px; margin: 0 0 18px; font-size: 10.5pt; }
  dt { color: #5b6472; }
  dd { margin: 0; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 9.5pt; text-transform: uppercase; letter-spacing: .05em;
       color: #5b6472; border-bottom: 1px solid #c9cfd8; padding: 0 0 6px; }
  td { padding: 9px 0; border-bottom: 1px solid #e7eaef; vertical-align: top; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .sub { color: #5b6472; font-size: 9.5pt; font-weight: normal; }
  tfoot td { border-bottom: none; border-top: 2px solid #14181f; padding-top: 10px; font-weight: 700; }
  .note { margin-top: 16px; padding: 9px 12px; background: #f4f6f9; border-radius: 5px; font-size: 10.5pt; }
  footer { margin-top: 26px; font-size: 9.5pt; color: #5b6472; border-top: 1px solid #e7eaef; padding-top: 8px; }
  /* En pantalla el @page no aplica: el documento necesita su propio margen
     para no quedar pegado al borde. */
  @media screen { body { max-width: 210mm; margin: 0 auto; padding: 18mm 18mm 90px; } }
  @media print { .noprint { display: none !important; } }
  /* Abajo, no arriba: en la esquina superior derecha tapaba los datos del
     negocio. */
  .noprint { position: fixed; bottom: 18px; right: 18px; }
  .noprint button { font: inherit; padding: 10px 16px; border-radius: 6px;
                    border: 1px solid #14181f; background: #14181f; color: #fff; cursor: pointer;
                    box-shadow: 0 2px 10px rgba(0,0,0,.25); }
</style>`;

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
