import { PrismaService } from '../../src/prisma/prisma.service';

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
}
