import { describe, expect, it } from 'vitest';
import { validateCheckout } from './checkout-validation';
import type { SplitResult } from '../components/split/SplitPaymentSection';

/**
 * El habilitado/deshabilitado del botón Confirmar del cobro nace acá — un
 * mutante en esta función cobra de menos o bloquea el mostrador. Mutantes que
 * estos tests matan: >= → > en efectivo (informe A6: redondeo a nivel centavo),
 * doble verificación digital salteada, split confirmable sin cuadrar.
 */

const BASE = {
  splitOpen: false,
  splitResult: null as SplitResult | null,
  splitReason: null as string | null,
  method: null,
  cashNum: 0,
  doubleVerified: false,
  total: 10000,
};

describe('validateCheckout', () => {
  it('sin método → inválido', () => {
    expect(validateCheckout({ ...BASE }).ok).toBe(false);
  });

  it('CASH: recibido menor al total → inválido con faltante', () => {
    const v = validateCheckout({ ...BASE, method: 'CASH', cashNum: 9999 });
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/Faltan/);
  });

  it('CASH: recibido EXACTO → válido (mutante >= → > cobraría de más)', () => {
    expect(validateCheckout({ ...BASE, method: 'CASH', cashNum: 10000 }).ok).toBe(true);
  });

  it('CASH: un centavo por debajo → inválido (mutante de redondeo, informe A6)', () => {
    const v = validateCheckout({ ...BASE, method: 'CASH', cashNum: 10000, total: 10000.01 });
    expect(v.ok).toBe(false);
  });

  it('CASH: recibido de más → válido (el vuelto lo maneja el flujo)', () => {
    expect(validateCheckout({ ...BASE, method: 'CASH', cashNum: 20000 }).ok).toBe(true);
  });

  it('digital sin doble verificación → inválido', () => {
    const v = validateCheckout({ ...BASE, method: 'TRANSFER' });
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/transferencia/);
  });

  it('digital verificada → válido', () => {
    expect(validateCheckout({ ...BASE, method: 'TRANSFER', doubleVerified: true }).ok).toBe(true);
  });

  it('split abierto sin resultado → inválido con la razón del editor', () => {
    const v = validateCheckout({
      ...BASE,
      splitOpen: true,
      splitReason: 'Falta cobrar a 2 personas',
    });
    expect(v.ok).toBe(false);
    expect(v.reason).toBe('Falta cobrar a 2 personas');
  });

  it('split abierto con resultado completo → válido (ignora method/cash)', () => {
    const v = validateCheckout({
      ...BASE,
      splitOpen: true,
      splitResult: { payments: [] } as unknown as SplitResult,
    });
    expect(v.ok).toBe(true);
  });
});
