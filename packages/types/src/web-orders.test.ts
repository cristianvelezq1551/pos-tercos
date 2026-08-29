import { describe, expect, it } from 'vitest';
import { PaymentAccountInputSchema } from './business-config';
import { CreateWebOrderSchema } from './web-orders';

const UUID = '55555555-5555-4555-8555-555555555555';
const base = {
  items: [{ productId: UUID, quantity: 1 }],
  customerName: 'Ana Pérez',
  customerPhone: '+573001112233',
};

function reasons(r: { success: boolean; error?: { issues: { message: string }[] } }) {
  return r.success ? '' : r.error!.issues.map((i) => i.message).join(' | ');
}

describe('CreateWebOrderSchema — teléfono E.164 colombiano', () => {
  it('acepta +57 con 10 dígitos', () => {
    expect(CreateWebOrderSchema.safeParse({ ...base, type: 'WEB_PICKUP' }).success).toBe(true);
  });

  it.each([
    ['sin prefijo', '3001112233'],
    ['con espacios', '+57 300 111 2233'],
    ['dígitos de menos', '+5730011122'],
    ['dígitos de más', '+5730011122334'],
    ['otro país', '+5491112345678'],
  ])('rechaza %s', (_label, customerPhone) => {
    const r = CreateWebOrderSchema.safeParse({ ...base, customerPhone, type: 'WEB_PICKUP' });
    expect(r.success).toBe(false);
  });
});

describe('CreateWebOrderSchema — dirección según el tipo', () => {
  it('WEB_DELIVERY exige dirección', () => {
    const r = CreateWebOrderSchema.safeParse({ ...base, type: 'WEB_DELIVERY' });
    expect(r.success).toBe(false);
    expect(reasons(r)).toMatch(/dirección de entrega/i);
  });

  it('WEB_DELIVERY con dirección pasa', () => {
    const r = CreateWebOrderSchema.safeParse({
      ...base,
      type: 'WEB_DELIVERY',
      deliveryAddress: 'Calle 10 #4-20, torre 2 apto 502',
    });
    expect(r.success).toBe(true);
  });

  it('WEB_PICKUP rechaza dirección de entrega', () => {
    const r = CreateWebOrderSchema.safeParse({
      ...base,
      type: 'WEB_PICKUP',
      deliveryAddress: 'Calle 10 #4-20, torre 2',
    });
    expect(r.success).toBe(false);
    expect(reasons(r)).toMatch(/no lleva dirección/i);
  });

  it('WEB_PICKUP rechaza notas de entrega sueltas', () => {
    const r = CreateWebOrderSchema.safeParse({
      ...base,
      type: 'WEB_PICKUP',
      deliveryNotes: 'el timbre no suena',
    });
    expect(r.success).toBe(false);
  });
});

describe('CreateWebOrderSchema — coordenadas', () => {
  it('acepta el pedido SIN coordenadas (permiso GPS negado)', () => {
    expect(CreateWebOrderSchema.safeParse({ ...base, type: 'WEB_PICKUP' }).success).toBe(true);
  });

  it('rechaza latitud sin longitud (y viceversa)', () => {
    const soloLat = CreateWebOrderSchema.safeParse({
      ...base,
      type: 'WEB_PICKUP',
      customerLat: 4.6,
    });
    const soloLng = CreateWebOrderSchema.safeParse({
      ...base,
      type: 'WEB_PICKUP',
      customerLng: -74.1,
    });
    expect(soloLat.success).toBe(false);
    expect(reasons(soloLat)).toMatch(/juntas/i);
    expect(soloLng.success).toBe(false);
  });

  it('acepta el par completo dentro de rango', () => {
    const r = CreateWebOrderSchema.safeParse({
      ...base,
      type: 'WEB_PICKUP',
      customerLat: 4.60971,
      customerLng: -74.08175,
    });
    expect(r.success).toBe(true);
  });

  it('rechaza coordenadas fuera de rango', () => {
    const r = CreateWebOrderSchema.safeParse({
      ...base,
      type: 'WEB_PICKUP',
      customerLat: 91,
      customerLng: -74,
    });
    expect(r.success).toBe(false);
  });
});

describe('CreateWebOrderSchema — tope de líneas', () => {
  it('acepta 20 líneas y rechaza 21', () => {
    const mk = (n: number) => Array.from({ length: n }, () => ({ productId: UUID, quantity: 1 }));
    expect(
      CreateWebOrderSchema.safeParse({ ...base, items: mk(20), type: 'WEB_PICKUP' }).success,
    ).toBe(true);
    expect(
      CreateWebOrderSchema.safeParse({ ...base, items: mk(21), type: 'WEB_PICKUP' }).success,
    ).toBe(false);
  });

  it('rechaza un pedido sin líneas', () => {
    expect(
      CreateWebOrderSchema.safeParse({ ...base, items: [], type: 'WEB_PICKUP' }).success,
    ).toBe(false);
  });
});

/**
 * El número va en su PROPIO campo, separado del rótulo, porque en el mensaje
 * se imprime solo en su línea para que el cliente lo copie de un toque. Si el
 * schema dejara pasar una cuenta sin número, el mensaje diría "paga a Nequi"
 * sin decir a cuál.
 */
describe('PaymentAccountInputSchema', () => {
  it('exige rótulo y número', () => {
    expect(PaymentAccountInputSchema.safeParse({ label: 'Nequi', value: '' }).success).toBe(false);
    expect(PaymentAccountInputSchema.safeParse({ label: '', value: '3046706847' }).success).toBe(
      false,
    );
  });

  it('la nota es opcional y cae a cadena vacía', () => {
    const parsed = PaymentAccountInputSchema.parse({ label: 'Nequi', value: '3046706847' });
    expect(parsed.note).toBe('');
  });

  it('recorta los espacios que el dueño pega sin querer', () => {
    const parsed = PaymentAccountInputSchema.parse({
      label: '  Nequi ',
      value: ' 3046706847 ',
      note: ' Tercos ',
    });
    expect(parsed).toEqual({ label: 'Nequi', value: '3046706847', note: 'Tercos' });
  });

  it('un rótulo o número de solo espacios no pasa', () => {
    expect(PaymentAccountInputSchema.safeParse({ label: 'Nequi', value: '   ' }).success).toBe(
      false,
    );
  });
});
