/* eslint-disable */
/**
 * Verificación end-to-end del costeo FIFO contra una DB desechable.
 * Construye un escenario con números calculados a mano y corre el CogsService
 * real, afirmando cada resultado. Se ejecuta con DATABASE_URL apuntando a una
 * DB de prueba (ver fifo-verify.sh).
 */
import { PrismaService } from '../src/prisma/prisma.service';
import { RecipesService } from '../src/recipes/recipes.service';
import { CogsService } from '../src/reports/cogs.service';

const D = (h: number) => new Date(`2026-03-15T${String(h).padStart(2, '0')}:00:00.000Z`);

let failures = 0;
function assertEq(label: string, actual: unknown, expected: unknown): void {
  const a = typeof actual === 'number' ? Math.round(actual * 100) / 100 : actual;
  const ok = a === expected;
  console.log(`${ok ? '✅' : '❌'} ${label}: ${a}${ok ? '' : ` (esperado ${expected})`}`);
  if (!ok) failures++;
}

async function main(): Promise<void> {
  const prisma = new PrismaService();
  await prisma.$connect();
  const cogs = new CogsService(prisma, new RecipesService(prisma));

  // ── Catálogo ──────────────────────────────────────────────────
  const pollo = await prisma.ingredient.create({
    data: { name: 'Pollo', unitPurchase: 'kg', unitRecipe: 'g', conversionFactor: 1000, thresholdMin: 0 },
  });
  const burger = await prisma.product.create({
    data: { name: 'Hamburguesa', basePrice: 9000, directResale: false, isCombo: false },
  });
  await prisma.recipeEdge.create({
    data: { parentProductId: burger.id, childIngredientId: pollo.id, quantityNeta: 300, mermaPct: 0 },
  });
  const gaseosa = await prisma.product.create({
    data: {
      name: 'Gaseosa',
      basePrice: 3000,
      directResale: true,
      unitPurchase: 'caja',
      unitStock: 'unidad',
      conversionFactor: 24,
    },
  });

  // ── Compras (2 lotes de pollo a distinto precio + gaseosa) ────
  await prisma.inventoryMovement.createMany({
    data: [
      { entityType: 'INGREDIENT', ingredientId: pollo.id, delta: 500, unitCost: 10, type: 'PURCHASE', sourceType: 'invoice', sourceId: 'inv1', createdAt: D(1) },
      { entityType: 'INGREDIENT', ingredientId: pollo.id, delta: 500, unitCost: 20, type: 'PURCHASE', sourceType: 'invoice', sourceId: 'inv2', createdAt: D(2) },
      { entityType: 'PRODUCT', productId: gaseosa.id, delta: 24, unitCost: 1500, type: 'PURCHASE', sourceType: 'invoice', sourceId: 'inv3', createdAt: D(1) },
    ],
  });

  // ── Ventas + consumos ─────────────────────────────────────────
  const mkSale = async (id: string, paidAt: Date, items: { product: typeof burger; qty: number; price: number }[], status = 'PAGADO') => {
    const total = items.reduce((s, it) => s + it.qty * it.price, 0);
    await prisma.sale.create({
      data: {
        id,
        type: 'COUNTER',
        status: status as any,
        subtotal: total,
        total,
        paidAt,
        paymentMethod: 'CASH',
        items: {
          create: items.map((it) => ({
            productId: it.product.id,
            quantity: it.qty,
            unitPrice: it.price,
            lineSubtotal: it.qty * it.price,
            lineTotal: it.qty * it.price,
          })),
        },
      },
    });
  };

  await mkSale('saleA', D(3), [{ product: burger, qty: 1, price: 9000 }]);
  await prisma.inventoryMovement.create({ data: { entityType: 'INGREDIENT', ingredientId: pollo.id, delta: -300, type: 'SALE', sourceType: 'sale', sourceId: 'saleA', createdAt: D(3) } });

  await mkSale('saleB', D(4), [{ product: burger, qty: 1, price: 9000 }]);
  await prisma.inventoryMovement.create({ data: { entityType: 'INGREDIENT', ingredientId: pollo.id, delta: -300, type: 'SALE', sourceType: 'sale', sourceId: 'saleB', createdAt: D(4) } });

  await mkSale('saleC', D(5), [{ product: gaseosa, qty: 2, price: 3000 }]);
  await prisma.inventoryMovement.create({ data: { entityType: 'PRODUCT', productId: gaseosa.id, delta: -2, type: 'SALE', sourceType: 'sale', sourceId: 'saleC', createdAt: D(5) } });

  // Merma de 50g de pollo (sale de lote2 @20)
  await prisma.inventoryMovement.create({ data: { entityType: 'INGREDIENT', ingredientId: pollo.id, delta: -50, type: 'WASTE', createdAt: D(6) } });

  // Venta D, luego ANULADA (reversión re-inyecta el lote exacto)
  await mkSale('saleD', D(7), [{ product: burger, qty: 1, price: 9000 }], 'VOID');
  await prisma.inventoryMovement.create({ data: { entityType: 'INGREDIENT', ingredientId: pollo.id, delta: -300, type: 'SALE', sourceType: 'sale', sourceId: 'saleD', createdAt: D(7) } });
  await prisma.inventoryMovement.create({ data: { entityType: 'INGREDIENT', ingredientId: pollo.id, delta: 300, type: 'SALE', sourceType: 'sale', sourceId: 'saleD', createdAt: D(8) } });

  const from = new Date('2026-03-15T00:00:00.000Z');
  const to = new Date('2026-03-15T23:59:59.999Z');

  // ── P&L ───────────────────────────────────────────────────────
  console.log('\n— P&L del período —');
  const pnl = await cogs.getPnl(from, to);
  assertEq('revenue', pnl.revenue, 24000); // A 9000 + B 9000 + C 6000 (D excluida)
  assertEq('cogs', pnl.cogs, 10000); // A 3000 + B 4000 + C 3000
  assertEq('grossMargin', pnl.grossMargin, 14000);
  assertEq('wasteCost', pnl.wasteCost, 1000); // 50 @ 20
  assertEq('salesCount', pnl.salesCount, 3);
  assertEq('cogsUnknownQty', pnl.cogsUnknownQty, 0);

  // ── Margen por producto ───────────────────────────────────────
  console.log('\n— Margen real por producto —');
  const margins = await cogs.getProductMargins(from, to);
  const burgerM = margins.products.find((p) => p.productId === burger.id)!;
  const gaseosaM = margins.products.find((p) => p.productId === gaseosa.id)!;
  assertEq('Burger units', burgerM.unitsSold, 2);
  assertEq('Burger revenue', burgerM.revenue, 18000);
  assertEq('Burger cogs', burgerM.cogs, 7000); // 3000 + 4000
  assertEq('Burger margin', burgerM.margin, 11000);
  assertEq('Burger partial', burgerM.cogsPartial, false);
  assertEq('Gaseosa revenue', gaseosaM.revenue, 6000);
  assertEq('Gaseosa cogs', gaseosaM.cogs, 3000); // 2 @ 1500
  assertEq('Gaseosa margin', gaseosaM.margin, 3000);
  assertEq('totals cogs', margins.totals.cogs, 10000);

  // ── Inventario valorizado ─────────────────────────────────────
  console.log('\n— Inventario valorizado —');
  const val = await cogs.getInventoryValuation();
  const polloV = val.items.find((i) => i.id === pollo.id)!;
  const gaseosaV = val.items.find((i) => i.id === gaseosa.id)!;
  assertEq('Pollo qty restante', polloV.qty, 350); // 1000 − 650 neto (D revertida)
  assertEq('Pollo valor', polloV.value, 7000); // 350 @ 20
  assertEq('Gaseosa qty restante', gaseosaV.qty, 22); // 24 − 2
  assertEq('Gaseosa valor', gaseosaV.value, 33000); // 22 @ 1500
  assertEq('valor total', val.totalValue, 40000);

  await prisma.$disconnect();
  console.log(`\n${failures === 0 ? '🟢 TODO OK' : `🔴 ${failures} fallo(s)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
