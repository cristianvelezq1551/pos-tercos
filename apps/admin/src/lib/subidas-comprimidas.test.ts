import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Ninguna foto sale del navegador sin achicar.
 *
 * El proxy de la app corta el cuerpo cerca de 4,5 MB, así que una foto de
 * cámara (3–14 MB) muere con un 413 antes de llegar al servidor. Ya pasó: la
 * foto de la factura se achicaba pero el comprobante de pago no, y subir una
 * factura pagada fallaba con "Request Entity Too Large".
 *
 * Esto no revisa que la compresión funcione (eso es `subir-archivo.test.ts`):
 * revisa que nadie agregue una subida NUEVA que se salte el helper, que es la
 * forma en que el bug volvería.
 */

const RAIZ = join(import.meta.dirname, '..');

/** Campos multipart que llevan un archivo. `payload` es JSON, no cuenta. */
const CAMPOS_DE_ARCHIVO = /\.append\(\s*'(proof|image|photo|file)'\s*,\s*([^)]*)\)/g;

function fuentes(dir: string): string[] {
  return readdirSync(dir).flatMap((entrada) => {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) return fuentes(ruta);
    return /\.tsx?$/.test(entrada) && !/\.test\.tsx?$/.test(entrada) ? [ruta] : [];
  });
}

describe('toda subida de archivo pasa por el helper', () => {
  it('no hay ningún append que suba el archivo crudo', () => {
    const culpables: string[] = [];
    for (const ruta of fuentes(RAIZ)) {
      const codigo = readFileSync(ruta, 'utf8');
      for (const [linea, campo, valor] of codigo.matchAll(CAMPOS_DE_ARCHIVO)) {
        // `prepararFoto` achica; `verificarTamano` cubre lo que no es foto
        // (un CSV) y avisa antes de intentar la subida.
        const cubierto =
          valor.includes('prepararFoto') ||
          new RegExp(`verificarTamano\\([^)]*\\)[\\s\\S]{0,200}${campo}`).test(codigo);
        if (!cubierto) culpables.push(`${ruta.replace(RAIZ, 'src')} → ${linea.trim()}`);
      }
    }
    expect(culpables).toEqual([]);
  });
});
