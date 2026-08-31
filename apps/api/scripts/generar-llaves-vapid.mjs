/**
 * Genera el par de llaves VAPID que firma las notificaciones del navegador.
 * Se corre UNA sola vez por entorno; después las tres variables van a Railway.
 *
 *   pnpm -F @pos-tercos/api llaves:vapid
 */
import { createECDH } from 'node:crypto';

const ecdh = createECDH('prime256v1');
ecdh.generateKeys();

console.log(`
Pegá esto en las variables de entorno del API (Railway o apps/api/.env):

VAPID_PUBLIC_KEY=${ecdh.getPublicKey().toString('base64url')}
VAPID_PRIVATE_KEY=${ecdh.getPrivateKey().toString('base64url')}
VAPID_SUBJECT=mailto:tu-correo@tercos.co

La PRIVADA no sale del servidor. La PÚBLICA se la entrega el API al navegador
por GET /push/public-key — no hace falta copiarla a ningún frontend.

Cambiar estas llaves invalida TODAS las suscripciones existentes: cada
dispositivo tiene que volver a activar los avisos.
`);
