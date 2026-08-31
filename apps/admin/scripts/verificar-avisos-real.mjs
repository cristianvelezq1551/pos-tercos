/**
 * Verificación MANUAL de punta a punta de los avisos, contra el servicio de
 * push REAL de Google. Es lo único que prueba la cadena entera: suscripción de
 * un Chrome de verdad, cifrado y firma VAPID de nuestro servidor, aceptación
 * por parte de Google, y la notificación mostrada por el service worker.
 *
 * NO corre en CI ni en `pnpm test`: necesita un Chrome instalado, los dev
 * servers arriba y llaves VAPID cargadas en el API.
 *
 *   1. Genera llaves:  pnpm -F @pos-tercos/api llaves:vapid
 *   2. Levanta el API con esas tres variables y el admin (`pnpm dev`).
 *   3. Guarda la pública en un archivo y corre, desde apps/admin:
 *        node scripts/verificar-avisos-real.mjs /tmp/perfil-chrome /tmp/vapid_pub.txt
 *
 * El primer argumento es una carpeta de perfil de Chrome (se crea sola). Tiene
 * que ser un perfil PERSISTENTE: en modo incógnito Chrome no soporta la API de
 * Push y "deliberadamente no hay forma de detectarlo" (aviso del propio Chrome).
 */
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const PERFIL = process.argv[2];
const PUB = readFileSync(process.argv[3], 'utf8').trim();
const paso = (t, d) => console.log(`  ${t.padEnd(6)} ${d}`);

const ctx = await chromium.launchPersistentContext(PERFIL, {
  channel: 'chrome',
  headless: false,
  args: ['--no-first-run', '--no-default-browser-check'],
});
await ctx.grantPermissions(['notifications'], { origin: 'http://localhost:3004' });
const page = ctx.pages()[0] ?? (await ctx.newPage());

await page.goto('http://localhost:3004/login');
await page.locator('#login-email').fill('dueno@dev.local');
await page.locator('#login-password').fill('dev12345');
await page.getByRole('button', { name: 'Entrar' }).click();
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 });
paso('OK', 'sesión iniciada como dueño');

await page.goto('http://localhost:3004/avisos');

const r = await page.evaluate(async (pub) => {
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return { fallo: `permiso: ${perm}` };

  const reg = await navigator.serviceWorker.register('/sw-avisos.js', { scope: '/sw-avisos/' });
  for (let i = 0; i < 80 && reg.active?.state !== 'activated'; i++) await dormir(125);

  const bytes = (v) => {
    const s = (v + '='.repeat((4 - (v.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(s); const a = new Uint8Array(new ArrayBuffer(raw.length));
    for (let i = 0; i < raw.length; i++) a[i] = raw.charCodeAt(i);
    return a;
  };

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(pub) });
  }
  const j = sub.toJSON();

  // Alta por el endpoint REAL del admin (mismas cookies que usa la pantalla).
  const alta = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ endpoint: sub.endpoint, keys: j.keys, userAgent: navigator.userAgent }),
  });
  if (alta.status !== 204) return { fallo: `alta ${alta.status}: ${(await alta.text()).slice(0, 160)}` };

  // Disparo del aviso desde el servidor.
  const envio = await fetch('/api/push/test', { method: 'POST', credentials: 'include' });
  const resultado = await envio.json();

  // ¿El service worker lo mostró?
  let mostrada = null;
  for (let i = 0; i < 60 && !mostrada; i++) {
    const ns = await reg.getNotifications();
    if (ns.length > 0) mostrada = { title: ns[0].title, body: ns[0].body, tag: ns[0].tag };
    else await dormir(250);
  }
  return { host: new URL(sub.endpoint).host, resultado, mostrada };
}, PUB);

if (r.fallo) { paso('FALLA', r.fallo); await ctx.close(); process.exit(1); }
paso('OK', `suscripción real en ${r.host}`);
paso(r.resultado.sent === 1 ? 'OK' : 'FALLA', `envío desde el API: ${JSON.stringify(r.resultado)}`);
paso(r.mostrada ? 'OK' : 'FALLA', `notificación mostrada: ${JSON.stringify(r.mostrada)}`);
await ctx.close();
process.exit(r.resultado.sent === 1 && r.mostrada ? 0 : 1);
