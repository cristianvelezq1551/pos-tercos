import { createHash } from 'crypto';
import { PrismaClient, type UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// El seed crea usuarios con password de dev conocida (`dev12345`) y catálogo de
// prueba — correrlo contra prod sería una brecha de seguridad inmediata. Guard
// duro: solo corre contra hosts locales, salvo override explícito FORCE_SEED=1
// (para un entorno de staging deliberado, nunca prod).
function assertNotProduction(): void {
  if (process.env.FORCE_SEED === '1') return;
  const problems: string[] = [];
  if (process.env.NODE_ENV === 'production') {
    problems.push('NODE_ENV=production');
  }
  const dbUrl = process.env.DATABASE_URL ?? '';
  try {
    const host = new URL(dbUrl).hostname;
    if (!['localhost', '127.0.0.1', 'host.docker.internal'].includes(host)) {
      problems.push(`DATABASE_URL apunta a host no-local: ${host}`);
    }
  } catch {
    problems.push('DATABASE_URL ausente o inválida');
  }
  if (problems.length > 0) {
    console.error(
      `✗ Seed ABORTADO (${problems.join(' + ')}).\n` +
        '  Este seed crea usuarios dev12345 — NUNCA correrlo en prod.\n' +
        '  Si esto es un entorno de staging deliberado: FORCE_SEED=1 pnpm prisma db seed',
    );
    process.exit(1);
  }
}
assertNotProduction();

const DEV_PASSWORD = 'dev12345';

/**
 * UUID determinista derivado de un slug. Los schemas Zod exigen `id` UUID, así
 * que no podemos usar slugs crudos como id; pero queremos que el seed sea
 * idempotente y que los combos referencien a sus componentes. Mismo slug →
 * mismo UUID (v5-like, formato 8-4-4-4-12).
 */
function slugUuid(slug: string): string {
  const h = createHash('sha1').update(`pos-tercos:${slug}`).digest('hex');
  const variant = ((parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80)
    .toString(16)
    .padStart(2, '0');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(18, 20)}-${h.slice(20, 32)}`;
}

const SEED_USERS: Array<{ email: string; fullName: string; role: UserRole }> = [
  { email: 'dueno@dev.local', fullName: 'Dueño Dev', role: 'DUENO' },
  { email: 'admin@dev.local', fullName: 'Admin Operativo Dev', role: 'ADMIN_OPERATIVO' },
  // Operador de caja de dev: ADMIN_OPERATIVO (el rol CAJERO se retiró de la
  // operación en el cutover POS→admin — no entra a ninguna app).
  { email: 'cajero@dev.local', fullName: 'Cajero Dev', role: 'ADMIN_OPERATIVO' },
  { email: 'cocinero@dev.local', fullName: 'Cocinero Dev', role: 'COCINERO' },
  { email: 'trabajador@dev.local', fullName: 'Trabajador Dev', role: 'TRABAJADOR' },
];

// ====================================================================
// MENÚ REAL (para pruebas). Ids fijos (slug) → seed idempotente + combos
// pueden referenciar componentes. Precios en COP.
// ====================================================================

interface MenuProduct {
  id: string;
  name: string;
  description: string;
  basePrice: number;
  category: string;
  /** Variantes "escoge tu proteína" — radio requerido en el POS. */
  sizes?: Array<{ name: string; priceModifier: number }>;
  directResale?: boolean;
  combo?: Array<{ productId: string; quantity: number }>;
}

const MENU: MenuProduct[] = [
  // ---- Burgers ----
  {
    id: 'p-double-smash',
    name: 'Double Smash',
    description:
      'Doble carne smash 80gr, queso cheddar, cebolla caramelizada, tocineta, pepinillos, pan brioche, papas fritas.',
    basePrice: 29000,
    category: 'Burgers',
  },
  {
    id: 'p-triple-smash',
    name: 'Triple Smash',
    description:
      'Triple carne smash 80gr, queso cheddar, cebolla caramelizada, tocineta, pepinillos, pan brioche, papas fritas.',
    basePrice: 40000,
    category: 'Burgers',
  },
  {
    id: 'p-sandwich-terco',
    name: 'Sandwich Terco',
    description:
      'Pollo crispy, miel ahumada, coleslaw, pepinillos, pan brioche, papas fritas.',
    basePrice: 27000,
    category: 'Burgers',
  },

  // ---- Papas y macarrones (escoge tu proteína) ----
  {
    id: 'p-papas-terco',
    name: 'Papas Terco',
    description:
      'Papas a la francesa con pepinillos encurtidos, salsa americana, ranchera y cheddar.',
    basePrice: 25000, // Pollo crispy
    category: 'Papas y macarrones',
    sizes: [
      { name: 'Pollo crispy con miel ahumada', priceModifier: 0 },
      { name: 'Carne smash doble con barbacoa', priceModifier: 3000 },
      { name: 'Mixto', priceModifier: 4000 },
    ],
  },
  {
    id: 'p-mac-cheese',
    name: 'Mac and Cheese',
    description:
      'Macarrones con salsa cheddar, pepinillos encurtidos, salsa americana y ranch.',
    basePrice: 27000, // Pollo crispy
    category: 'Papas y macarrones',
    sizes: [
      { name: 'Pollo crispy con miel ahumada', priceModifier: 0 },
      { name: 'Carne smash doble con barbacoa', priceModifier: 2000 },
      { name: 'Mixto', priceModifier: 5000 },
    ],
  },
  {
    id: 'p-mac-papas',
    name: 'Mac and Papas',
    description:
      'Macarrones con salsa cheddar y papas a la francesa, pepinillos, salsa americana y ranch.',
    basePrice: 29000, // Pollo crispy
    category: 'Papas y macarrones',
    sizes: [
      { name: 'Pollo crispy con miel ahumada', priceModifier: 0 },
      { name: 'Carne smash doble con barbacoa', priceModifier: 3000 },
      { name: 'Mixto', priceModifier: 4000 },
    ],
  },

  // ---- Burros ----
  {
    id: 'p-burro-smash',
    name: 'Burro Smash',
    description:
      'Relleno con carne smash, queso cheddar, salsa barbacoa, ranch, pepinillos, tocineta y papas a la francesa.',
    basePrice: 28000,
    category: 'Burros',
  },
  {
    id: 'p-burro-pollo',
    name: 'Burro Pollo',
    description:
      'Relleno con pollo crispy, miel ahumada, salsa americana, ranch, coleslaw, pepinillos y papas a la francesa.',
    basePrice: 27000,
    category: 'Burros',
  },
  {
    id: 'p-burro-terco',
    name: 'Burro Terco',
    description:
      'Carne doble smash y pollo crispy, queso cheddar, barbacoa, ranch, americana, pepinillos, tocineta ahumada, papas fritas.',
    basePrice: 33000,
    category: 'Burros',
  },

  // ---- Tenders ----
  {
    id: 'p-tenders-terco',
    name: 'Tenders Terco',
    description:
      'Lomitos de pollo crocante, papas fritas, salsa ranch, barbacoa y americana.',
    basePrice: 25000,
    category: 'Tenders',
  },

  // ---- Bebidas (direct-resale) ----
  { id: 'p-coca-cola', name: 'Coca-Cola 400ml', description: 'Gaseosa', basePrice: 5000, category: 'Bebidas', directResale: true },
  { id: 'p-coca-zero', name: 'Coca-Cola Sin Azúcar 400ml', description: 'Gaseosa', basePrice: 5000, category: 'Bebidas', directResale: true },
  { id: 'p-sprite', name: 'Sprite 400ml', description: 'Gaseosa', basePrice: 5000, category: 'Bebidas', directResale: true },
  { id: 'p-agua', name: 'Agua 600ml', description: 'Agua sin gas', basePrice: 4000, category: 'Bebidas', directResale: true },
  { id: 'p-limonada', name: 'Limonada Natural', description: 'Limonada de la casa', basePrice: 7000, category: 'Bebidas', directResale: true },

  // ---- Combos ----
  {
    id: 'p-combo-1',
    name: 'Combo 1',
    description: 'Double Smash + Tenders de pollo + papas americanas.',
    basePrice: 78000,
    category: 'Combos',
    combo: [
      { productId: 'p-double-smash', quantity: 1 },
      { productId: 'p-tenders-terco', quantity: 1 },
      { productId: 'p-papas-terco', quantity: 1 },
    ],
  },
  {
    id: 'p-combo-2',
    name: 'Combo 2',
    description: '2 Sandwiches Terco + Tenders + Mac and Cheese + papas + coleslaw.',
    basePrice: 70000,
    category: 'Combos',
    combo: [
      { productId: 'p-sandwich-terco', quantity: 2 },
      { productId: 'p-tenders-terco', quantity: 1 },
      { productId: 'p-mac-cheese', quantity: 1 },
      { productId: 'p-papas-terco', quantity: 1 },
    ],
  },
];

async function seedMenu(): Promise<void> {
  // 1ra pasada: productos simples + variantes + bebidas (los combos los
  // referencian, así que van antes).
  for (const p of MENU.filter((m) => !m.combo)) {
    const isResale = p.directResale ?? false;
    const scalar = {
      name: p.name,
      description: p.description,
      basePrice: p.basePrice,
      category: p.category,
      isActive: true,
      isCombo: false,
      comboPrice: null,
      directResale: isResale,
      ...(isResale
        ? { unitPurchase: 'unidad', unitStock: 'unidad', conversionFactor: 1, thresholdMin: 12 }
        : {}),
    };
    const pid = slugUuid(p.id);
    await prisma.product.upsert({
      where: { id: pid },
      update: scalar,
      create: { id: pid, ...scalar },
    });
    await prisma.productSize.deleteMany({ where: { productId: pid } });
    if (p.sizes?.length) {
      await prisma.productSize.createMany({
        data: p.sizes.map((s, i) => ({
          productId: pid,
          name: s.name,
          priceModifier: s.priceModifier,
          sortOrder: i,
        })),
      });
    }
    console.log(`✓ producto ${p.name} ($${p.basePrice.toLocaleString('es-CO')})`);
  }

  // 2da pasada: combos + sus componentes.
  for (const p of MENU.filter((m) => m.combo)) {
    const scalar = {
      name: p.name,
      description: p.description,
      basePrice: p.basePrice,
      category: p.category,
      isActive: true,
      isCombo: true,
      comboPrice: p.basePrice,
      directResale: false,
    };
    const pid = slugUuid(p.id);
    await prisma.product.upsert({
      where: { id: pid },
      update: scalar,
      create: { id: pid, ...scalar },
    });
    await prisma.comboComponent.deleteMany({ where: { comboId: pid } });
    await prisma.comboComponent.createMany({
      data: p.combo!.map((c) => ({
        comboId: pid,
        productId: slugUuid(c.productId),
        quantity: c.quantity,
      })),
    });
    console.log(`✓ combo ${p.name} ($${p.basePrice.toLocaleString('es-CO')})`);
  }
}

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
      },
    });
    console.log(`✓ user ${seed.email} (${seed.role})`);
  }
  console.log(`\nAll users use password: ${DEV_PASSWORD}\n`);

  await seedMenu();
  console.log('\n✓ Menú de pruebas listo.');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
