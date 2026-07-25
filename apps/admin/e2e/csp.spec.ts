import { expect, test, type ConsoleMessage } from '@playwright/test';
import { API, OPERATIVO_EMAIL, PASSWORD } from './helpers';

/**
 * La CSP del admin solo sirve si es lo bastante estricta para molestar a un
 * atacante y lo bastante amplia para no romper la app. Ese equilibrio no se
 * verifica compilando: hay que abrir las páginas en un navegador real y ver si
 * el motor de CSP bloquea algo.
 *
 * Este test recorre las pantallas que cargan recursos "raros" (fotos de R2,
 * audio, video, el WebSocket de pedidos web) y falla si aparece UNA violación.
 * Si mañana alguien agrega un CDN o una fuente de Google, se entera acá y no
 * en producción con la caja abierta.
 */

/** Chromium reporta las violaciones de CSP como errores de consola. */
const isCspViolation = (m: ConsoleMessage): boolean =>
  m.type() === 'error' && /Content Security Policy/i.test(m.text());

const PAGES = [
  '/caja',
  '/caja/cierre',
  '/caja/historial',
  '/inventory',
  '/inventory/movements',
  '/products',
  '/invoices',
  '/reports/sales',
  '/finanzas/estado',
  '/publicidad',
  '/turnero',
];

test.describe('CSP del admin', () => {
  test('ninguna pantalla dispara una violación de CSP', async ({ page, request }) => {
    const violations: string[] = [];
    page.on('console', (m) => {
      if (isCspViolation(m)) violations.push(`${page.url()} :: ${m.text()}`);
    });

    // Sesión por API + cookie, para no depender del formulario de login.
    const res = await request.post(`${API}/auth/login`, {
      data: { email: OPERATIVO_EMAIL, password: PASSWORD },
      headers: { 'X-Client-App': 'admin' },
    });
    expect(res.ok()).toBeTruthy();

    await page.goto('/login');
    await page.getByLabel(/correo|email/i).fill(OPERATIVO_EMAIL);
    await page.getByLabel(/contraseña|password/i).fill(PASSWORD);
    await page.getByRole('button', { name: /ingresar|entrar|iniciar/i }).click();
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20_000 });

    for (const path of PAGES) {
      // Varias rutas redirigen según el estado de la caja (sin turno abierto,
      // /caja manda al launcher). Ese redirect aborta la navegación en curso y
      // no es lo que estamos midiendo: lo que importa es que la página que
      // termine cargando no dispare violaciones.
      await page.goto(path, { waitUntil: 'domcontentloaded' }).catch(() => null);
      // Deja correr la hidratación: los scripts inline y el socket arrancan ahí.
      await page.waitForTimeout(600);
    }

    expect(violations, `Violaciones de CSP:\n${violations.join('\n')}`).toEqual([]);
  });

  test('la CSP viaja en la respuesta y prohíbe que nos embeban', async ({ request }) => {
    const res = await request.get('/login');
    const csp = res.headers()['content-security-policy'];
    expect(csp, 'el admin debe mandar CSP').toBeTruthy();
    // Las tres que de verdad cierran vectores: nada de <object>, nadie nos
    // mete en un iframe (clickjacking sobre la caja) y <base> no se secuestra.
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(res.headers()['x-content-type-options']).toBe('nosniff');
  });
});
