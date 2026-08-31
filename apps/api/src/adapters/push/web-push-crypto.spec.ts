import { createECDH, hkdfSync, createDecipheriv } from 'node:crypto';
import {
  assertValidSubscriptionKeys,
  assertVapidKeyPair,
  b64url,
  buildVapidAuthorization,
  encryptPushPayload,
  fromB64url,
  generateVapidKeys,
  MAX_PAYLOAD_BYTES,
  padEscalar,
} from './web-push-crypto';

/**
 * Vector de prueba del RFC 8291 §5. Es la única verificación EXTERNA que
 * tenemos: un round-trip escrito por la misma persona que escribió el cifrado
 * comparte cualquier malentendido del estándar, y este no.
 */
const RFC = {
  plaintext: 'When I grow up, I want to be a watermelon',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  uaPublic:
    'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  // Copiado del §5 del RFC descargado, NO de memoria: la primera versión de
  // este test afirmaba un cuerpo recordado que ni siquiera descifraba.
  body:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml' +
    'mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT' +
    'pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

const KEYS = { p256dh: RFC.uaPublic, auth: RFC.auth };

/** Lado receptor, escrito desde el RFC — es lo que hace el navegador. */
function descifrar(body: Buffer, uaPrivate: Buffer, authSecret: Buffer): string {
  const salt = body.subarray(0, 16);
  const idlen = body[20];
  const asPublic = body.subarray(21, 21 + idlen);
  const ciphertext = body.subarray(21 + idlen);

  const ecdh = createECDH('prime256v1');
  ecdh.setPrivateKey(uaPrivate);
  const shared = ecdh.computeSecret(asPublic);
  const keyInfo = Buffer.concat([
    Buffer.from('WebPush: info\0', 'utf8'),
    ecdh.getPublicKey(),
    asPublic,
  ]);
  const ikm = Buffer.from(hkdfSync('sha256', shared, authSecret, keyInfo, 32));
  const cek = Buffer.from(
    hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0', 'utf8'), 16),
  );
  const nonce = Buffer.from(
    hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0', 'utf8'), 12),
  );

  const tag = ciphertext.subarray(ciphertext.length - 16);
  const decipher = createDecipheriv('aes-128-gcm', cek, nonce);
  decipher.setAuthTag(tag);
  const padded = Buffer.concat([
    decipher.update(ciphertext.subarray(0, ciphertext.length - 16)),
    decipher.final(),
  ]);
  expect(padded[padded.length - 1]).toBe(0x02);
  return padded.subarray(0, padded.length - 1).toString('utf8');
}

describe('encryptPushPayload', () => {
  it('reproduce byte a byte el vector del RFC 8291', () => {
    const body = encryptPushPayload(RFC.plaintext, KEYS, {
      salt: fromB64url(RFC.salt),
      senderPrivateKey: fromB64url(RFC.asPrivate),
    });
    expect(b64url(body)).toBe(RFC.body);
  });

  it('el navegador puede descifrar lo que mandamos, con llaves nuevas cada vez', () => {
    const body = encryptPushPayload('hola', KEYS);
    expect(descifrar(body, fromB64url(RFC.uaPrivate), fromB64url(RFC.auth))).toBe('hola');
  });

  it('dos envíos del mismo texto dan cuerpos distintos', () => {
    // Sal y llave efímera nuevas por envío: si se repitieran, dos avisos
    // iguales serían distinguibles por un tercero que mire el tráfico.
    const a = encryptPushPayload('hola', KEYS);
    const b = encryptPushPayload('hola', KEYS);
    expect(a.equals(b)).toBe(false);
  });

  it('conserva los acentos y la eñe', () => {
    const texto = 'Descuadre en la caja: faltan $12.500 · revisá el año';
    const body = encryptPushPayload(texto, KEYS);
    expect(descifrar(body, fromB64url(RFC.uaPrivate), fromB64url(RFC.auth))).toBe(texto);
  });

  it('un aviso demasiado largo falla con un mensaje que se entiende', () => {
    expect(() => encryptPushPayload('x'.repeat(MAX_PAYLOAD_BYTES + 1), KEYS)).toThrow(
      /máximo cifrable/,
    );
  });

  it('el límite exacto sí pasa', () => {
    expect(() => encryptPushPayload('x'.repeat(MAX_PAYLOAD_BYTES), KEYS)).not.toThrow();
  });
});

describe('buildVapidAuthorization', () => {
  const keys = { ...generateVapidKeys(), subject: 'mailto:duenio@tercos.co' };

  it('firma un JWT ES256 con la audiencia del servicio de push', () => {
    const header = buildVapidAuthorization(
      'https://fcm.googleapis.com/fcm/send/abc123',
      keys,
      new Date('2026-08-30T12:00:00Z'),
    );
    const [, t] = /vapid t=([^,]+), k=(.+)$/.exec(header) ?? [];
    const [h, p, sig] = t.split('.');
    expect(JSON.parse(fromB64url(h).toString())).toEqual({ typ: 'JWT', alg: 'ES256' });
    const payload = JSON.parse(fromB64url(p).toString());
    // La audiencia es el ORIGEN, no la URL completa: mandar el endpoint entero
    // hace que el servicio rechace el JWT.
    expect(payload.aud).toBe('https://fcm.googleapis.com');
    expect(payload.sub).toBe('mailto:duenio@tercos.co');
    expect(payload.exp).toBe(Math.floor(Date.parse('2026-08-30T12:00:00Z') / 1000) + 43200);
    // Firma cruda r||s (64 bytes), no DER — con DER el push responde 401 mudo.
    expect(fromB64url(sig).length).toBe(64);
  });

  it('publica la misma llave pública que se le entrega al navegador', () => {
    const header = buildVapidAuthorization('https://updates.push.services.mozilla.com/wpush/v2/x', keys);
    expect(header.endsWith(`, k=${keys.publicKey}`)).toBe(true);
  });

  it('rechaza una llave pública que no es un punto P-256', () => {
    expect(() =>
      buildVapidAuthorization('https://x.test/p', { ...keys, publicKey: b64url(Buffer.alloc(10)) }),
    ).toThrow(/punto P-256/);
  });
});

describe('assertValidSubscriptionKeys', () => {
  it('acepta una suscripción legítima', () => {
    expect(() => assertValidSubscriptionKeys(KEYS)).not.toThrow();
  });

  it('rechaza un punto con la forma correcta que no está sobre la curva', () => {
    // Lo pide el RFC 8291 §7: un punto fuera de la curva puede filtrar la
    // llave privada del otro lado.
    const falso = b64url(Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)]));
    expect(() => assertValidSubscriptionKeys({ ...KEYS, p256dh: falso })).toThrow(/curva P-256/);
  });

  it('rechaza una llave del largo equivocado', () => {
    expect(() =>
      assertValidSubscriptionKeys({ ...KEYS, p256dh: b64url(Buffer.alloc(32, 4)) }),
    ).toThrow(/sin comprimir/);
  });

  it('rechaza un secreto de autenticación que no mide 16 bytes', () => {
    expect(() => assertValidSubscriptionKeys({ ...KEYS, auth: b64url(Buffer.alloc(8)) })).toThrow(
      /16 bytes/,
    );
  });
});

