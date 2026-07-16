/**
 * Comanda de COCINA en ESC/POS (58mm, 32 chars). A diferencia del recibo,
 * no lleva precios ni branding fiscal: solo lo que la cocina necesita —
 * pedido grande, hora, ítems con tamaño/modificadores/notas.
 * Pura: ComandaData → Buffer. El Print Agent la manda al device.
 */

export interface ComandaData {
  receiptNumber: number;
  /** ISO datetime de la venta. */
  createdAt: string;
  /** COUNTER | WEB_PICKUP | WEB_DELIVERY — la cocina distingue pedidos web. */
  type: string;
  customerName: string | null;
  /**
   * Solo WEB_DELIVERY. Se imprime GRANDE: este papel es lo que se lleva quien
   * reparte. Sin dirección en la comanda, el domicilio no sale.
   */
  deliveryAddress?: string | null;
  deliveryNotes?: string | null;
  /** Teléfono del cliente: si el repartidor no encuentra, llama. */
  customerPhone?: string | null;
  items: Array<{
    productName: string;
    sizeName: string | null;
    quantity: number;
    modifiers: string[];
    notes: string | null;
  }>;
  /** "REIMPRESIÓN" en re-impresiones de la comanda. */
  reprintLabel?: string | null;
  /** true = ticket de ANULACIÓN: el cobro se abandonó tras imprimir la comanda
   *  → la cocina debe DESCARTAR este pedido. */
  cancelled?: boolean;
  /** Pie centrado al final (nombre del negocio). Va seguido de un margen de
   *  papel en blanco para poder cortar a mano sin dañar el texto del pedido
   *  (estas impresoras no tienen cuchilla). */
  footer?: string | null;
  /** Encabezado: "COMANDA COCINA" (solo lo que se cocina) vs "COMANDA COMPLETA"
   *  (todo, incl. bebidas, para expedición/cajero). Default cocina. */
  title?: string | null;
}

export function renderComandaEscPos(comanda: ComandaData): Buffer {
  const out: Buffer[] = [];

  out.push(ESC_INIT);

  // Encabezado: qué es y de qué pedido. Un ticket de ANULACIÓN grita que la
  // cocina descarte el pedido (el cobro se abandonó tras imprimir la comanda).
  out.push(ALIGN_CENTER);
  out.push(BOLD_ON);
  if (comanda.cancelled) {
    out.push(SIZE_2H_2W);
    out.push(latin1('*** ANULAR ***'));
    out.push(LF);
    out.push(SIZE_NORMAL);
    out.push(latin1('DESCARTAR ESTE PEDIDO'));
  } else {
    out.push(latin1(`*** ${comanda.title && comanda.title.trim() ? comanda.title : 'COMANDA COCINA'} ***`));
  }
  out.push(BOLD_OFF);
  out.push(LF);
  if (comanda.reprintLabel) {
    out.push(BOLD_ON);
    out.push(latin1(`*** ${comanda.reprintLabel} ***`));
    out.push(BOLD_OFF);
    out.push(LF);
  }
  out.push(SIZE_2H_2W);
  out.push(BOLD_ON);
  out.push(latin1(`PEDIDO #${comanda.receiptNumber}`));
  out.push(BOLD_OFF);
  out.push(SIZE_NORMAL);
  out.push(LF);
  if (comanda.type === 'WEB_DELIVERY') {
    out.push(SIZE_2H);
    out.push(BOLD_ON);
    out.push(latin1('*** DOMICILIO ***'));
    out.push(BOLD_OFF);
    out.push(SIZE_NORMAL);
    out.push(LF);
  } else if (comanda.type === 'WEB_PICKUP') {
    out.push(BOLD_ON);
    out.push(latin1('PEDIDO WEB'));
    out.push(BOLD_OFF);
    out.push(LF);
  }
  out.push(latin1(formatTime(comanda.createdAt)));
  out.push(LF);
  if (comanda.customerName) {
    out.push(latin1(truncate(`Cliente: ${comanda.customerName}`, 32)));
    out.push(LF);
  }
  out.push(ALIGN_LEFT);

  // La dirección va ARRIBA de los ítems y en doble alto: es lo primero que
  // busca quien reparte, y este papel es su única guía.
  if (comanda.type === 'WEB_DELIVERY' && comanda.deliveryAddress) {
    out.push(SEPARATOR);
    out.push(BOLD_ON);
    out.push(latin1('ENTREGAR EN:'));
    out.push(BOLD_OFF);
    out.push(LF);
    out.push(SIZE_2H);
    for (const line of wrap(comanda.deliveryAddress, 32)) {
      out.push(latin1(line));
      out.push(LF);
    }
    out.push(SIZE_NORMAL);
    if (comanda.deliveryNotes) {
      for (const line of wrap(comanda.deliveryNotes, 32)) {
        out.push(latin1(line));
        out.push(LF);
      }
    }
    if (comanda.customerPhone) {
      out.push(BOLD_ON);
      out.push(latin1(truncate(`Tel: ${comanda.customerPhone}`, 32)));
      out.push(BOLD_OFF);
      out.push(LF);
    }
  }

  out.push(SEPARATOR);

  // Ítems: cantidad + producto en doble alto (legible a un metro).
  for (const item of comanda.items) {
    out.push(SIZE_2H);
    out.push(BOLD_ON);
    out.push(
      latin1(
        truncate(
          `${item.quantity}x ${item.productName}${item.sizeName ? ` ${item.sizeName}` : ''}`,
          32,
        ),
      ),
    );
    out.push(BOLD_OFF);
    out.push(SIZE_NORMAL);
    out.push(LF);
    for (const mod of item.modifiers) {
      out.push(latin1(truncate(`   + ${mod}`, 32)));
      out.push(LF);
    }
    if (item.notes) {
      out.push(BOLD_ON);
      out.push(latin1(truncate(`   * ${item.notes}`, 32)));
      out.push(BOLD_OFF);
      out.push(LF);
    }
  }
  out.push(SEPARATOR);

  // Pie + margen de corte. Estas impresoras NO tienen cuchilla: el cajero/cocina
  // corta a mano. El nombre del negocio marca el final del pedido y los saltos
  // en blanco empujan el papel para que el desgarro NO caiga sobre los ítems.
  out.push(LF);
  out.push(ALIGN_CENTER);
  out.push(BOLD_ON);
  out.push(latin1(truncate(comanda.footer && comanda.footer.trim() ? comanda.footer : 'TERCOS', 32)));
  out.push(BOLD_OFF);
  out.push(ALIGN_LEFT);
  out.push(FEED_TEAR_MARGIN);
  out.push(CUT_PARTIAL);

  return Buffer.concat(out);
}

