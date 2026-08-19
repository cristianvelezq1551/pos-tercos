/**
 * Inicia sesión UNA vez por rol y guarda la sesión en disco.
 *
 * Sin esto cada test hacía su propio login y el suite se auto-bloqueaba: el
 * backend limita el login a 10 por minuto (anti-fuerza-bruta, y está bien que
 * lo haga), así que a partir del test 11 fallaba todo por 429 aunque la app
 * estuviera perfecta.
 */
import { test as setup, expect } from '@playwright/test';

const CAJA = 'http://localhost:3104';
const COCINA = 'http://localhost:3106';
const PW = 'dev12345';

async function guardarSesion(
  page: import('@playwright/test').Page,
  base: string,
  email: string,
  archivo: string,
): Promise<void> {
  await page.goto(`${base}/login`);
  await page.getByLabel(/correo|email/i).fill(email);
  await page.getByLabel(/contraseña|password/i).fill(PW);
  await page.getByRole('button', { name: /ingresar|entrar|iniciar/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 25_000 });
  await page.context().storageState({ path: archivo });
}

setup('sesión del dueño', async ({ page }) => {
  await guardarSesion(page, CAJA, 'dueno@dev.local', 'e2e-qa/.auth/dueno.json');
  expect(page.url()).not.toContain('/login');
});

setup('sesión del operativo (caja)', async ({ page }) => {
  await guardarSesion(page, CAJA, 'admin@dev.local', 'e2e-qa/.auth/operativo.json');
  expect(page.url()).not.toContain('/login');
});

setup('sesión del cocinero', async ({ page }) => {
  await guardarSesion(page, COCINA, 'cocinero@dev.local', 'e2e-qa/.auth/cocinero.json');
  expect(page.url()).not.toContain('/login');
});