describe('escalar privado más corto de 32 bytes', () => {
  /**
   * `getPrivateKey()` de Node devuelve la representación MÍNIMA del escalar:
   * cuando el número arranca con un byte cero, la llave sale con 31 bytes en
   * vez de 32. Pasa en ~4 de cada 1.000 generaciones — o sea que aparecía como
   * un fallo intermitente imposible de reproducir a pedido, y en producción
   * habría sido "generé las llaves y el API no arranca".
   */
  it('las llaves generadas SIEMPRE miden 32 bytes', () => {
    for (let i = 0; i < 400; i++) {
      expect(fromB64url(generateVapidKeys().privateKey)).toHaveLength(32);
    }
  });

  it('una llave de 31 bytes se rellena a la izquierda, no se rechaza', () => {
    const corta = Buffer.alloc(31, 9);
    expect(padEscalar(corta)).toHaveLength(32);
    expect(padEscalar(corta)[0]).toBe(0);
    expect(padEscalar(corta).subarray(1)).toEqual(corta);
  });

  it('un escalar de más de 32 bytes sí se rechaza: eso no es una llave P-256', () => {
    expect(() => padEscalar(Buffer.alloc(33))).toThrow(/más de 32/);
  });

  it('un par válido con la privada corta sigue siendo pareja', () => {
    // Se busca una generación corta de verdad en vez de fabricarla: así el test
    // recorre el mismo camino que el generador real.
    let corta: { publicKey: string; privateKey: string } | null = null;
    for (let i = 0; i < 4000 && !corta; i++) {
      const e = createECDH('prime256v1');
      e.generateKeys();
      if (e.getPrivateKey().length < 32) {
        corta = {
          publicKey: b64url(e.getPublicKey()),
          privateKey: b64url(e.getPrivateKey()), // SIN rellenar, como salía antes
        };
      }
    }
    if (!corta) return; // no salió ninguna corta en esta corrida: nada que probar
    expect(() => assertVapidKeyPair(corta)).not.toThrow();
    expect(() =>
      buildVapidAuthorization('https://fcm.googleapis.com/fcm/send/x', {
        ...corta,
        subject: 'mailto:x@tercos.co',
      }),
    ).not.toThrow();
  });
});
