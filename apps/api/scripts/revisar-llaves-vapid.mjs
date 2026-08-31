/**
 * Revisa las llaves VAPID que tenga cargadas ESTE proceso y dice si sirven.
 * No imprime las llaves ni las manda a ningún lado.
 *
 * Local:    pnpm -F @pos-tercos/api llaves:revisar
 * Railway:  railway run --service api-prod -- pnpm -F @pos-tercos/api llaves:revisar
 */
import { createECDH, createPrivateKey, sign, createPublicKey, verify } from 'node:crypto';

const b64 = (s) => Buffer.from(s, 'base64url');
const problemas = [];
const ok = [];

const publica = process.env.VAPID_PUBLIC_KEY?.trim();
const privada = process.env.VAPID_PRIVATE_KEY?.trim();
const sujeto = process.env.VAPID_SUBJECT?.trim();

const puestas = [publica, privada, sujeto].filter((v) => v && v.length > 0).length;
if (puestas === 0) {
  console.log('\nEste proceso NO tiene llaves VAPID: los avisos estarían mudos.\n');
  process.exit(1);
}
if (puestas < 3) {
  console.log('\nConfiguración a medias: faltan variables. El API no arrancaría.\n');
  process.exit(1);
}

// 1. Forma de la pública
if (b64(publica).length !== 65 || b64(publica)[0] !== 0x04) {
  problemas.push('VAPID_PUBLIC_KEY no es un punto P-256 sin comprimir (65 bytes).');
} else {
  ok.push('La llave pública tiene la forma correcta.');
}

// 2. Forma de la privada
if (b64(privada).length !== 32) {
  problemas.push('VAPID_PRIVATE_KEY no mide 32 bytes.');
} else {
  ok.push('La llave privada tiene la forma correcta.');
}

// 3. Que sean PAREJA — el error más fácil de cometer al generar dos pares
if (problemas.length === 0) {
  const ecdh = createECDH('prime256v1');
  ecdh.setPrivateKey(b64(privada));
  if (!ecdh.getPublicKey().equals(b64(publica))) {
    problemas.push(
      'La pública y la privada NO son pareja: parecen de dos generaciones distintas.\n' +
        '  Vuelve a correr `llaves:vapid` y copia LAS DOS de la misma corrida.',
    );
  } else {
    ok.push('La pública y la privada SÍ son pareja.');
  }
}

// 4. Que la firma que produce sea verificable — es lo que valida el servicio de push
if (problemas.length === 0) {
  const pub = b64(publica);
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: pub.subarray(1, 33).toString('base64url'),
    y: pub.subarray(33, 65).toString('base64url'),
  };
  const mensaje = Buffer.from('prueba de firma');
  const firma = sign('sha256', mensaje, {
    key: createPrivateKey({ key: { ...jwk, d: privada }, format: 'jwk' }),
    dsaEncoding: 'ieee-p1363',
  });
  const valida = verify(
    'sha256',
    mensaje,
    { key: createPublicKey({ key: jwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' },
    firma,
  );
  if (!valida) problemas.push('La firma que produce la privada no se verifica con la pública.');
  else if (firma.length !== 64) problemas.push('La firma no tiene el formato que espera el push.');
  else ok.push('Firma un JWT verificable (es lo que revisa el servicio de push).');
}

// 5. El sujeto
if (!/^(mailto:|https:\/\/)/.test(sujeto)) {
  problemas.push('VAPID_SUBJECT debe empezar con "mailto:" o "https://".');
} else if (/tu-correo@|ejemplo|example/.test(sujeto)) {
  problemas.push('VAPID_SUBJECT quedó con el correo de ejemplo: pon uno tuyo, real.');
} else {
  ok.push(`El contacto es válido (${sujeto.replace(/(.{3}).*(@.*)/, '$1***$2')}).`);
}

console.log('');
for (const linea of ok) console.log(`  OK    ${linea}`);
for (const linea of problemas) console.log(`  FALLA ${linea}`);
console.log('');
if (problemas.length > 0) {
  console.log('Con esto los avisos NO funcionarían. Corrige y vuelve a revisar.\n');
  process.exit(1);
}
console.log('Las llaves sirven. Falta activar los avisos en tu dispositivo desde /avisos.\n');
