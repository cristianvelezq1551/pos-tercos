import { truncate, twoCol, wrap } from './escpos-text';
import type { ReceiptData } from './types';
import { BUSINESS_TIME_ZONE } from '@pos-tercos/types';

/**
 * ESC/POS bytes para impresoras térmicas de 58mm (32 caracteres por línea;
 * ej. Neotek 58mm USB/Bluetooth, similares).
 * Función pura: recibe ReceiptData, devuelve Buffer con la secuencia
 * de comandos. El Print Agent local toma estos bytes y los envía al
 * device físico (USB / serial / network).
 *
 * Comandos usados:
 *  - ESC @ (0x1B 0x40)         — initialize printer
 *  - ESC a n (0x1B 0x61)       — alignment (0=left, 1=center, 2=right)
 *  - ESC E n (0x1B 0x45)       — bold (1=on, 0=off)
 *  - GS ! n (0x1D 0x21)        — character size (height/width bits)
 *  - LF (0x0A)                 — line feed
 *  - GS V m (0x1D 0x56)        — partial cut (m=1 partial, 0 full)
 *  - ESC p m t1 t2 (0x1B 0x70) — generate pulse to drawer kick connector
 *
 * Codepage default es PC437. Para acentos en español/colombiano la
 * impresora debería estar configurada en codepage 858 o WPC1252. Acá
 * usamos `latin1` al codificar, que mapea bien con WPC1252.
 */
export function renderReceiptEscPos(receipt: ReceiptData): Buffer {
  const out: Buffer[] = [];

  // Init
  out.push(ESC_INIT);

  // Header — center, double height
  out.push(ALIGN_CENTER);
  out.push(SIZE_2H_2W);
  out.push(BOLD_ON);
  out.push(latin1(receipt.business.name));
  out.push(LF);
  out.push(BOLD_OFF);
  out.push(SIZE_NORMAL);
  out.push(latin1(receipt.business.address));
  out.push(LF);
  out.push(latin1(`NIT ${receipt.business.nit}`));
  out.push(LF);
  if (receipt.business.phone) {
    out.push(latin1(`Tel: ${receipt.business.phone}`));
    out.push(LF);
  }
  out.push(LF);

  // Venta OFFLINE: número provisional (OFF-N) grande y centrado para que el
  // cliente lo referencie mientras se sincroniza.
  if (receipt.provisionalNumber) {
    out.push(ALIGN_CENTER);
    out.push(latin1('PROVISIONAL'));
    out.push(LF);
    out.push(BOLD_ON);
    out.push(SIZE_2H_2W);
    out.push(latin1(receipt.provisionalNumber));
    out.push(SIZE_NORMAL);
    out.push(BOLD_OFF);
    out.push(LF);
    out.push(LF);
  }

  // Receipt # + datetime + cashier
  out.push(ALIGN_LEFT);
  out.push(BOLD_ON);
  out.push(
    latin1(
      receipt.cortesia
        ? 'CORTESÍA'
        : receipt.provisionalNumber
          ? 'RECIBO PROVISIONAL'
          : `RECIBO #${receipt.receiptNumber}`,
    ),
  );
  out.push(BOLD_OFF);
  if (receipt.provisionalNumber) {
    out.push(LF);
    out.push(BOLD_ON);
    out.push(latin1('PENDIENTE DE SINCRONIZAR'));
    out.push(BOLD_OFF);
  }
  if (receipt.reprintLabel) {
    out.push(LF);
    out.push(BOLD_ON);
    out.push(latin1(`*** ${receipt.reprintLabel} ***`));
    out.push(BOLD_OFF);
  }
  out.push(LF);
  out.push(latin1(formatDate(receipt.createdAt)));
  out.push(LF);
  if (receipt.cashierName) {
    out.push(latin1(`Cajero: ${receipt.cashierName}`));
    out.push(LF);
  }
  if (receipt.customerName) {
    out.push(latin1(`Cliente: ${receipt.customerName}`));
    out.push(LF);
  }
  if (receipt.cortesia) {
    for (const linea of wrap(`Motivo: ${receipt.cortesia.motivo}`, 32)) {
      out.push(latin1(linea));
      out.push(LF);
    }
  }
  out.push(SEPARATOR);

  // Items
  for (const item of receipt.items) {
    const headLine =
      `${item.quantity}x ${item.productName}` + (item.sizeName ? ` ${item.sizeName}` : '');
    out.push(latin1(truncate(headLine, 32)));
    out.push(LF);
    if (item.modifiers.length > 0) {
      out.push(latin1(`  + ${item.modifiers.map((m) => m.name).join(', ')}`));
      out.push(LF);
    }
    out.push(latin1(twoCol(`  ${formatCop(item.unitPrice)}`, formatCop(item.lineSubtotal), 32)));
    out.push(LF);
    if (item.lineDiscount > 0) {
      out.push(
        latin1(
          twoCol(
            `  promo${item.appliedPromotionName ? ' ' + item.appliedPromotionName : ''}`,
            `-${formatCop(item.lineDiscount)}`,
            32,
          ),
        ),
      );
      out.push(LF);
    }
  }
  out.push(SEPARATOR);

  // Totals
  out.push(latin1(twoCol('Subtotal', formatCop(receipt.subtotal), 32)));
  out.push(LF);
  if (receipt.discountTotal > 0) {
    out.push(latin1(twoCol('Descuentos', `-${formatCop(receipt.discountTotal)}`, 32)));
    out.push(LF);
  }
  if (receipt.deliveryFee && receipt.deliveryFee > 0) {
    out.push(latin1(twoCol('Domicilio', formatCop(receipt.deliveryFee), 32)));
    out.push(LF);
  }
  if (receipt.cortesia) {
    // El valor NO se esconde: el cliente tiene que ver lo que se le regaló, y
    // el papel es el respaldo de por qué ese producto salió sin cobrarse.
    out.push(latin1(twoCol('Valor regalado', formatCop(receipt.cortesia.valorRegalado), 32)));
    out.push(LF);
  }
  out.push(BOLD_ON);
  out.push(SIZE_2H);
  out.push(latin1(twoCol('TOTAL', formatCop(receipt.cortesia ? 0 : receipt.total), 16)));
  out.push(SIZE_NORMAL);
  out.push(BOLD_OFF);
  out.push(LF);

  // Cuenta dividida: desglose por parte (método + monto + vuelto en efectivo).
  if (receipt.payments && receipt.payments.length > 1) {
    out.push(LF);
    out.push(latin1('PAGOS (cuenta dividida)'));
    out.push(LF);
    for (const pay of receipt.payments) {
      out.push(latin1(twoCol(`  ${methodLabel(pay.method)}`, formatCop(pay.amount), 32)));
      out.push(LF);
      if (pay.amountReceived !== null && pay.amountReceived > pay.amount) {
        out.push(
          latin1(
            twoCol(
              '    recibido / vuelto',
              `${formatCop(pay.amountReceived)} / ${formatCop(pay.amountReceived - pay.amount)}`,
              32,
            ),
          ),
        );
        out.push(LF);
      }
    }
  }
  out.push(LF);

  // Footer
  out.push(ALIGN_CENTER);
  out.push(latin1(receipt.cortesia ? 'Cortesía de la casa. ¡Gracias!' : '¡Gracias por tu compra!'));
  out.push(LF);

  // Abrir cajón monedero (ventas en efectivo) — pulso RJ-11 antes del margen.
  if (receipt.openDrawer) {
    out.push(DRAWER_KICK);
  }

  // Margen de corte: estas impresoras térmicas NO tienen cuchilla (el comando
  // de corte de abajo lo ignoran). El espacio en blanco empuja el papel para
  // poder cortar a mano sin que la factura quede pegada al ticket siguiente
  // (ej. cuando comanda y factura salen por la misma impresora).
  out.push(FEED_TEAR_MARGIN);
  out.push(CUT_PARTIAL);

  return Buffer.concat(out);
}

