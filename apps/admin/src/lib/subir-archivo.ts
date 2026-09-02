import { comprimirImagen } from '@pos-tercos/ui';
import { logError } from './client-log';

/**
 * Tope del cuerpo que acepta el proxy de la app en producción. El navegador no
 * le habla al backend directo: pasa por una reescritura que corre como función
 * de Vercel, y esa función corta cerca de 4,5 MB. Se deja margen para el
 * envoltorio multipart (nombre del archivo, cabeceras, límites).
 */
export const LIMITE_DE_SUBIDA_BYTES = 4 * 1024 * 1024;

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Deja una foto lista para subir: la achica y, si aun así no cabe, explica qué
 * pasó en vez de dejar que el proxy responda un 413 crudo.
 *
 * El caso que no se puede achicar es el HEIC del iPhone: algunos navegadores no
 * lo saben decodificar, `comprimirImagen` devuelve el original de 8 MB y la
 * subida moría con "Request Entity Too Large" — un mensaje que no le dice a
 * nadie qué hacer.
 */
export async function prepararFoto(file: File, scope: string): Promise<File> {
  const listo = await comprimirImagen(file, (e) => logError(scope, e));
  if (listo.size <= LIMITE_DE_SUBIDA_BYTES) return listo;
  throw new Error(
    `La imagen pesa ${mb(listo.size)} y el máximo es ${mb(LIMITE_DE_SUBIDA_BYTES)}. ` +
      'Si la tomaste con un iPhone, es formato HEIC y el navegador no puede achicarla: ' +
      'compártela por WhatsApp y sube esa copia, o cambia el formato de la cámara a ' +
      '"Más compatible" en Ajustes › Cámara › Formatos.',
  );
}

/**
 * Para archivos que NO son foto (un PDF, un CSV): no se pueden achicar, así que
 * solo se avisa antes de intentarlo.
 */
export function verificarTamano(file: File): void {
  if (file.size > LIMITE_DE_SUBIDA_BYTES) {
    throw new Error(
      `El archivo pesa ${mb(file.size)} y el máximo es ${mb(LIMITE_DE_SUBIDA_BYTES)}.`,
    );
  }
}
