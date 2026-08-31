/** Lado mayor al que se reduce la foto antes de subirla. */
const MAX_EDGE_PX = 1600;
const JPEG_QUALITY = 0.8;

/**
 * Achica una foto antes de subirla.
 *
 * Una cámara de teléfono entrega 3–8 MB por disparo. A 1600 px de lado mayor y
 * JPEG 0.8 queda en ~200–400 KB: de sobra para leer una factura o ver qué se
 * tiró, sin castigar la red ni el bucket (una foto por día durante un año son
 * miles de archivos).
 *
 * Hay una razón dura además del peso: en producción el navegador le habla al
 * backend por una reescritura que corre como función de Vercel, y esa función
 * corta el cuerpo alrededor de 4,5 MB. Una factura fotografiada de frente moría
 * con un 413 antes de llegar a la API.
 *
 * Si el navegador no puede decodificar el archivo —HEIC de iPhone en algunos
 * casos— devuelve el ORIGINAL: subir pesado es mejor que no poder registrar.
 */
export async function comprimirImagen(file: File, onError?: (e: unknown) => void): Promise<File> {
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
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch (e) {
    onError?.(e);
    return file;
  }
}
