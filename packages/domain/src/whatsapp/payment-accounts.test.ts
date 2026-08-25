import { describe, expect, it } from 'vitest';
import { buildPaymentAccountsText } from './payment-accounts';

const NEQUI = { label: 'Nequi', value: '3046706847', note: 'a nombre de Tercos' };
const BANCO = { label: 'Bancolombia ahorros', value: '12345678', note: '' };

describe('buildPaymentAccountsText', () => {
  it('el número queda SOLO en su línea (se copia de un toque)', () => {
    const txt = buildPaymentAccountsText([NEQUI])!;
    expect(txt.split('\n')).toContain('3046706847');
  });

  it('no mete negrita ni signos alrededor del número', () => {
    // Los asteriscos de WhatsApp se cuelan en el portapapeles de algunos clientes.
    const txt = buildPaymentAccountsText([NEQUI, BANCO])!;
    expect(txt).not.toContain('*');
    expect(txt).not.toContain(':');
  });

  it('separa cuentas con una línea en blanco', () => {
    expect(buildPaymentAccountsText([NEQUI, BANCO])).toBe(
      'Nequi\n3046706847\na nombre de Tercos\n\nBancolombia ahorros\n12345678',
    );
  });

  it('descarta cuentas sin número y devuelve null si no queda ninguna', () => {
    expect(buildPaymentAccountsText([{ label: 'Nequi', value: '  ', note: '' }])).toBeNull();
    expect(buildPaymentAccountsText([])).toBeNull();
    expect(buildPaymentAccountsText([{ label: 'X', value: ' ', note: '' }, NEQUI])).toBe(
      'Nequi\n3046706847\na nombre de Tercos',
    );
  });
});
