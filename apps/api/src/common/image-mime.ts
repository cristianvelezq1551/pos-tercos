/**
 * Detecta el MIME type real de una imagen desde sus magic bytes.
 * Esto es más confiable que confiar en `file.mimetype` de Multer
 * (que viene del header Content-Type del browser/curl), porque a
 * veces el archivo está renombrado (foto.jpg con contenido PNG)
 * y los providers IA validan estrictamente.
 *
 * Devuelve null si no es una imagen reconocida.
 */
export function detectImageMime(buffer: Buffer): SupportedImageMime | null {
  if (buffer.length < 12) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'image/png';
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // GIF: 47 49 46 38 ('GIF8')
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
    return 'image/gif';
  }

  // WebP: 'RIFF' .. .. .. .. 'WEBP'
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp';
  }

  return null;
}

export type SupportedImageMime = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';

export type SupportedVideoMime = 'video/mp4' | 'video/webm';

/** Marcas (brand, bytes 8-11) de `ftyp` que son video MP4 (no HEIC/AVIF). */
const MP4_VIDEO_BRANDS = new Set([
  'isom',
  'iso2',
  'iso4',
  'iso5',
  'iso6',
  'mp41',
  'mp42',
  'mp4v',
  'avc1',
  'dash',
  'M4V ',
  'M4VH',
  'M4VP',
  'qt  ',
]);

/**
 * Detecta el MIME real de un video desde sus magic bytes (no se confía en el
 * header del cliente). Soporta MP4 (caja `ftyp` con brand de video) y WebM
 * (header EBML). Devuelve null si no es un video reconocido.
 */
export function detectVideoMime(buffer: Buffer): SupportedVideoMime | null {
  if (buffer.length < 12) return null;

  // WebM/Matroska: EBML header 1A 45 DF A3
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return 'video/webm';
  }

  // MP4: '....ftyp' + brand de video (los brands de imagen heic/avif se excluyen).
  if (buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) {
    const brand = buffer.slice(8, 12).toString('ascii');
    if (MP4_VIDEO_BRANDS.has(brand) || brand.startsWith('mp4')) {
      return 'video/mp4';
    }
  }

  return null;
}

export function extensionForMime(mime: SupportedImageMime): string {
  switch (mime) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
      return 'jpg';
    case 'image/gif':
      return 'gif';
    case 'image/webp':
      return 'webp';
  }
}

const EXTENSION_MIME_MAP: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  heic: 'image/heic',
  heif: 'image/heif',
  avif: 'image/avif',
};

export function mimeForExtension(ext: string): string {
  const clean = ext.toLowerCase().replace(/^\./, '');
  return EXTENSION_MIME_MAP[clean] ?? 'application/octet-stream';
}

/**
 * Detector permisivo para uploads de productos y comprobantes. A diferencia de
 * detectImageMime (estricto, lo usa invoices porque el LLM rechaza media types
 * incorrectos), acepta más formatos raster: agrega BMP, TIFF, HEIC/HEIF y AVIF.
 *
 * "Permisivo" es por la LISTA de formatos, no por el criterio: el tipo se
 * decide SIEMPRE por los magic bytes del archivo. Lo que declara el navegador
 * y cómo se llama el archivo no participan — los escribe quien sube.
 */
export function detectImageMimeLoose(buffer: Buffer): { mime: string; ext: string } | null {
  const strict = detectImageMime(buffer);
  if (strict) {
    return { mime: strict, ext: extensionForMime(strict) };
  }

  if (buffer.length >= 2 && buffer[0] === 0x42 && buffer[1] === 0x4d) {
    return { mime: 'image/bmp', ext: 'bmp' };
  }

  if (
    buffer.length >= 4 &&
    ((buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a && buffer[3] === 0x00) ||
      (buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00 && buffer[3] === 0x2a))
  ) {
    return { mime: 'image/tiff', ext: 'tiff' };
  }

  if (
    buffer.length >= 12 &&
    buffer[4] === 0x66 &&
    buffer[5] === 0x74 &&
    buffer[6] === 0x79 &&
    buffer[7] === 0x70
  ) {
    const brand = buffer.slice(8, 12).toString('ascii');
    if (['heic', 'heix', 'mif1', 'msf1', 'heim', 'heis'].includes(brand)) {
      return { mime: 'image/heic', ext: 'heic' };
    }
    if (brand === 'avif') {
      return { mime: 'image/avif', ext: 'avif' };
    }
  }

  // Ningún formato soportado reconoce estos bytes. Antes había acá un "último
  // recurso" que aceptaba el archivo si el navegador DECLARABA image/* y la
  // extensión estaba en la tabla — pero las dos cosas las escribe quien sube,
  // así que bastaba llamar `x.png` a cualquier cosa para alojarla en el bucket.
  // Los formatos exóticos que justificaban esa rama (BMP, TIFF, HEIC, AVIF) ya
  // se detectan arriba por sus bytes, así que no cubría ningún caso legítimo.
  return null;
}
