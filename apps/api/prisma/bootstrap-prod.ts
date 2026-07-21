import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

/**
 * Bootstrap de un entorno REAL (QA o producción): deja el usuario Dueño + su PIN
 * + las categorías de producto base, para poder empezar a cargar catálogo y
 * vender. A diferencia de `seed-dueno.ts` (dev, credenciales públicas), este
 * toma las credenciales del Dueño desde variables de entorno y RECHAZA valores
 * débiles/de dev — es seguro correrlo contra la DB de prod.
 *
 * Uso (una sola vez por entorno, idempotente):
 *   BOOTSTRAP_OWNER_EMAIL="dueno@tudominio.co" \
 *   BOOTSTRAP_OWNER_PASSWORD="<clave fuerte 10+ chars>" \
 *   BOOTSTRAP_OWNER_NAME="Nombre Apellido" \
 *   BOOTSTRAP_OWNER_PIN="472913" \                 # opcional, 6 dígitos
 *   BOOTSTRAP_CATEGORIES="Burgers,Bebidas,Papas,Combos" \  # opcional (default abajo)
 *   pnpm dlx tsx prisma/bootstrap-prod.ts
 *
 * En Railway: `railway run --environment production pnpm dlx tsx prisma/bootstrap-prod.ts`
 * (o setear las BOOTSTRAP_* como variables del servicio y correrlo desde un shell).
 */
const prisma = new PrismaClient();

const DEFAULT_CATEGORIES = ['Burgers', 'Papas', 'Bebidas', 'Combos'];
const MIN_PASSWORD_LENGTH = 10;

function fail(msg: string): never {
  console.error(`✗ bootstrap ABORTADO: ${msg}`);
  process.exit(1);
}

function readOwnerCredentials(): { email: string; password: string; name: string; pin?: string } {
  const email = process.env.BOOTSTRAP_OWNER_EMAIL?.trim();
  const password = process.env.BOOTSTRAP_OWNER_PASSWORD;
  const name = process.env.BOOTSTRAP_OWNER_NAME?.trim() || 'Dueño';
  const pin = process.env.BOOTSTRAP_OWNER_PIN?.trim();

  if (!email || !password) {
    fail('faltan BOOTSTRAP_OWNER_EMAIL y/o BOOTSTRAP_OWNER_PASSWORD.');
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    fail(`email inválido: "${email}".`);
  }
  // Nunca dejar el Dueño de dev (credenciales públicas) en un entorno real.
  if (email.endsWith('@dev.local')) {
    fail('el email @dev.local es el Dueño de DEV — usá un email real.');
  }
  if (password.length < MIN_PASSWORD_LENGTH || password === 'dev12345') {
    fail(`la clave debe tener ${MIN_PASSWORD_LENGTH}+ caracteres y no ser la de dev.`);
  }
  if (pin !== undefined && !/^\d{6}$/.test(pin)) {
    fail('BOOTSTRAP_OWNER_PIN debe ser 6 dígitos.');
  }
  return { email, password, name, pin };
}

async function upsertOwner(creds: { email: string; password: string; name: string; pin?: string }): Promise<void> {
  const passwordHash = await bcrypt.hash(creds.password, 10);
  const owner = await prisma.user.upsert({
    where: { email: creds.email },
    // No pisamos la clave si el usuario ya existe (evita resetear al Dueño por
    // re-correr el bootstrap); solo garantizamos rol + activo.
    update: { role: 'DUENO', active: true, fullName: creds.name },
    create: {
      email: creds.email,
      fullName: creds.name,
      role: 'DUENO',
      passwordHash,
      mustChangePwd: false,
      active: true,
    },
  });

  if (creds.pin) {
    const pinHash = await bcrypt.hash(creds.pin, 10);
    await prisma.approvalPin.upsert({
      where: { userId: owner.id },
      create: { userId: owner.id, pinHash },
      update: { pinHash },
    });
  }
  console.log(`✓ Dueño: ${creds.email}${creds.pin ? ' (+ PIN)' : ' (sin PIN — seteálo desde el admin)'}`);
}

async function seedCategories(): Promise<void> {
  const names = (process.env.BOOTSTRAP_CATEGORIES?.split(',').map((s) => s.trim()).filter(Boolean) ??
    DEFAULT_CATEGORIES);
  const result = await prisma.productCategory.createMany({
    data: names.map((name, sortOrder) => ({ name, sortOrder })),
    skipDuplicates: true,
  });
  console.log(`✓ Categorías: ${result.count} nuevas de [${names.join(', ')}]`);
}

async function main(): Promise<void> {
  const creds = readOwnerCredentials();
  await upsertOwner(creds);
  await seedCategories();
  console.log('✓ bootstrap completo. Ya podés loguear como Dueño y cargar catálogo.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
