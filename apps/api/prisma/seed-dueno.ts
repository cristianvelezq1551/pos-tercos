import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

/**
 * Deja la base con UN solo usuario Dueño (con PIN), para probar desde cero.
 *   pnpm prisma migrate reset --force --skip-seed
 *   pnpm dlx tsx prisma/seed-dueno.ts
 */
const prisma = new PrismaClient();

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
