/**
 * Envoltura del API de notificaciones del navegador. Aislada acá para que el
 * componente no mezcle su estado con las cuatro asincronías del navegador
 * (registrar, permiso, suscribir, leer la suscripción existente).
 */

/** Ruta que NO existe ni va a existir: es solo el ámbito del SW de avisos. */
const AMBITO_SW = '/sw-avisos/';

export type SoporteAvisos =
  | { ok: true }
  | { ok: false; motivo: 'sin-soporte' | 'sin-instalar-ios' | 'sin-https' };

/**
 * Por qué el dispositivo no puede recibir avisos, en términos accionables.
 * En iPhone y iPad Safari solo los entrega si la app está AGREGADA A INICIO —
 * es la limitación que más confunde, así que se detecta y se explica.
 */
export function revisarSoporte(): SoporteAvisos {
  if (typeof window === 'undefined') return { ok: false, motivo: 'sin-soporte' };
  if (!window.isSecureContext) return { ok: false, motivo: 'sin-https' };
  // `Notification` va en la lista a propósito: en iPhone y iPad NO existe
  // mientras la página se abra desde el navegador, y sin este chequeo el
  // `Notification.permission` de más abajo reventaría con un error crudo en vez
  // de explicar que hay que agregar la app a la pantalla de inicio.
  const falta =
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    !('Notification' in window);
  if (falta) {
    const esApple =
      /iPhone|iPad|iPod/.test(navigator.userAgent) ||
      // iPad con "solicitar sitio de escritorio" se hace pasar por Mac; el
      // soporte táctil lo delata (un Mac de verdad reporta 0).
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    return { ok: false, motivo: esApple ? 'sin-instalar-ios' : 'sin-soporte' };
  }
  return { ok: true };
}

async function registrar(): Promise<ServiceWorkerRegistration> {
  const existente = await navigator.serviceWorker.getRegistration(AMBITO_SW);
  if (existente) return existente;
  return navigator.serviceWorker.register('/sw-avisos.js', { scope: AMBITO_SW });
}

