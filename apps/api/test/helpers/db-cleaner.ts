import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Limpia las tablas creadas durante los tests en orden correcto de FKs.
 * Diseñado para correr en afterEach/afterAll sin tocar migraciones.
 */
export async function cleanDb(prisma: PrismaService): Promise<void> {
  // Orden: hijos antes que padres
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE
    idempotency_keys,
    sale_status_log,
    sale_items,
    sales,
    shifts,
    invoice_items,
    invoices,
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
    worker_attendance,
    worker_commissions,
    payment_reconciliations,
    promotion_products,
    promotions,
    approval_pins,
    whatsapp_messages,
    audit_log,
    refresh_tokens,
    users
  RESTART IDENTITY CASCADE`);
}
