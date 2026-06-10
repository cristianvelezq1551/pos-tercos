/**
 * Verifica la CAPTURA de costo por los servicios REALES (no inserts directos):
 *  - InventoryService.createMovement persiste unit_cost en entradas.
 *  - Guard 4.5: un segundo INITIAL se rechaza.
 *  - El CogsService valoriza ese stock correctamente.
 */
import { PrismaService } from '../src/prisma/prisma.service';
import { InventoryService } from '../src/inventory/inventory.service';
import { RecipesService } from '../src/recipes/recipes.service';
import { CogsService } from '../src/reports/cogs.service';

let failures = 0;
function check(label: string, ok: boolean, extra = ''): void {
  console.log(`${ok ? '✅' : '❌'} ${label}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failures++;
}

async function main(): Promise<void> {
  const prisma = new PrismaService();
  await prisma.$connect();
  const inventory = new InventoryService(prisma);
  const cogs = new CogsService(prisma, new RecipesService(prisma));

  const sal = await prisma.ingredient.create({
    data: { name: 'Sal', unitPurchase: 'bulto', unitRecipe: 'g', conversionFactor: 1000, thresholdMin: 0 },
  });

  // 1) INITIAL con costo → debe persistir unit_cost
  const m = await inventory.createMovement({
    entityType: 'INGREDIENT',
    ingredientId: sal.id,
    delta: 100,
    type: 'INITIAL',
    unitCost: 50,
  });
  check('createMovement devuelve unitCost', m.unitCost === 50, `unitCost=${m.unitCost}`);
  const row = await prisma.inventoryMovement.findUnique({ where: { id: m.id } });
  check('unit_cost persistido en DB', Number(row?.unitCost) === 50, `db=${row?.unitCost}`);

  // 2) Guard 4.5: segundo INITIAL rechazado
  let rejected = false;
  try {
    await inventory.createMovement({ entityType: 'INGREDIENT', ingredientId: sal.id, delta: 20, type: 'INITIAL', unitCost: 60 });
  } catch {
    rejected = true;
  }
  check('segundo INITIAL rechazado (guard 4.5)', rejected);

  // 3) Consumo (ajuste manual −30, sin costo) → FIFO descuenta del lote @50
  await inventory.createMovement({ entityType: 'INGREDIENT', ingredientId: sal.id, delta: -30, type: 'MANUAL_ADJUSTMENT' });

  // 4) Valorización: quedan 70 @ 50 = 3500
  const val = await cogs.getInventoryValuation();
  const salV = val.items.find((i) => i.id === sal.id);
  check('Sal qty restante = 70', salV?.qty === 70, `qty=${salV?.qty}`);
  check('Sal valor = 3500', salV?.value === 3500, `valor=${salV?.value}`);

  await prisma.$disconnect();
  console.log(`\n${failures === 0 ? '🟢 CAPTURA OK' : `🔴 ${failures} fallo(s)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
