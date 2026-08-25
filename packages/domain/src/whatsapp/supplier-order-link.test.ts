import { describe, expect, it } from 'vitest';
import {
  buildSupplierOrderLink,
  buildSupplierOrderMessage,
  type SupplierOrderLinkInput,
} from './supplier-order-link';

const base: SupplierOrderLinkInput = {
  supplierPhone: '+57 301 928 1232',
  supplierName: 'Distripan',
  businessName: 'Tercos Burgers',
  items: [{ name: 'Pan brioche', quantity: 3, unitPurchase: 'paquete' }],
};

describe('buildSupplierOrderLink', () => {
  it('arma el link con el teléfono normalizado y el texto encodeado', () => {
    const link = buildSupplierOrderLink(base);
    expect(link).not.toBeNull();
    expect(link!.url.startsWith('https://wa.me/573019281232?text=')).toBe(true);
    expect(decodeURIComponent(link!.url.split('?text=')[1])).toBe(link!.messagePlain);
  });

  it('devuelve null si el proveedor no tiene teléfono utilizable', () => {
    expect(buildSupplierOrderLink({ ...base, supplierPhone: null })).toBeNull();
    expect(buildSupplierOrderLink({ ...base, supplierPhone: '123' })).toBeNull();
  });
});

describe('buildSupplierOrderMessage', () => {
  it('incluye proveedor, negocio, cantidad con unidad y el cierre de confirmación', () => {
    const msg = buildSupplierOrderMessage(base);
    expect(msg).toContain('*Distripan*');
    expect(msg).toContain('*Tercos Burgers*');
    expect(msg).toContain('*Pan brioche* — 3 paquete');
    expect(msg).toContain('¿Nos confirmas si lo tienes y a qué hora lo puedes despachar?');
  });

  it('NUNCA menciona precios ni totales', () => {
    const msg = buildSupplierOrderMessage({
      ...base,
      neededByLabel: 'mañana, martes 28 de julio',
      note: 'que venga fresco',
      deliveryAddress: 'Cra 1 #2-3',
      requestedBy: 'Cristian Vélez',
      businessPhoneDisplay: '320 761 5261',
    });
    expect(msg).not.toContain('$');
    expect(msg.toLowerCase()).not.toContain('precio');
    expect(msg.toLowerCase()).not.toContain('total');
    expect(msg.toLowerCase()).not.toContain('cotiz');
  });

  it('numera los ítems cuando hay más de uno', () => {
    const msg = buildSupplierOrderMessage({
      ...base,
      items: [
        { name: 'Pan', quantity: 2, unitPurchase: 'paquete' },
        { name: 'Queso', quantity: 1, unitPurchase: 'kg' },
      ],
    });
    expect(msg).toContain('(2 ítems)');
    expect(msg).toContain('1. *Pan* — 2 paquete');
    expect(msg).toContain('2. *Queso* — 1 kg');
  });

  it('agrega día, nota, dirección y contacto cuando existen', () => {
    const msg = buildSupplierOrderMessage({
      ...base,
      neededByLabel: 'mañana, martes 28 de julio',
      note: 'que venga fresco',
      deliveryAddress: 'Cra 1 #2-3',
      requestedBy: 'Cristian Vélez',
      businessPhoneDisplay: '320 761 5261',
    });
    expect(msg).toContain('Lo necesitamos: *mañana, martes 28 de julio*');
    expect(msg).toContain('Nota: que venga fresco');
    expect(msg).toContain('Entrega en: Cra 1 #2-3');
    expect(msg).toContain('Contacto: Cristian Vélez · 320 761 5261');
    expect(msg.includes('\n\n\n')).toBe(false);
  });

  it('omite las líneas de día, nota, dirección y contacto si no hay datos', () => {
    const msg = buildSupplierOrderMessage(base);
    expect(msg).not.toContain('Lo necesitamos:');
    expect(msg).not.toContain('Nota:');
    expect(msg).not.toContain('Entrega en:');
    expect(msg).not.toContain('Contacto:');
    expect(msg.includes('\n\n\n')).toBe(false);
  });

  it('redondea cantidades fraccionarias a 2 decimales', () => {
    const msg = buildSupplierOrderMessage({
      ...base,
      items: [{ name: 'Carne', quantity: 2.567, unitPurchase: 'kg' }],
    });
    expect(msg).toContain('*Carne* — 2.57 kg');
  });
});
