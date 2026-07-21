import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

/**
 * Deja la base con UN solo usuario Dueño (con PIN), para probar desde cero.
 *   pnpm prisma migrate reset --force --skip-seed
 *   pnpm dlx tsx prisma/seed-dueno.ts
 */
const prisma = new PrismaClient();

// §2.3: mismo guard duro que `seed.ts`. Este seed crea `dueno@dev.local` con
// password `dev12345` y PIN `123456` — correrlo con un DATABASE_URL de prod en
// el shell dejaría un DUEÑO con credenciales públicas. Solo corre local, salvo
// override explícito FORCE_SEED=1 (staging deliberado, NUNCA prod).
function assertNotProduction(): void {
  if (process.env.FORCE_SEED === '1') return;
  const problems: string[] = [];
  if (process.env.NODE_ENV === 'production') problems.push('NODE_ENV=production');
  try {
    const host = new URL(process.env.DATABASE_URL ?? '').hostname;
    if (!['localhost', '127.0.0.1', 'host.docker.internal'].includes(host)) {
      problems.push(`DATABASE_URL apunta a host no-local: ${host}`);
    }
  } catch {
    problems.push('DATABASE_URL ausente o inválida');
  }
  if (problems.length > 0) {
    console.error(
      `✗ Seed ABORTADO (${problems.join(' + ')}).\n` +
        '  Este seed crea dueno@dev.local con dev12345/PIN 123456 — NUNCA en prod.\n' +
        '  Staging deliberado: FORCE_SEED=1 pnpm dlx tsx prisma/seed-dueno.ts',
    );
    process.exit(1);
  }
}
assertNotProduction();

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash('dev12345', 10);
  const dueno = await prisma.user.upsert({
    where: { email: 'dueno@dev.local' },
    update: { active: true },
    create: {
      email: 'dueno@dev.local',
      fullName: 'Dueño Dev',
      role: 'DUENO',
      passwordHash,
      mustChangePwd: false,
      active: true,
    },
  });
  const pinHash = await bcrypt.hash('123456', 10);
  await prisma.approvalPin.upsert({
    where: { userId: dueno.id },
    create: { userId: dueno.id, pinHash },
    update: { pinHash },
  });
  console.log('✓ dueno@dev.local · clave dev12345 · PIN 123456');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
