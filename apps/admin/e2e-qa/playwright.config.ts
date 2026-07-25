import { defineConfig, devices } from '@playwright/test';

/**
 * Config del recorrido de QA por pantalla. Apunta al entorno DEDICADO
 * (API :3011 · Caja :3104 · Web :3100 · Cocina :3106), no al de desarrollo.
 *
 * Sin paralelismo: la caja es única por negocio.
 * El proyecto `setup` inicia sesión una vez por rol y guarda la sesión, para
 * no chocar con el tope de 10 logins por minuto del backend.
 */
export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  retries: 0,
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /checklist-ui\.spec\.ts/,
      dependencies: ['setup'],
    },
  ],
});
