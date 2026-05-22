import { describe, it, expect } from 'vitest';
import {
  buildPaymentInstructionsMessage,
  buildPaymentReceivedMessage,
  buildPickupReadyMessage,
  buildNotificationMessage,
} from './messages';
import type { WhatsAppSaleSnapshot, WhatsAppMessageOptions } from './types';

const SALE: WhatsAppSaleSnapshot = {
  receiptNumber: 42,
  customerName: 'Juan Pérez',
  customerPhone: '+573001234567',
  total: 25500,
};

const OPTS: WhatsAppMessageOptions = {
  businessName: 'Tercos',
  businessAddressShort: 'Cra 43A # 11-12, Medellín',
  paymentInstructions: 'Nequi: 300 123 4567',
};

describe('whatsapp messages', () => {
  it('instrucciones: incluye primer nombre, pedido, total y datos de pago', () => {
    const msg = buildPaymentInstructionsMessage(SALE, OPTS);
    expect(msg).toContain('Hola Juan');
    expect(msg).toContain('#42');
    expect(msg).toContain('$25.500');
    expect(msg).toContain('Tercos');
    expect(msg).toContain('Nequi: 300 123 4567');
    expect(msg).toContain('comprobante');
  });

  it('instrucciones: sin paymentInstructions omite el bloque de pago', () => {
    const msg = buildPaymentInstructionsMessage(SALE, { businessName: 'Tercos' });
    expect(msg).toContain('#42');
    expect(msg).not.toContain('Nequi');
  });

  it('recibido: incluye check, cocina y nombre del local', () => {
    const msg = buildPaymentReceivedMessage(SALE, OPTS);
    expect(msg).toContain('#42');
    expect(msg).toContain('✅');
    expect(msg).toContain('cocina');
    expect(msg).toContain('Tercos');
  });

  it('listo: incluye dirección cuando hay businessAddressShort', () => {
    const msg = buildPickupReadyMessage(SALE, OPTS);
    expect(msg).toContain('listo para retirar');
    expect(msg).toContain('Cra 43A # 11-12, Medellín');
  });

  it('listo: sin dirección omite "Te esperamos"', () => {
    const msg = buildPickupReadyMessage(SALE, { businessName: 'Tercos' });
    expect(msg).toContain('listo para retirar');
    expect(msg).not.toContain('Te esperamos');
  });

  it('customerName null → "Hola"', () => {
    const msg = buildPaymentReceivedMessage({ ...SALE, customerName: null }, OPTS);
    expect(msg).toContain('Hola,');
  });

  it('formatCop con millones → puntos de miles', () => {
    const msg = buildPaymentInstructionsMessage({ ...SALE, total: 1234567 }, OPTS);
    expect(msg).toContain('$1.234.567');
  });

  it('buildNotificationMessage dispatcher equivale al builder directo', () => {
    expect(buildNotificationMessage('payment_received', SALE, OPTS)).toBe(
      buildPaymentReceivedMessage(SALE, OPTS),
    );
    expect(buildNotificationMessage('pickup_ready', SALE, OPTS)).toBe(
      buildPickupReadyMessage(SALE, OPTS),
    );
  });
});