// Constantes ESC/POS (mismas del recibo; duplicadas a propósito: cada
// render es autocontenido y el set es estable por hardware).
const ESC_INIT = Buffer.from([0x1b, 0x40]);
const LF = Buffer.from([0x0a]);
const ALIGN_LEFT = Buffer.from([0x1b, 0x61, 0x00]);
const ALIGN_CENTER = Buffer.from([0x1b, 0x61, 0x01]);
const BOLD_ON = Buffer.from([0x1b, 0x45, 0x01]);
const BOLD_OFF = Buffer.from([0x1b, 0x45, 0x00]);
const SIZE_NORMAL = Buffer.from([0x1d, 0x21, 0x00]);
const SIZE_2H = Buffer.from([0x1d, 0x21, 0x01]);
const SIZE_2H_2W = Buffer.from([0x1d, 0x21, 0x11]);
const CUT_PARTIAL = Buffer.from([0x1d, 0x56, 0x01]);
const SEPARATOR = Buffer.from('-'.repeat(32) + '\n', 'latin1');
/** Margen inferior (6 líneas) para cortar a mano sin dañar el texto del pedido. */
const FEED_TEAR_MARGIN = Buffer.from('\n'.repeat(6), 'latin1');

function latin1(s: string): Buffer {
  return Buffer.from(s, 'latin1');
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

/**
 * Parte el texto en líneas de `max` chars sin cortar palabras. La dirección NO
 * se puede truncar: "Cra 43A #5-15, torre 2, apto 502" recortado a 32 pierde
 * justo el apartamento, que es lo único que el repartidor necesita al final.
 * Una palabra más larga que el ancho (una URL, un pegote sin espacios) se corta
 * a la fuerza — es eso o descartarla.
 */
function wrap(text: string, max: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.trim().split(/\s+/)) {
    if (!line) {
      line = word;
    } else if (line.length + 1 + word.length <= max) {
      line += ` ${word}`;
    } else {
      lines.push(line);
      line = word;
    }
    while (line.length > max) {
      lines.push(line.slice(0, max));
      line = line.slice(max);
    }
  }
  if (line) lines.push(line);
  return lines;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
