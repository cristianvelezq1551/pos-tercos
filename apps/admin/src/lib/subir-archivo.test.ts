// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';

// `comprimirImagen` necesita canvas: acá se prueba la GUARDA, no la compresión.
const comprimir = vi.fn();
vi.mock('@pos-tercos/ui', () => ({ comprimirImagen: (f: File) => comprimir(f) }));
vi.mock('./client-log', () => ({ logError: vi.fn() }));

const { prepararFoto, verificarTamano, LIMITE_DE_SUBIDA_BYTES } = await import('./subir-archivo');

const archivo = (bytes: number, nombre = 'factura.jpg'): File =>
  new File([new Uint8Array(bytes)], nombre, { type: 'image/jpeg' });

describe('la foto que no cabe por el proxy', () => {
  beforeEach(() => comprimir.mockReset());

  it('deja pasar la foto ya achicada', async () => {
    const chica = archivo(300_000);
    comprimir.mockResolvedValue(chica);
    expect(await prepararFoto(archivo(8_000_000), 'test')).toBe(chica);
  });

  // El HEIC del iPhone: el navegador no lo decodifica, comprimirImagen devuelve
  // el original y la subida moría con "Request Entity Too Large".
  it('explica qué hacer cuando no se pudo achicar', async () => {
    const grande = archivo(LIMITE_DE_SUBIDA_BYTES + 1, 'foto.heic');
    comprimir.mockResolvedValue(grande);
    await expect(prepararFoto(grande, 'test')).rejects.toThrow(/HEIC|pesa/);
  });

  it('el mensaje dice cuánto pesa y cuánto cabe, no un código', async () => {
    const grande = archivo(6 * 1024 * 1024);
    comprimir.mockResolvedValue(grande);
    await expect(prepararFoto(grande, 'test')).rejects.toThrow(/6\.0 MB.*4\.0 MB/s);
  });
});

describe('archivos que no son foto', () => {
  it('un CSV chico pasa', () => {
    expect(() => verificarTamano(archivo(1000, 'banco.csv'))).not.toThrow();
  });

  it('uno grande avisa antes de intentarlo', () => {
    expect(() => verificarTamano(archivo(LIMITE_DE_SUBIDA_BYTES + 1, 'banco.csv'))).toThrow(/máximo/);
  });
});