/** Suscripción actual de ESTE dispositivo, o null si no tiene. */
export async function suscripcionActual(): Promise<PushSubscription | null> {
  if (!revisarSoporte().ok) return null;
  const reg = await navigator.serviceWorker.getRegistration(AMBITO_SW);
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/**
 * `pushManager.subscribe()` NO siempre falla cuando no puede: si el navegador
 * no alcanza el servicio de push (red mala, un firewall que bloquea FCM, o un
 * Chromium sin esa conexión) la promesa se queda pendiente PARA SIEMPRE. Sin
 * este tope, el interruptor quedaría girando sin decir nunca qué pasó.
 */
const TOPE_SUSCRIPCION_MS = 15_000;

/** Espera a que el worker recién registrado quede activo, con tope. */
async function esperarActivo(reg: ServiceWorkerRegistration): Promise<void> {
  if (reg.active) return;
  const enCurso = reg.installing ?? reg.waiting;
  if (!enCurso) return;
  await Promise.race([
    new Promise<void>((listo) => {
      enCurso.addEventListener('statechange', () => {
        if (enCurso.state === 'activated') listo();
      });
    }),
    // Si tarda demasiado se sigue igual: `subscribe` tiene su propio tope y
    // sabe reportar. Colgarse acá sería el peor desenlace.
    new Promise<void>((listo) => setTimeout(listo, 5_000)),
  ]);
}

export class SinServicioDePush extends Error {
  constructor() {
    super(
      'El navegador no pudo conectarse al servicio de notificaciones. Revisa tu conexión y vuelve a intentar.',
    );
  }
}

/**
 * Traduce el fallo de `subscribe()`. El navegador devuelve textos crudos en
 * inglés ("Registration failed - permission denied", "AbortError") que no le
 * dicen nada a quien los lee y violan la regla de copy: un mensaje tiene que
 * decir QUÉ pasó y QUÉ hacer.
 */
function explicarFalloDeSuscripcion(err: unknown): Error {
  if (err instanceof SinServicioDePush || err instanceof PermisoDenegado) return err;
  const nombre = err instanceof Error ? err.name : '';
  const crudo = err instanceof Error ? err.message : String(err);
  if (nombre === 'NotAllowedError' || /permission denied/i.test(crudo)) {
    return new PermisoDenegado('denied');
  }
  if (nombre === 'AbortError' || nombre === 'NotSupportedError') {
    return new SinServicioDePush();
  }
  return new Error(
    'No se pudieron activar los avisos en este dispositivo. Vuelve a intentar; si sigue igual, prueba desde otro navegador.',
  );
}

export class PermisoDenegado extends Error {
  constructor(motivo: 'denied' | 'default') {
    super(
      motivo === 'denied'
        ? 'El navegador tiene bloqueados los avisos para esta página. Habilítalos desde el candado de la barra de direcciones y vuelve a intentar.'
        : 'No se concedió el permiso. Vuelve a intentar y elige "Permitir" cuando el navegador pregunte.',
    );
  }
}

/**
 * Pide permiso, registra el service worker y devuelve la suscripción.
 *
 * El permiso se pide ANTES de registrar: si la persona dice que no, no queda un
 * service worker instalado que nadie va a usar.
 */
export async function suscribirDispositivo(publicKey: string): Promise<PushSubscription> {
  // Se PREGUNTA siempre y se decide por la respuesta, nunca por el valor
  // previo de `Notification.permission`. Ese atajo parecía razonable ("si ya
  // está denegado, no vuelve a preguntar") y es falso: hay navegadores donde
  // arranca en `denied` y aun así `requestPermission()` concede. Con el atajo,
  // esos casos quedaban bloqueados para siempre sin haber preguntado una vez.
  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') throw new PermisoDenegado(permiso === 'denied' ? 'denied' : 'default');

  const reg = await registrar();
  // Se espera a que ESTE registro esté activo, NO a `navigator.serviceWorker.ready`.
  // Aquel espera un worker que controle la PÁGINA ACTUAL, y el de avisos tiene
  // su propio ámbito (`/sw-avisos/`), así que jamás la controla: usarlo dejaba
  // la promesa pendiente para siempre y el interruptor girando sin explicación.
  await esperarActivo(reg);
  try {
    return await Promise.race([
      reg.pushManager.subscribe({
        // Sin esto el navegador rechaza la suscripción: exige que todo aviso
        // venga firmado por alguien identificable.
        userVisibleOnly: true,
        applicationServerKey: base64UrlABytes(publicKey),
      }),
      new Promise<never>((_, rechazar) =>
        setTimeout(() => rechazar(new SinServicioDePush()), TOPE_SUSCRIPCION_MS),
      ),
    ]);
  } catch (err) {
    throw explicarFalloDeSuscripcion(err);
  }
}

export async function desuscribirDispositivo(): Promise<void> {
  const sub = await suscripcionActual();
  await sub?.unsubscribe();
}

/** Los tres datos del navegador, en la forma que espera el servidor. */
export function datosDeSuscripcion(sub: PushSubscription): {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent: string;
} {
  const json = sub.toJSON();
  const keys = json.keys ?? {};
  if (!keys.p256dh || !keys.auth) {
    throw new Error('El navegador no entregó las llaves de la suscripción.');
  }
  return {
    endpoint: sub.endpoint,
    keys: { p256dh: keys.p256dh, auth: keys.auth },
    userAgent: navigator.userAgent.slice(0, 300),
  };
}

/**
 * `applicationServerKey` pide bytes crudos, no la cadena base64url que guarda
 * el servidor. `atob` no entiende el alfabeto seguro para URL, de ahí el
 * reemplazo y el relleno.
 */
export function base64UrlABytes(valor: string): Uint8Array<ArrayBuffer> {
  const relleno = '='.repeat((4 - (valor.length % 4)) % 4);
  const base64 = (valor + relleno).replace(/-/g, '+').replace(/_/g, '/');
  const crudo = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(crudo.length));
  for (let i = 0; i < crudo.length; i++) bytes[i] = crudo.charCodeAt(i);
  return bytes;
}
