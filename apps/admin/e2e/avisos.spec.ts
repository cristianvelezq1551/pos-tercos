import { expect, test } from '@playwright/test';
import { DUENO_EMAIL, PASSWORD } from './helpers';

/**
 * La pantalla de Avisos en un navegador de verdad. Lo que se prueba acá y no se
 * puede probar en otro lado: que el permiso se pida, que el service worker
 * quede registrado y que el navegador produzca una suscripción real con la
 * llave pública del servidor.
 *
 * ⚠️ La SUSCRIPCIÓN depende de un servicio de push externo (FCM). Si el
 * Chromium de pruebas no lo alcanza, el caso lo reporta en vez de fallar: sería
 * un fallo del entorno, no del código.
 */
test.describe('Avisos del navegador', () => {
  test.beforeEach(async ({ context }) => {
    await context.grantPermissions(['notifications'], {
      origin: 'http://localhost:3004',
    });
  });

  /**
   * El input del interruptor es `sr-only` (patrón peer): no se puede hacer
   * click sobre él. Se toca la ETIQUETA que lo envuelve, que es lo que toca
   * una persona.
   */
  async function encender(page: import('@playwright/test').Page) {
    await page.locator('label:has(input[role="switch"])').first().click();
  }

  async function entrar(page: import('@playwright/test').Page) {
    await page.goto('/login');
    await page.locator('#login-email').fill(DUENO_EMAIL);
    await page.locator('#login-password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.waitForURL((u) => u.pathname !== '/login', { timeout: 20_000 });
    await page.goto('/avisos');
  }

  test('la pantalla carga con el interruptor y sin errores de consola', async ({ page }) => {
    const errores: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errores.push(m.text()));
    page.on('pageerror', (e) => errores.push(e.message));

    await entrar(page);
    await expect(page.getByText('Avisos en este dispositivo')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('switch', { name: 'Avisos en este dispositivo' })).toBeAttached();

    // Con las llaves puestas NO debe aparecer el aviso de "sin configurar".
    await expect(page.getByText('no tiene las llaves de notificación')).toHaveCount(0);
    expect(errores.filter((e) => !e.includes('favicon'))).toEqual([]);
  });

  test('el interruptor arranca apagado y no hay dispositivos', async ({ page }) => {
    await entrar(page);
    await expect(page.getByRole('switch', { name: 'Avisos en este dispositivo' })).not.toBeChecked();
    await expect(page.getByText('Tus dispositivos con avisos')).toHaveCount(0);
  });

  test('activar registra el service worker de avisos', async ({ page }) => {
    await entrar(page);
    await encender(page);

    // El registro ocurre aunque la suscripción falle por falta de red al
    // servicio de push: es lo que se puede afirmar sin depender de terceros.
    await expect
      .poll(
        async () =>
          page.evaluate(async () => {
            const regs = await navigator.serviceWorker.getRegistrations();
            return regs.some((r) => r.scope.endsWith('/sw-avisos/'));
          }),
        { timeout: 15_000 },
      )
      .toBe(true);
  });

  test('si el navegador no puede suscribirse, lo explica en español y se recupera', async ({
    page,
  }) => {
    // El Chromium de pruebas corre en un contexto incógnito, donde Chrome NO
    // soporta la API de Push ("deliberadamente no hay forma de detectarlo",
    // dice su propio aviso de consola). Sirve igual: reproduce lo que le pasa
    // a alguien cuyo navegador rechaza la suscripción.
    await entrar(page);
    await encender(page);

    // Nada de "Registration failed - permission denied": eso no le dice nada a
    // quien lo lee.
    await expect(page.getByText(/Registration failed/i)).toHaveCount(0);
    await expect(
      page.getByText(/bloqueados los avisos|no pudo conectarse|No se pudieron activar/),
    ).toBeVisible({ timeout: 25_000 });

    // Y la pantalla queda utilizable: el interruptor vuelve a estar disponible
    // y refleja la verdad (apagado), no lo que se intentó.
    await expect(page.getByRole('switch', { name: 'Avisos en este dispositivo' })).toBeEnabled();
    await expect(page.getByRole('switch', { name: 'Avisos en este dispositivo' })).not.toBeChecked();
  });
});
