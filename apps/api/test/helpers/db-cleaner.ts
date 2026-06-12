import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Limpia las tablas creadas durante los tests en orden correcto de FKs.
 * Diseñado para correr en afterEach/afterAll sin tocar migraciones.
 */
export async function cleanDb(prisma: PrismaService): Promise<void> {
  // Orden: hijos antes que padres
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE
    idempotency_keys,
    payment_method_settings,
    sale_payments,
    sale_status_log,
    sale_items,
    sales,
    cash_movements,
    shifts,
    invoice_items,
    invoices,
    stock_counts,
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
    payroll_adjustments,
    payroll_days,
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
