/**
 * Cifrado de Web Push: RFC 8291 (Message Encryption) sobre RFC 8188
 * (`aes128gcm`), más la firma VAPID del RFC 8292.
 *
 * Va a mano y NO por la librería `web-push` a propósito:
 *   - Node ya trae todo lo necesario (`hkdfSync`, ECDH P-256, AES-128-GCM,
 *     ECDSA), así que la dependencia solo aportaría su árbol de subdependencias
 *     en el proceso que tiene las llaves de producción (§7.v18 endureció justo
 *     eso: SHAs clavados, `minimumReleaseAge`, `blockExoticSubdeps`).
 *   - No es criptografía inventada: es un procedimiento fijo con vectores de
 *     prueba oficiales, y el test los usa. Si algo se desvía, falla ahí.
 *
 * Server-only por construcción: vive en el adapter, NO en `@pos-tercos/domain`.
 * El paquete compila a CJS y no se poda, así que un `node:crypto` colgado de su
 * barril entraría al bundle del navegador de las cinco apps (§7.v40).
 */

import {
  createCipheriv,
  createECDH,
  createPrivateKey,
  hkdfSync,
  randomBytes,
  sign as signBuffer,
} from 'node:crypto';

/** Tamaño de registro del RFC 8188. Un aviso entra siempre en uno solo. */
const RECORD_SIZE = 4096;
/** salt(16) + rs(4) + idlen(1) + llave pública del emisor(65). */
const HEADER_BYTES = 86;
/** Delimitador de último registro (1) + tag GCM (16). */
const OVERHEAD_BYTES = 17;
/** Lo más largo que puede medir el JSON del aviso ya cifrado. */
export const MAX_PAYLOAD_BYTES = RECORD_SIZE - HEADER_BYTES - OVERHEAD_BYTES;

export function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

export function fromB64url(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}

/**
 * Valida la suscripción que manda el navegador ANTES de guardarla.
 *
 * El RFC 8291 §7 lo pide explícitamente: un punto que no está sobre la curva
 * P-256 puede usarse para extraer la llave privada del otro lado. Acá el riesgo
 * es acotado (la llave del emisor es efímera, una por mensaje), pero el chequeo
 * es gratis y además atrapa lo más común: basura en el endpoint de alta.
 *
 * La verificación de curva la hace `computeSecret` de Node, que rechaza los
 * puntos que no la satisfacen; se le da un par efímero de descarte.
 */
export function assertValidSubscriptionKeys(keys: PushKeys): void {
  const p256dh = fromB64url(keys.p256dh);
  if (p256dh.length !== 65 || p256dh[0] !== 0x04) {
    throw new Error('La llave del dispositivo no es un punto P-256 sin comprimir.');
  }
  if (fromB64url(keys.auth).length !== 16) {
    throw new Error('El secreto de autenticación del dispositivo no mide 16 bytes.');
  }
  const probe = createECDH('prime256v1');
  probe.generateKeys();
  try {
    probe.computeSecret(p256dh);
  } catch {
    throw new Error('La llave del dispositivo no está sobre la curva P-256.');
  }
}

export interface PushKeys {
  /** `p256dh` de la suscripción: punto P-256 sin comprimir (65 bytes). */
  p256dh: string;
  /** `auth` de la suscripción: 16 bytes de secreto compartido. */
  auth: string;
}

/** Entradas fijables desde el test para reproducir el vector del RFC. */
export interface EncryptOverrides {
  salt?: Buffer;
  senderPrivateKey?: Buffer;
}

/**
 * Devuelve el cuerpo binario que se le POSTea al servicio de push.
 *
 * Formato (RFC 8188 §2.1): salt | rs | idlen | llave pública del emisor | cifrado.
 */
export function encryptPushPayload(
  payload: string,
  keys: PushKeys,
  overrides: EncryptOverrides = {},
): Buffer {
  const plaintext = Buffer.from(payload, 'utf8');
  if (plaintext.length > MAX_PAYLOAD_BYTES) {
    // Reventar acá es mejor que mandar un cuerpo que el servicio de push
    // rechaza con un 413 genérico: el error dice exactamente qué pasó.
    throw new Error(
      `El aviso mide ${plaintext.length} bytes y el máximo cifrable es ${MAX_PAYLOAD_BYTES}.`,
    );
  }

  assertValidSubscriptionKeys(keys);
  const uaPublic = fromB64url(keys.p256dh);
  const authSecret = fromB64url(keys.auth);

  const ecdh = createECDH('prime256v1');
  if (overrides.senderPrivateKey) ecdh.setPrivateKey(overrides.senderPrivateKey);
  else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const sharedSecret = ecdh.computeSecret(uaPublic);

  const salt = overrides.salt ?? randomBytes(16);

  // RFC 8291 §3.3: el material de clave mezcla el secreto ECDH con el `auth`
  // de la suscripción y ATA el resultado a las dos llaves públicas — así un
  // cifrado no se puede reutilizar contra otro destinatario.
  const keyInfo = Buffer.concat([
    Buffer.from('WebPush: info\0', 'utf8'),
    uaPublic,
    asPublic,
  ]);
  const ikm = Buffer.from(hkdfSync('sha256', sharedSecret, authSecret, keyInfo, 32));
  const cek = Buffer.from(
    hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0', 'utf8'), 16),
  );
  const nonce = Buffer.from(
    hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0', 'utf8'), 12),
  );

  // 0x02 = último registro (RFC 8188 §2). Con 0x01 el navegador se queda
  // esperando un registro más y descarta el aviso.
  const padded = Buffer.concat([plaintext, Buffer.from([0x02])]);
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const ciphertext = Buffer.concat([cipher.update(padded), cipher.final(), cipher.getAuthTag()]);

  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(RECORD_SIZE, 0);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, ciphertext]);
}

