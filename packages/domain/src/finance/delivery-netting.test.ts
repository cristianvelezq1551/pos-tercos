import { describe, expect, it } from 'vitest';
import { deliveryFeeShareOfPayment, netOfDeliveryFee } from './delivery-netting';

describe('deliveryFeeShareOfPayment', () => {
  it('sin envío no descuenta nada', () => {
    expect(deliveryFeeShareOfPayment(50_000, 50_000, 0)).toBe(0);
  });

  it('pago único carga el envío completo', () => {
    expect(deliveryFeeShareOfPayment(50_000, 50_000, 7_000)).toBe(7_000);
  });

  it('cuenta dividida en mitades: cada pago carga la mitad del envío', () => {
    expect(deliveryFeeShareOfPayment(30_000, 60_000, 12_000)).toBe(6_000);
  });

  it('reparte proporcional cuando las partes son desiguales', () => {
    expect(deliveryFeeShareOfPayment(45_000, 60_000, 12_000)).toBe(9_000);
    expect(deliveryFeeShareOfPayment(15_000, 60_000, 12_000)).toBe(3_000);
  });

  it('las partes de una venta suman exactamente el envío', () => {
    const total = 60_000;
    const fee = 12_000;
    const partes = [10_000, 20_000, 30_000];
    const suma = partes.reduce((a, p) => a + deliveryFeeShareOfPayment(p, total, fee), 0);
    expect(suma).toBeCloseTo(fee, 6);
  });

  it('un pago no puede cargar más envío del que hay', () => {
    // Defensivo: un pago mayor al total (dato corrupto) no debe sobre-restar.
    expect(deliveryFeeShareOfPayment(90_000, 60_000, 12_000)).toBe(12_000);
  });

  it('venta con total 0 no divide por cero', () => {
    expect(deliveryFeeShareOfPayment(0, 0, 7_000)).toBe(0);
  });

  it('un envío negativo (dato corrupto) no inventa plata', () => {
    expect(deliveryFeeShareOfPayment(50_000, 50_000, -7_000)).toBe(0);
  });
});

describe('netOfDeliveryFee', () => {
  it('deja solo lo de la comida', () => {
    expect(netOfDeliveryFee(50_000, 50_000, 7_000)).toBe(43_000);
  });

  it('sin envío devuelve el pago tal cual', () => {
    expect(netOfDeliveryFee(10_000, 10_000, 0)).toBe(10_000);
  });

  it('lo neto de todas las partes suma el total menos el envío', () => {
    const total = 60_000;
    const fee = 12_000;
    const partes = [30_000, 30_000];
    const suma = partes.reduce((a, p) => a + netOfDeliveryFee(p, total, fee), 0);
    expect(suma).toBe(total - fee);
  });
});
