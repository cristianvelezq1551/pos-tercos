/**
 * setupFiles de Jest: corre en CADA worker antes de importar las suites.
 * Fuerza DATABASE_URL a la DB de test ANTES de que cualquier PrismaClient
 * se instancie — los e2e jamás tocan la DB de dev.
 */
import * as path from 'node:path';
import { resolveTestDatabaseUrl } from './helpers/test-db-url';

if (!process.env.DATABASE_URL) {
  process.loadEnvFile?.(path.resolve(__dirname, '../.env'));
}
process.env.DATABASE_URL = resolveTestDatabaseUrl();

// El tope anti-abuso de pedidos web es POR IP y toda la suite pega desde
// 127.0.0.1: con el valor real (25/día) los tests comparten un presupuesto y
// los últimos mueren con 429 por vecindad, no por lo que prueban.
// El guard NO queda sin cobertura: se prueba aislado en
// `src/web-orders/web-order-daily-limit.guard.spec.ts` (unit, sin HTTP).
process.env.WEB_ORDER_MAX_PER_IP_PER_DAY ??= '100000';