/**
 * Comando ESC/POS para abrir el cajón monedero conectado al puerto
 * RJ-11 de la impresora. Pulse pin 2, on=50ms, off=50ms.
 */
export const DRAWER_KICK = Buffer.from([0x1b, 0x70, 0x00, 0x32, 0x32]);

// ====================================================================
// CONSTANTES ESC/POS
// ====================================================================

const ESC_INIT = Buffer.from([0x1b, 0x40]);
const LF = Buffer.from([0x0a]);
const ALIGN_LEFT = Buffer.from([0x1b, 0x61, 0x00]);
const ALIGN_CENTER = Buffer.from([0x1b, 0x61, 0x01]);
const BOLD_ON = Buffer.from([0x1b, 0x45, 0x01]);
const BOLD_OFF = Buffer.from([0x1b, 0x45, 0x00]);
const SIZE_NORMAL = Buffer.from([0x1d, 0x21, 0x00]);
const SIZE_2H = Buffer.from([0x1d, 0x21, 0x01]); // double height
const SIZE_2H_2W = Buffer.from([0x1d, 0x21, 0x11]); // double height + width
const CUT_PARTIAL = Buffer.from([0x1d, 0x56, 0x01]);
/** Margen inferior (6 líneas) para cortar a mano sin pegar dos tickets. */
const FEED_TEAR_MARGIN = Buffer.from('\n'.repeat(6), 'latin1');
const SEPARATOR = Buffer.from('-'.repeat(32) + '\n', 'latin1');

// ====================================================================
// HELPERS PUROS
// ====================================================================

function latin1(s: string): Buffer {
  return Buffer.from(s, 'latin1');
}

function formatCop(n: number): string {
  const r = Math.round(n);
  return '$' + r.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('es-CO', {
    timeZone: BUSINESS_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const METHOD_LABELS: Record<string, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  NEQUI: 'Nequi',
  DAVIPLATA: 'Daviplata',
  QR_BANCOLOMBIA: 'QR Bancolombia',
  TRANSFER: 'Transferencia',
};

function methodLabel(method: string): string {
  return METHOD_LABELS[method] ?? method;
}
