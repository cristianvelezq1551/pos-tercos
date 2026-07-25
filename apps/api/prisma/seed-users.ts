import { PrismaClient, type UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { assertNotProduction } from './assert-not-production';

/**
 * Seed SOLO de usuarios de acceso (sin menú de prueba). Útil para dejar la base
 * limpia de datos de negocio pero usable (poder iniciar sesión y construir el
 * catálogo desde cero, p. ej. para un QA guiado).
 *
 *   pnpm prisma migrate reset --force --skip-seed
 *   pnpm dlx tsx prisma/seed-users.ts
 */
assertNotProduction('seed-users', 'un DUEÑO y un ADMIN con la clave pública dev12345');

const prisma = new PrismaClient();
const DEV_PASSWORD = 'dev12345';

const SEED_USERS: Array<{ email: string; fullName: string; role: UserRole }> = [
  { email: 'dueno@dev.local', fullName: 'Dueño Dev', role: 'DUENO' },
  { email: 'admin@dev.local', fullName: 'Admin Operativo Dev', role: 'ADMIN_OPERATIVO' },
  { email: 'cajero@dev.local', fullName: 'Cajero Dev', role: 'CAJERO' },
  { email: 'cocinero@dev.local', fullName: 'Cocinero Dev', role: 'COCINERO' },
];

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);
  for (const u of SEED_USERS) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { ...u, passwordHash, mustChangePwd: false, active: true },
    });
    console.log(`✓ ${u.email} (${u.role})`);
  }
  console.log(`\nContraseña de todos: ${DEV_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
