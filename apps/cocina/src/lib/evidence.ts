import { EvidenceUploadSchema } from '@pos-tercos/types';
import { comprimirImagen } from '@pos-tercos/ui';
import { logError } from './client-log';

/**
 * Achica la foto antes de subirla. La implementación vive en `@pos-tercos/ui`
 * porque el admin la necesita igual para las fotos de factura: una sola copia
 * evita que las dos se separen en calidad o en tamaño máximo.
 */
export function compressImage(file: File): Promise<File> {
  return comprimirImagen(file, (e) => logError('compress-image', e));
}

/**
 * Sube una foto y devuelve su storage key, para pasarla al registro después.
 * Son dos pasos a propósito: el registro es idempotente y no debe re-subir
 * megas de imagen en cada reintento.
 */
export async function uploadEvidence(
  file: File,
  endpoint = '/api/kitchen/evidence',
): Promise<string> {
  const form = new FormData();
  // Sin Content-Type a mano: lo pone el browser con su boundary.
  form.append('photo', await compressImage(file));
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'X-Client-App': 'cocina' },
    credentials: 'include',
    body: form,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? 'No se pudo subir la foto. Intenta de nuevo.');
  }
  return EvidenceUploadSchema.parse(await res.json()).key;
}
