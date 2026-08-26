/**
 * Lista de faltantes imprimible: el documento INTERNO de quien compra.
 *
 * Se diferencia de la orden a un proveedor (`renderPurchaseOrderHtml`) en tres
 * cosas, y por eso es un documento aparte y no una variante:
 *   - No va dirigida a nadie: es la hoja con la que se sale a comprar.
 *   - SÍ muestra costos y total, porque es de uso interno (la del proveedor no,
 *     ver §7.v19: con proveedores no se habla de precios).
 *   - Muestra existencias y mínimo de cada ítem, que es lo que justifica la
 *     cantidad y lo que se revisa parado frente a la estantería.
 *
 * Si hay proveedores asignados, agrupa por proveedor: así se recorre el
 * mercado por paradas en vez de saltando de una a otra.
 */

import { cop, esc, num, STYLES } from './doc-shared';

export interface ShortageListItem {
  name: string;
  /** Cantidad a comprar, en unidad de compra. */
  quantity: number;
  unitPurchase: string;
  /** Equivalencia en unidad de inventario ("48 unidad"). Null si es la misma. */
  equivalence: string | null;
  currentStock: number;
  thresholdMin: number;
  unitStock: string;
  estTotal: number | null;
  supplierName: string | null;
  note: string | null;
}

export interface ShortageListDoc {
  businessName: string;
  title: string;
  issuedOnLabel: string;
  requestedBy: string | null;
  notes: string | null;
  items: ShortageListItem[];
  estTotal: number;
  /** Ítems sin costo conocido: el total de abajo está incompleto y se dice. */
  itemsWithoutCost: number;
}

const SIN_PROVEEDOR = 'Sin proveedor asignado';

function renderItemRow(it: ShortageListItem): string {
  const falta = Math.max(it.thresholdMin - it.currentStock, 0);
  return `
    <tr>
      <td>
        ${esc(it.name)}
        ${it.note ? `<div class="sub">${esc(it.note)}</div>` : ''}
      </td>
      <td class="num">
        ${num(it.currentStock)} / ${num(it.thresholdMin)} ${esc(it.unitStock)}
        ${falta > 0 ? `<div class="sub">faltan ${num(falta)}</div>` : ''}
      </td>
      <td class="num">
        <strong>${num(it.quantity)} ${esc(it.unitPurchase)}</strong>
        ${it.equivalence ? `<div class="sub">${esc(it.equivalence)}</div>` : ''}
      </td>
      <td class="num">${it.estTotal === null ? '—' : cop(it.estTotal)}</td>
      <td class="check"></td>
    </tr>`;
}

/** Agrupa por proveedor conservando el orden de aparición. */
function groupBySupplier(items: ShortageListItem[]): Map<string, ShortageListItem[]> {
  const groups = new Map<string, ShortageListItem[]>();
  for (const it of items) {
    const key = it.supplierName ?? SIN_PROVEEDOR;
    const bucket = groups.get(key);
    if (bucket) bucket.push(it);
    else groups.set(key, [it]);
  }
  return groups;
}

function renderBody(items: ShortageListItem[]): string {
  const groups = groupBySupplier(items);
  // Un solo grupo no necesita encabezado: sería un rótulo repetido.
  const conEncabezado = groups.size > 1;

  return [...groups.entries()]
    .map(([supplier, rows]) => {
      const head = conEncabezado
        ? `<tr class="group"><td colspan="5">${esc(supplier)}</td></tr>`
        : '';
      return head + rows.map(renderItemRow).join('');
    })
    .join('');
}

function renderFooter(doc: ShortageListDoc): string {
  const sinCosto =
    doc.itemsWithoutCost > 0
      ? `${doc.itemsWithoutCost} ${doc.itemsWithoutCost === 1 ? 'ítem no tiene' : 'ítems no tienen'} costo conocido, así que el total es menor al que vas a pagar. `
      : '';
  return `${sinCosto}El costo estimado sale de la última compra registrada: sirve para presupuestar, no es un precio acordado.`;
}

function renderHeader(doc: ShortageListDoc): string {
  return `<header>
    <div>
      <h1>${esc(doc.title)}</h1>
      <div class="muted">${esc(doc.issuedOnLabel)}</div>
    </div>
    <div class="biz">
      <strong>${esc(doc.businessName)}</strong>
      ${doc.requestedBy ? `<div class="muted">Armada por ${esc(doc.requestedBy)}</div>` : ''}
    </div>
  </header>`;
}

export function renderShortageListHtml(doc: ShortageListDoc): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>${esc(doc.title)}</title>
${STYLES}
<style>
  tr.group td { padding-top: 16px; font-size: 9.5pt; text-transform: uppercase;
                letter-spacing: .05em; color: #5b6472; border-bottom: 1px solid #c9cfd8; }
  /* La casilla para ir tachando en el mercado. Con separación a la izquierda:
     pegada al costo se leía como parte de la cifra. */
  .check { width: 34px; padding-left: 14px; }
  .check::after { content: ""; display: block; width: 15px; height: 15px;
                  border: 1.5px solid #9aa3b0; border-radius: 3px; }
  th.check::after { content: none; }
</style>
</head>
<body>
  <div class="noprint"><button onclick="window.print()">Guardar como PDF</button></div>

  ${renderHeader(doc)}

  <table>
    <thead>
      <tr>
        <th>Insumo / producto</th>
        <th class="num">Hay / mínimo</th>
        <th class="num">Comprar</th>
        <th class="num">Costo estimado</th>
        <th class="check" aria-hidden="true"></th>
      </tr>
    </thead>
    <tbody>${renderBody(doc.items)}</tbody>
    <tfoot>
      <tr>
        <td colspan="3">Total estimado${doc.itemsWithoutCost > 0 ? ' (incompleto)' : ''}</td>
        <td class="num">${cop(doc.estTotal)}</td>
        <td></td>
      </tr>
    </tfoot>
  </table>

  ${doc.notes ? `<div class="note"><strong>Nota:</strong> ${esc(doc.notes)}</div>` : ''}

  <footer>${renderFooter(doc)}</footer>
</body>
</html>`;
}
