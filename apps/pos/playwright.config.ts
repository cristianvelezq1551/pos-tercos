import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke E2E de navegador contra los dev servers YA corriendo:
 * API en :3001 y POS en :3002 (no hay webServer a propósito).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  // El flujo es stateful (caja única del negocio) → nada de paralelismo.
  workers: 1,
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3002',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
