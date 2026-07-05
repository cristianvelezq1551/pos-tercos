import { describe, expect, it } from 'vitest';
import {
  buildNotificationTemplate,
  buildOwnerAlertTemplate,
  sanitizeTemplateParam,
  WHATSAPP_TEMPLATE_NAMES,
} from './templates';
import type { WhatsAppSaleSnapshot } from './types';

const SALE: WhatsAppSaleSnapshot = {
  receiptNumber: 123,
  customerName: 'Pedro Pérez',
  customerPhone: '+573001234567',
  total: 28_000,
};

const OPTS = {
  businessName: 'Tercos',
  businessAddressShort: 'Cra 10 #20-30',
  paymentInstructions: 'Nequi: 300 123 4567\nBancolombia: 123-456789-00',
};

describe('sanitizeTemplateParam', () => {
  it('aplana saltos de línea y tabs a " | " (Meta los rechaza en variables)', () => {
    expect(sanitizeTemplateParam('línea 1\nlínea 2\n\tlínea 3')).toBe(
      'línea 1 | línea 2 | línea 3',
    );
  });

  it('colapsa espacios múltiples y trimea', () => {
    expect(sanitizeTemplateParam('  hola    mundo  ')).toBe('hola mundo');
  });
});

describe('buildNotificationTemplate', () => {
  it('payment_instructions: 5 variables en orden con instrucciones aplanadas', () => {
    const t = buildNotificationTemplate('payment_instructions', SALE, OPTS);
    expect(t.name).toBe(WHATSAPP_TEMPLATE_NAMES.payment_instructions);
    expect(t.languageCode).toBe('es');
    expect(t.variables).toEqual([
      'Pedro Pérez',
      '123',
      'Tercos',
      expect.stringContaining('28.000'),
      'Nequi: 300 123 4567 | Bancolombia: 123-456789-00',
    ]);
  });

  it('pickup_ready: 4 variables; dirección con fallback "el local"', () => {
    const t = buildNotificationTemplate('pickup_ready', SALE, {
      ...OPTS,
      businessAddressShort: null,
    });
    expect(t.name).toBe(WHATSAPP_TEMPLATE_NAMES.pickup_ready);
    expect(t.variables).toEqual(['Pedro Pérez', '123', 'Tercos', 'el local']);
  });

  it('payment_received y canceled: 3 variables; nombre con fallback "Cliente"', () => {
    const anon = { ...SALE, customerName: null };
    expect(buildNotificationTemplate('payment_received', anon, OPTS).variables).toEqual([
      'Cliente',
      '123',
      'Tercos',
    ]);
    const c = buildNotificationTemplate('canceled', anon, OPTS);
    expect(c.name).toBe('order_canceled');
    expect(c.variables).toHaveLength(3);
  });

  it('ninguna variable lleva saltos de línea', () => {
    const stages = ['payment_instructions', 'payment_received', 'pickup_ready', 'canceled'] as const;
    for (const stage of stages) {
      const t = buildNotificationTemplate(stage, SALE, OPTS);
      for (const v of t.variables) {
        expect(v).not.toMatch(/[\r\n\t]/);
        expect(v.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('buildOwnerAlertTemplate', () => {
  it('aplana la alerta multi-línea a una variable', () => {
    const t = buildOwnerAlertTemplate('[Tercos] 🚫 Venta ANULADA\n\nRecibo: #5\nMonto: $10.000');
    expect(t.name).toBe('alerta_negocio');
    expect(t.variables).toEqual(['[Tercos] 🚫 Venta ANULADA | Recibo: #5 | Monto: $10.000']);
  });
});
