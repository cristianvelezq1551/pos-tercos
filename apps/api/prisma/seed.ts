import { PrismaClient, type UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEV_PASSWORD = 'dev12345';

const SEED_USERS: Array<{ email: string; fullName: string; role: UserRole }> = [
  { email: 'dueno@dev.local', fullName: 'Dueño Dev', role: 'DUENO' },
  { email: 'admin@dev.local', fullName: 'Admin Operativo Dev', role: 'ADMIN_OPERATIVO' },
  { email: 'cajero@dev.local', fullName: 'Cajero Dev', role: 'CAJERO' },
  { email: 'cocinero@dev.local', fullName: 'Cocinero Dev', role: 'COCINERO' },
  { email: 'repa@dev.local', fullName: 'Repartidor Dev', role: 'REPARTIDOR' },
  { email: 'trabajador@dev.local', fullName: 'Trabajador Dev', role: 'TRABAJADOR' },
];

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);

  for (const seed of SEED_USERS) {
    await prisma.user.upsert({
      where: { email: seed.email },
      update: {},
      create: {
        email: seed.email,
        fullName: seed.fullName,
        role: seed.role,
        passwordHash,
        mustChangePwd: false,
        active: true,
        availability: seed.role === 'REPARTIDOR' ? 'OFFLINE' : null,
      },
    });
    console.log(`✓ user ${seed.email} (${seed.role})`);
  }

  console.log(`\nAll users use password: ${DEV_PASSWORD}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
