/**
 * Comanda de COCINA en ESC/POS (58mm, 32 chars). A diferencia del recibo,
 * no lleva precios ni branding fiscal: solo lo que la cocina necesita —
 * pedido grande, hora, ítems con tamaño/modificadores/notas.
 * Pura: ComandaData → Buffer. El Print Agent la manda al device.
 */

export interface ComandaData {
  receiptNumber: number;
  /** Turno del cliente. Suele ser null: la comanda sale al COBRAR, antes
   *  de confirmar el pago (el turno se asigna al pagar). */
  turnNumber: number | null;
  /** ISO datetime de la venta. */
  createdAt: string;
  /** COUNTER | WEB_PICKUP — la cocina distingue pedidos web. */
  type: string;
  customerName: string | null;
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
    out.push(latin1('*** COMANDA COCINA ***'));
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
  out.push(
    latin1(
      comanda.turnNumber !== null
        ? `TURNO ${comanda.turnNumber}`
        : `PEDIDO #${comanda.receiptNumber}`,
    ),
  );
  out.push(BOLD_OFF);
  out.push(SIZE_NORMAL);
  out.push(LF);
  if (comanda.type === 'WEB_PICKUP') {
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
  out.push(LF);
  out.push(LF);
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

function latin1(s: string): Buffer {
  return Buffer.from(s, 'latin1');
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
