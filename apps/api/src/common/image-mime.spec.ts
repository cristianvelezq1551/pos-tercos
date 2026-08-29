import { detectImageMime, detectImageMimeLoose, mimeForExtension } from './image-mime';

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

/**
 * El detector permisivo amplía la LISTA de formatos, no el criterio. Antes
 * tenía un "último recurso" que aceptaba el archivo cuando el navegador
 * declaraba `image/*` y la extensión estaba en la tabla: los dos datos los
 * escribe quien sube, así que bastaba llamar `x.png` a un ejecutable para
 * alojarlo en el bucket del negocio. Estos casos fijan que ya no ocurre.
 */
describe('detectImageMimeLoose (solo magic bytes)', () => {
  const bmp = Buffer.from([0x42, 0x4d, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const tiffLE = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0, 0, 0, 0, 0, 0, 0, 0]);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const ftyp = (brand: string) =>
    Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftyp'), Buffer.from(brand)]);

  it('sigue aceptando los formatos que el negocio usa', () => {
    expect(detectImageMimeLoose(png)?.mime).toBe('image/png');
    expect(detectImageMimeLoose(bmp)?.mime).toBe('image/bmp');
    expect(detectImageMimeLoose(tiffLE)?.mime).toBe('image/tiff');
    expect(detectImageMimeLoose(ftyp('heic'))?.mime).toBe('image/heic');
    expect(detectImageMimeLoose(ftyp('avif'))?.mime).toBe('image/avif');
  });

  it('un ejecutable llamado "factura.png" ya NO se acepta', () => {
    // MZ = cabecera de un .exe de Windows.
    const exe = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(detectImageMimeLoose(exe)).toBeNull();
  });

  it('un SVG (que puede traer JS) se rechaza, con relleno adelante o sin él', () => {
    expect(detectImageMimeLoose(Buffer.from('<svg onload="alert(1)"></svg>'))).toBeNull();
    // El guardia viejo solo miraba los primeros 256 bytes: se esquivaba
    // rellenando. Ahora no hay nada que esquivar — sin magic bytes, no pasa.
    const conRelleno = Buffer.concat([
      Buffer.from(' '.repeat(300)),
      Buffer.from('<svg onload="alert(1)"></svg>'),
    ]);
    expect(detectImageMimeLoose(conRelleno)).toBeNull();
  });

  it('un buffer vacío o demasiado corto no revienta', () => {
    expect(detectImageMimeLoose(Buffer.alloc(0))).toBeNull();
    expect(detectImageMimeLoose(Buffer.from([0x89]))).toBeNull();
  });
});
