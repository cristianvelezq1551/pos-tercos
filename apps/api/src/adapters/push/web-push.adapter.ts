import { Injectable, Logger } from '@nestjs/common';
import type {
  PushDeliveryResult,
  PushMessage,
  PushNotifier,
  PushTarget,
} from '@pos-tercos/domain';
import { buildVapidAuthorization, encryptPushPayload, type VapidKeys } from './web-push-crypto';

/** Cuánto guarda el servicio de push un aviso si el equipo está apagado. */
const TTL_SEGUNDOS = 6 * 60 * 60;
/** Un servicio de push que no responde no puede colgar el request que lo disparó. */
const TIMEOUT_MS = 10_000;
/** Lo más largo que puede medir el cuerpo del aviso en la pantalla. */
const MAX_BODY_CHARS = 500;

@Injectable()
export class WebPushAdapter implements PushNotifier {
  readonly name = 'web-push';
  readonly delivers = true;

  private readonly logger = new Logger(WebPushAdapter.name);

  constructor(private readonly keys: VapidKeys) {}

  get publicKey(): string {
    return this.keys.publicKey;
  }

  async send(target: PushTarget, message: PushMessage): Promise<PushDeliveryResult> {
    let body: Buffer;
    try {
      body = encryptPushPayload(JSON.stringify(recortar(message)), target);
    } catch (err) {
      // Cifrar falla por datos (llave inválida, aviso gigante), no por red:
      // reintentarlo no lo arregla, pero tampoco es motivo para borrar la
      // suscripción del dispositivo.
      return { ok: false, gone: false, error: mensaje(err) };
    }

    try {
      const res = await fetch(target.endpoint, {
        method: 'POST',
        headers: {
          Authorization: buildVapidAuthorization(target.endpoint, this.keys),
          'Content-Encoding': 'aes128gcm',
          'Content-Type': 'application/octet-stream',
          TTL: String(TTL_SEGUNDOS),
          // `normal` deja que el sistema agrupe la entrega para ahorrar batería;
          // estos avisos no justifican despertar el equipo al instante.
          Urgency: 'normal',
        },
        body: new Uint8Array(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (res.ok) return { ok: true, gone: false };

      // 404/410 = la suscripción murió (navegador desinstalado, permiso
      // revocado). Es la ÚNICA señal que da el servicio de push para saber
      // que hay que dejar de intentar.
      const gone = res.status === 404 || res.status === 410;
      const detalle = (await res.text().catch(() => '')).slice(0, 200);
      if (!gone) {
        this.logger.warn(`Push a ${host(target.endpoint)} falló ${res.status}: ${detalle}`);
      }
      return { ok: false, gone, error: `HTTP ${res.status} ${detalle}`.trim() };
    } catch (err) {
      // Red caída o timeout: el dispositivo sigue vivo, no se borra nada.
      return { ok: false, gone: false, error: mensaje(err) };
    }
  }
}

/**
 * Un aviso más largo que la pantalla no se lee: el sistema lo corta igual, y
 * cifrarlo entero solo arriesga pasarse del tamaño máximo del registro.
 */
function recortar(message: PushMessage): PushMessage {
  if (message.body.length <= MAX_BODY_CHARS) return message;
  return { ...message, body: `${message.body.slice(0, MAX_BODY_CHARS - 1)}…` };
}

function host(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return 'servicio de push';
  }
}

function mensaje(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
