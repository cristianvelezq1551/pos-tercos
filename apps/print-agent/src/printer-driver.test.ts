import { describe, expect, it } from 'vitest';
import { parseHexOrDec, readConfig, selectPrintTarget, type DriverConfig } from './printer-driver';

/**
 * Ruteo de impresión. Mutantes que estos tests matan:
 * - invertir la prioridad → la comanda de cocina sale por la impresora del
 *   cajero (el POS rutea por nombre; el `.env` es el respaldo).
 * - caer al dump de disco en Windows cuando no hay impresora configurada → el
 *   cajero ve "impreso OK" y no salió ningún ticket.
 * - IDs USB en hexadecimal parseados como decimal → no encuentra la impresora.
 */

const cfg = (over: Partial<DriverConfig> = {}): DriverConfig => ({
  printerName: null,
  vendorId: null,
  productId: null,
  device: null,
  fallbackDir: '/tmp/print-out',
  ...over,
});

describe('selectPrintTarget — prioridad de ruteo', () => {
  it('la impresora que manda el POS gana sobre la del .env', () => {
    const t = selectPrintTarget(cfg({ printerName: 'Cajero' }), 'win32', 'Cocina');
    expect(t).toEqual({ mode: 'windows-raw', printerName: 'Cocina' });
  });

  it('sin impresora explícita usa la del .env', () => {
    const t = selectPrintTarget(cfg({ printerName: 'Cajero' }), 'win32');
    expect(t).toEqual({ mode: 'windows-raw', printerName: 'Cajero' });
  });

  it('una impresora explícita nula cae al .env (no rompe el ruteo)', () => {
    const t = selectPrintTarget(cfg({ printerName: 'Cajero' }), 'win32', null);
    expect(t).toEqual({ mode: 'windows-raw', printerName: 'Cajero' });
  });

  it('fuera de Windows la impresora por nombre NO aplica (no hay spooler)', () => {
    const t = selectPrintTarget(cfg({ device: '/dev/usb/lp0' }), 'linux', 'Cocina');
    expect(t).toEqual({ mode: 'device', device: '/dev/usb/lp0' });
  });
});

describe('selectPrintTarget — modos por plataforma', () => {
  it('USB directo cuando hay vendor + product id', () => {
    const t = selectPrintTarget(cfg({ vendorId: 0x04b8, productId: 0x0e15 }), 'darwin');
    expect(t).toEqual({ mode: 'usb', vendorId: 0x04b8, productId: 0x0e15 });
  });

  it('USB con un solo id no alcanza: cae al siguiente modo', () => {
    const soloVendor = selectPrintTarget(
      cfg({ vendorId: 0x04b8, device: '/dev/usb/lp0' }),
      'linux',
    );
    expect(soloVendor).toEqual({ mode: 'device', device: '/dev/usb/lp0' });
  });

  it('USB gana sobre el device file', () => {
    const t = selectPrintTarget(
      cfg({ vendorId: 1, productId: 2, device: '/dev/usb/lp0' }),
      'linux',
    );
    expect(t.mode).toBe('usb');
  });

  it('sin nada configurado en dev vuelca a disco', () => {
    expect(selectPrintTarget(cfg(), 'darwin')).toEqual({
      mode: 'dump',
      dir: '/tmp/print-out',
    });
  });
});

describe('selectPrintTarget — Windows sin impresora', () => {
  it('FALLA con mensaje accionable en vez de volcar a disco en silencio', () => {
    const t = selectPrintTarget(cfg(), 'win32');
    expect(t.mode).toBe('error');
    expect(t).toMatchObject({ message: expect.stringContaining('PRINTER_NAME') });
  });

  it('el mensaje avisa de la trampa del .env.txt de Notepad', () => {
    const t = selectPrintTarget(cfg(), 'win32');
    expect(t.mode === 'error' && t.message).toContain('.env.txt');
  });

  it('en Windows, con USB configurado, igual imprime por USB antes de fallar', () => {
    const t = selectPrintTarget(cfg({ vendorId: 1, productId: 2 }), 'win32');
    expect(t.mode).toBe('usb');
  });
});

describe('parseHexOrDec — IDs USB', () => {
  it('interpreta el prefijo 0x como hexadecimal', () => {
    expect(parseHexOrDec('0x04b8')).toBe(1208);
    expect(parseHexOrDec('0X04B8')).toBe(1208);
  });

  it('interpreta sin prefijo como decimal (1208 ≠ 0x1208)', () => {
    expect(parseHexOrDec('1208')).toBe(1208);
  });

  it('tolera espacios alrededor (copiar/pegar del .env)', () => {
    expect(parseHexOrDec('  0x04b8  ')).toBe(1208);
  });
});

describe('readConfig — lectura del entorno', () => {
  it('deja todo en null cuando no hay nada configurado', () => {
    const c = readConfig({} as NodeJS.ProcessEnv);
    expect(c).toMatchObject({
      printerName: null,
      vendorId: null,
      productId: null,
      device: null,
    });
  });

  it('convierte los IDs USB del .env a número', () => {
    const c = readConfig({
      PRINTER_USB_VENDOR_ID: '0x04b8',
      PRINTER_USB_PRODUCT_ID: '3605',
    } as NodeJS.ProcessEnv);
    expect(c.vendorId).toBe(1208);
    expect(c.productId).toBe(3605);
  });

  it('el ruteo resultante de un .env típico de Windows va al spooler', () => {
    const c = readConfig({ PRINTER_NAME: 'EPSON TM-T20III' } as NodeJS.ProcessEnv);
    expect(selectPrintTarget(c, 'win32')).toEqual({
      mode: 'windows-raw',
      printerName: 'EPSON TM-T20III',
    });
  });
});
