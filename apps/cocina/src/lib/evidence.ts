import { EvidenceUploadSchema } from '@pos-tercos/types';
import { logError } from './client-log';

/** Lado mayor al que se reduce la foto antes de subirla. */
const MAX_EDGE_PX = 1600;
const JPEG_QUALITY = 0.8;

/**
 * Achica la foto antes de subirla.
 *
 * Una cámara de teléfono entrega 3–8 MB por disparo; a 1600 px de lado mayor y
 * JPEG 0.8 queda en ~200–400 KB, de sobra para ver qué se tiró y sin castigar
 * la red de la cocina ni el bucket (una merma por día durante un año son miles
 * de fotos).
 *
 * Si el navegador no puede decodificar el archivo —HEIC de iPhone en algunos
 * casos— devuelve el original: subir pesado es mejor que no poder registrar.
 */
export async function compressImage(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY);
    });
    // Una foto ya chica puede salir MÁS pesada re-codificada: ahí no toca nada.
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], 'evidencia.jpg', { type: 'image/jpeg' });
  } catch (e) {
    logError('compress-image', e);
    return file;
  }
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
