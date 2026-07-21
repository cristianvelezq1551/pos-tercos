import { detectImageMime, mimeForExtension } from './image-mime';

/**
 * §4.4: `detectImageMime` lee los MAGIC BYTES, no el header del cliente — un
 * `foto.jpg` que en realidad es PNG debe detectarse como PNG (Anthropic rechaza
 * el media_type equivocado). Sin este test, un cambio en la detección rompía la
 * entrada de facturas por IA en silencio.
 */
describe('detectImageMime (magic bytes)', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const gif = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]);
  const webp = Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

  it('detecta PNG, JPEG, GIF y WebP por sus bytes', () => {
    expect(detectImageMime(png)).toBe('image/png');
    expect(detectImageMime(jpeg)).toBe('image/jpeg');
    expect(detectImageMime(gif)).toBe('image/gif');
    expect(detectImageMime(webp)).toBe('image/webp');
  });

  it('el CONTENIDO gana sobre el nombre: un PNG renombrado .jpg es PNG', () => {
    // El buffer tiene magic bytes de PNG aunque el archivo diga .jpg.
    expect(detectImageMime(png)).toBe('image/png');
  });

  it('un buffer que no es imagen → null', () => {
    expect(detectImageMime(Buffer.from('esto no es una imagen 1234'))).toBeNull();
    expect(detectImageMime(Buffer.from([1, 2, 3]))).toBeNull(); // < 12 bytes
  });

  it('mimeForExtension mapea extensiones conocidas y cae a octet-stream', () => {
    expect(mimeForExtension('jpg')).toBe('image/jpeg');
    expect(mimeForExtension('.PNG')).toBe('image/png');
    expect(mimeForExtension('xyz')).toBe('application/octet-stream');
  });
});
