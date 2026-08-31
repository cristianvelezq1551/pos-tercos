/**
 * Subidas que NO pasan por el proxy de la app.
 *
 * En producción el navegador le habla al backend por una reescritura de Next
 * (`/api/*` → la API), y esa reescritura corre como función de Vercel, que
 * **corta el cuerpo de la petición en unos 4,5 MB**: cualquier canción
 * devolvía `413 FUNCTION_PAYLOAD_TOO_LARGE` aunque el backend acepta hasta
 * 50 MB. Lo mismo le pasaba a una factura fotografiada con el celular.
 *
 * La salida es hablarle DIRECTO al dominio de la API. Como es otro origen, la
 * cookie de sesión no viaja (`sameSite: lax`), así que se usa el mismo token
 * fresco que ya se usa para el WebSocket de pedidos web (§7.v9) —el endpoint
 * existe justo para esto— y se manda como `Authorization: Bearer`.
 *
 * En desarrollo el origen directo es el mismo puerto de la API y no hay proxy
 * que corte, así que el camino es idéntico y no hay una rama sin probar.
 */

/** Origen HTTPS de la API, derivado del que ya se usa para el WebSocket. */
export function origenDirectoDelApi(): string | null {
  const ws = process.env.NEXT_PUBLIC_API_WS_URL;
  if (!ws) return null;
  try {
    const u = new URL(ws);
    u.protocol = u.protocol === 'wss:' ? 'https:' : u.protocol === 'ws:' ? 'http:' : u.protocol;
    return u.origin;
  } catch {
    return null;
  }
}

async function tokenParaOtroOrigen(): Promise<string> {
  const res = await fetch('/api/auth/ws-token', { credentials: 'include' });
  if (!res.ok)
    throw new Error('No se pudo autorizar la subida. Vuelve a entrar y prueba de nuevo.');
  const body = (await res.json()) as { token?: string };
  if (!body.token) throw new Error('No se pudo autorizar la subida.');
  return body.token;
}

export interface SubidaGrande {
  /** Ruta en la API, sin el prefijo `/api` (ej. `display/tracks`). */
  ruta: string;
  form: FormData;
  onProgress?: (pct: number) => void;
}

/**
 * POST con barra de progreso. Va por XHR y no por `fetch` porque `fetch` no
 * expone el avance de la SUBIDA, y con archivos grandes hay que ver que avanza.
 */
export async function subirArchivoGrande<T>(opts: SubidaGrande): Promise<T> {
  const directo = origenDirectoDelApi();
  const url = directo ? `${directo}/${opts.ruta}` : `/api/${opts.ruta}`;
  const token = directo ? await tokenParaOtroOrigen() : null;

  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    else xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // sin cuerpo JSON — cae al mensaje de abajo
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body as T);
        return;
      }
      const msg = (body as { message?: string } | null)?.message;
      // El 413 del proxy no trae cuerpo: sin este texto el usuario ve
      // "Error 413" y no sabe que lo que falla es el tamaño.
      if (xhr.status === 413) {
        reject(new Error('El archivo es demasiado grande. Prueba con uno más liviano.'));
        return;
      }
      reject(new Error(msg ?? `Error ${xhr.status}`));
    };
    xhr.onerror = () =>
      reject(new Error('Se cortó la conexión durante la subida. Prueba de nuevo.'));
    xhr.send(opts.form);
  });
}
