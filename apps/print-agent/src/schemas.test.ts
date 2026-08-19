import { describe, expect, it } from 'vitest';
import { renderReceiptEscPos } from '@pos-tercos/domain';
import { businessFromEnv, DrawerBodySchema, PrintBodySchema } from './schemas';

/**
 * El contrato de /print es lo único que separa "imprimir el recibo correcto" de
 * "escupir bytes basura a la térmica". Mutantes que estos tests matan:
 * - aceptar un body sin `escposBase64` NI `receipt` → el agent imprimiría un
 *   buffer vacío y devolvería 200 (el cajero cree que salió).
 * - aceptar `printer: ""` → ruteo a una impresora inexistente.
 */

const receipt = {
  receiptNumber: 42,
  createdAt: '2026-07-22T15:00:00.000Z',
  cashierName: 'Cajero Dev',
  customerName: null,
  items: [
    {
      productName: 'Tercos Burger',
      sizeName: null,
      quantity: 1,
      unitPrice: 20_000,
      lineSubtotal: 20_000,
      lineDiscount: 0,
      lineTotal: 20_000,
      appliedPromotionName: null,
      modifiers: [],
    },
  ],
  subtotal: 20_000,
  discountTotal: 0,
  total: 20_000,
  reprintLabel: null,
};

describe('PrintBodySchema — hay que mandar algo que imprimir', () => {
  it('rechaza un body sin bytes NI recibo', () => {
    const r = PrintBodySchema.safeParse({ printer: 'Cocina' });
    expect(r.success).toBe(false);
    expect(r.success === false && r.error.issues[0].message).toMatch(/Falta escposBase64/);
  });

  it('rechaza escposBase64 vacío (imprimiría 0 bytes con 200 OK)', () => {
    expect(PrintBodySchema.safeParse({ escposBase64: '' }).success).toBe(false);
  });

  it('acepta el modo ONLINE: bytes ya renderizados por el backend', () => {
    expect(PrintBodySchema.safeParse({ escposBase64: 'GyFA' }).success).toBe(true);
  });

  it('acepta el modo OFFLINE: el recibo en datos', () => {
    expect(PrintBodySchema.safeParse({ receipt }).success).toBe(true);
  });

  it('acepta el recibo offline con número provisional (venta sin backend)', () => {
    const r = PrintBodySchema.safeParse({
      receipt: { ...receipt, provisionalNumber: 'OFF-7', openDrawer: true },
    });
    expect(r.success).toBe(true);
  });

  it('rechaza un recibo al que le falta un total (no se puede cuadrar el ticket)', () => {
    const { total: _omitido, ...sinTotal } = receipt;
    expect(PrintBodySchema.safeParse({ receipt: sinTotal }).success).toBe(false);
  });

  it('rechaza una impresora destino vacía', () => {
    expect(PrintBodySchema.safeParse({ escposBase64: 'GyFA', printer: '' }).success).toBe(false);
  });

  it('acepta printer null u omitido (usa la del .env)', () => {
    expect(PrintBodySchema.safeParse({ escposBase64: 'GyFA', printer: null }).success).toBe(true);
    expect(PrintBodySchema.safeParse({ escposBase64: 'GyFA' }).success).toBe(true);
  });
});

describe('DrawerBodySchema — apertura del cajón', () => {
  it('acepta body ausente (abre la impresora del .env)', () => {
    expect(DrawerBodySchema.safeParse(undefined).success).toBe(true);
  });

  it('acepta body vacío y con impresora explícita', () => {
    expect(DrawerBodySchema.safeParse({}).success).toBe(true);
    expect(DrawerBodySchema.safeParse({ printer: 'Cajero' }).success).toBe(true);
  });

  it('rechaza una impresora vacía', () => {
    expect(DrawerBodySchema.safeParse({ printer: '' }).success).toBe(false);
  });
});

describe('businessFromEnv — encabezado del recibo offline', () => {
  it('toma los datos del .env del agent', () => {
    expect(
      businessFromEnv({
        BUSINESS_NAME: 'Tercos Burgers',
        BUSINESS_ADDRESS: 'Calle 10 #4-20',
        BUSINESS_NIT: '901.234.567-8',
        BUSINESS_PHONE: '+573001112233',
      } as NodeJS.ProcessEnv),
    ).toEqual({
      name: 'Tercos Burgers',
      address: 'Calle 10 #4-20',
      nit: '901.234.567-8',
      phone: '+573001112233',
    });
  });

  it('cae a valores marcadores visibles (no a cadenas vacías que pasen inadvertidas)', () => {
    const b = businessFromEnv({} as NodeJS.ProcessEnv);
    expect(b.name).toBe('POS Tercos');
    expect(b.address).toMatch(/por configurar/);
    expect(b.phone).toBeNull();
  });
});

describe('integración: un recibo válido rinde bytes ESC/POS imprimibles', () => {
  it('el schema y el renderer de domain encajan (el agent no arma basura)', () => {
    const parsed = PrintBodySchema.parse({ receipt });
    const bytes = renderReceiptEscPos({
      ...parsed.receipt!,
      business: businessFromEnv({} as NodeJS.ProcessEnv),
    });
    expect(Buffer.isBuffer(bytes)).toBe(true);
    expect(bytes.length).toBeGreaterThan(0);
    // ESC @ — secuencia de inicialización con la que abre todo ticket ESC/POS.
    expect(bytes.subarray(0, 2)).toEqual(Buffer.from([0x1b, 0x40]));
    expect(bytes.toString('latin1')).toContain('Tercos Burger');
  });
});
