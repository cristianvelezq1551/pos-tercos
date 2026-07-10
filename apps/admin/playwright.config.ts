import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke E2E de navegador de la CAJA unificada, contra los dev servers YA
 * corriendo: API en :3001 y admin en :3004 (no hay webServer a propósito).
 * La caja es ÚNICA por negocio → sin paralelismo.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  workers: 1,
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3004',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
