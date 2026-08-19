import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Catálogo de categorías de producto que asumen los e2e. `products.create`
 * exige que la categoría exista (ProductCategoriesService.resolveCanonicalName),
 * y la migración solo hace backfill desde productos ya existentes → en una DB de
 * test recién migrada la tabla nace VACÍA y todo `POST /products` daría 400.
 */
const PRODUCT_CATEGORIES = ['Comidas', 'Bebidas', 'Combos', 'Test'] as const;

/**
 * Siembra el catálogo de categorías. Idempotente. La llaman `bootstrapApp` (toda
 * suite lo corre en beforeAll) y `cleanDb` (que TRUNCA la tabla y debe reponerla).
 * Va en los dos lados a propósito: la mayoría de las suites solo limpia en
 * afterAll, así que sembrar únicamente en cleanDb dejaría sin categorías a la
 * primera suite en correr — el resultado dependería del orden de ejecución.
 */
export async function seedProductCategories(prisma: PrismaService): Promise<void> {
  await prisma.productCategory.createMany({
    data: PRODUCT_CATEGORIES.map((name, sortOrder) => ({ name, sortOrder })),
    skipDuplicates: true,
  });
}

/**
 * Limpia las tablas creadas durante los tests en orden correcto de FKs.
 * Diseñado para correr en afterEach/afterAll sin tocar migraciones.
 */
export async function cleanDb(prisma: PrismaService): Promise<void> {
  // Defensa en profundidad: este TRUNCATE una vez borró usuarios/catálogo de
  // la DB de DEV (antes de la separación de DBs). Aunque setup-env.ts fuerza
  // la DB de test, un TEST_DATABASE_URL mal seteado la puede re-apuntar —
  // acá se verifica contra la conexión REAL, no contra env vars.
  const [{ db }] = await prisma.$queryRawUnsafe<Array<{ db: string }>>(
    'SELECT current_database() AS db',
  );
  if (!db.endsWith('_test')) {
    throw new Error(
      `cleanDb se negó a truncar la DB "${db}": no termina en "_test". ` +
        'Los e2e deben correr contra la DB de test, nunca dev/prod.',
    );
  }
  // Orden: hijos antes que padres
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE
    display_slides,
    display_tracks,
    web_hero_slides,
    idempotency_keys,
    payment_method_settings,
    cortesia_requests,
    sale_payments,
    sale_status_log,
    sale_items,
    sales,
    cash_movements,
    shifts,
    invoice_items,
    invoices,
    stock_counts,
    ledger_snapshots,
    inventory_movements,
    supplier_products,
    suppliers,
    recipe_edges,
    product_modifiers,
    product_sizes,
    combo_components,
    products,
    product_categories,
    subproducts,
    ingredients,
    purchase_suggestions,
    payable_commitments,
    treasury_movements,
    treasury_config,
    fixed_cost_payments,
    fixed_costs,
    payroll_payments,
    payroll_week_payments,
    payroll_adjustments,
    payroll_days,
    payment_reconciliations,
    business_config,
    kitchen_incidents,
    checklist_completions,
    checklist_items,
    promotion_products,
    promotions,
    approval_pins,
    whatsapp_messages,
    audit_log,
    refresh_tokens,
    users
  RESTART IDENTITY CASCADE`);

  await seedProductCategories(prisma);
}
