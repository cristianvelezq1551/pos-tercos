/**
 * globalSetup de Jest (proceso aparte, corre UNA vez antes de las suites):
 * crea la DB de test si no existe y le aplica las migraciones. Las suites
 * después fuerzan DATABASE_URL a esta DB vía setup-env.ts (setupFiles).
 */
import { execSync } from 'node:child_process';
import * as path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { resolveTestDatabaseUrl } from './helpers/test-db-url';

export default async function globalSetup(): Promise<void> {
  // Cargar .env del API si DATABASE_URL no vino del entorno (jest no lo carga).
  if (!process.env.DATABASE_URL) {
    process.loadEnvFile?.(path.resolve(__dirname, '../.env'));
  }
  const testUrl = resolveTestDatabaseUrl();
  const dbName = new URL(testUrl).pathname.slice(1);

  // Crear la DB si falta, conectados a la DB administrativa `postgres`.
  const adminUrl = new URL(testUrl);
  adminUrl.pathname = '/postgres';
  const admin = new PrismaClient({ datasources: { db: { url: adminUrl.toString() } } });
  try {
    const exists = await admin.$queryRawUnsafe<Array<{ exists: boolean }>>(
      `SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = '${dbName.replace(/'/g, "''")}') AS exists`,
    );
    if (!exists[0]?.exists) {
      await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
      console.log(`[e2e] DB de test creada: ${dbName}`);
    }
  } finally {
    await admin.$disconnect();
  }

  // Migraciones al día en la DB de test.
  execSync('pnpm prisma migrate deploy', {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: 'pipe',
  });
  console.log(`[e2e] migraciones aplicadas en ${dbName}`);
}