export interface VapidKeys {
  /** Punto P-256 sin comprimir (65 bytes) en base64url. */
  publicKey: string;
  /** Escalar privado (32 bytes) en base64url. */
  privateKey: string;
  /** Cómo contactar a quien opera el servidor: `mailto:` o `https:`. */
  subject: string;
}

/**
 * Cabecera `Authorization` del RFC 8292. El JWT le prueba al servicio de push
 * que quien envía es el mismo que emitió la llave con la que el navegador se
 * suscribió — sin esto cualquiera que conozca el endpoint podría escribirle al
 * dispositivo.
 */
export function buildVapidAuthorization(
  endpoint: string,
  keys: VapidKeys,
  now: Date = new Date(),
): string {
  const audience = new URL(endpoint).origin;
  const header = { typ: 'JWT', alg: 'ES256' };
  const payload = {
    aud: audience,
    // 12 h: el RFC admite hasta 24 y un reloj adelantado del lado del servicio
    // de push rechazaría un `exp` pegado al límite.
    exp: Math.floor(now.getTime() / 1000) + 12 * 60 * 60,
    sub: keys.subject,
  };
  const unsigned = `${b64url(Buffer.from(JSON.stringify(header)))}.${b64url(
    Buffer.from(JSON.stringify(payload)),
  )}`;

  // `ieee-p1363` = firma cruda r||s, que es lo que espera JOSE. El default de
  // Node es DER, y con DER el servicio de push responde 401 sin explicar nada.
  const signature = signBuffer('sha256', Buffer.from(unsigned, 'utf8'), {
    key: privateKeyObject(keys),
    dsaEncoding: 'ieee-p1363',
  });

  return `vapid t=${unsigned}.${b64url(signature)}, k=${keys.publicKey}`;
}

/**
 * Node no firma con un escalar crudo: hay que armar la JWK, y sus coordenadas
 * salen de la llave pública (byte 0 = 0x04 de "sin comprimir", luego x e y).
 */
function privateKeyObject(keys: VapidKeys) {
  const pub = fromB64url(keys.publicKey);
  if (pub.length !== 65 || pub[0] !== 0x04) {
    throw new Error('VAPID_PUBLIC_KEY no es un punto P-256 sin comprimir (65 bytes).');
  }
  const priv = fromB64url(keys.privateKey);
  if (priv.length !== 32) {
    throw new Error('VAPID_PRIVATE_KEY no mide 32 bytes.');
  }
  return createPrivateKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      x: b64url(pub.subarray(1, 33)),
      y: b64url(pub.subarray(33, 65)),
      d: b64url(priv),
    },
    format: 'jwk',
  });
}

/**
 * Verifica que la llave privada REALMENTE corresponda a la pública.
 *
 * Es el error más fácil de cometer y el más difícil de notar: se generan dos
 * pares (uno para QA y otro para producción) y se mezcla la pública de uno con
 * la privada del otro. Todo arranca bien, el navegador se suscribe bien, y el
 * fallo aparece recién cuando el servicio de push responde 401 sin decir por
 * qué — con los avisos mudos y nadie enterado.
 *
 * La comprobación es directa: de la privada se deriva su pública y se comparan.
 */
export function assertVapidKeyPair(keys: { publicKey: string; privateKey: string }): void {
  const declarada = fromB64url(keys.publicKey);
  if (declarada.length !== 65 || declarada[0] !== 0x04) {
    throw new Error('VAPID_PUBLIC_KEY no es un punto P-256 sin comprimir (65 bytes).');
  }
  const privada = fromB64url(keys.privateKey);
  if (privada.length !== 32) {
    throw new Error('VAPID_PRIVATE_KEY no mide 32 bytes.');
  }
  const ecdh = createECDH('prime256v1');
  try {
    ecdh.setPrivateKey(privada);
  } catch {
    throw new Error('VAPID_PRIVATE_KEY no es una llave P-256 válida.');
  }
  if (!ecdh.getPublicKey().equals(declarada)) {
    throw new Error(
      'VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY no son pareja: parecen de dos generaciones distintas. ' +
        'Vuelve a correr `pnpm -F @pos-tercos/api llaves:vapid` y copia LAS DOS de la misma corrida.',
    );
  }
}

/** Par de llaves VAPID nuevo. Se usa una sola vez, al configurar el servidor. */
export function generateVapidKeys(): { publicKey: string; privateKey: string } {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    publicKey: b64url(ecdh.getPublicKey()),
    privateKey: b64url(ecdh.getPrivateKey()),
  };
}
