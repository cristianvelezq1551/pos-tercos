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
