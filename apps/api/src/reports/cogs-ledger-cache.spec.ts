import { CogsService } from './cogs.service';
import { LedgerFreshnessService } from '../common/ledger-freshness/ledger-freshness.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RecipesService } from '../recipes/recipes.service';

/**
 * El replay FIFO se cachea 60 s. Registrar una MERMA lo invalida, porque se
 * mira enseguida (ver `LedgerFreshnessService`).
 *
 * Sin estas pruebas los dos fallos del mecanismo son silenciosos: si la caché
 * nunca sirviera, cada reporte replayaría la historia entera y solo se notaría
 * como lentitud; si nunca se invalidara, el costo de una merma recién
 * registrada tardaría un minuto en aparecer y parecería un error de cálculo.
 */
describe('CogsService — caché del ledger', () => {
  let fetches: number;
  let freshness: LedgerFreshnessService;
  let cogs: CogsService;

  beforeEach(() => {
    fetches = 0;
    const prisma = {
      ledgerSnapshot: { findFirst: jest.fn().mockResolvedValue(null) },
      inventoryMovement: {
        findMany: jest.fn().mockImplementation(() => {
          fetches += 1;
          return Promise.resolve([]);
        }),
      },
      ingredient: { findMany: jest.fn().mockResolvedValue([]) },
      product: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    freshness = new LedgerFreshnessService();
    cogs = new CogsService(prisma, {} as RecipesService, freshness);
  });

  const readLedger = () => cogs.getWasteCostByMovement(new Date('2026-01-01'));

  it('dos lecturas seguidas replayan UNA sola vez', async () => {
    await readLedger();
    await readLedger();
    expect(fetches).toBe(1);
  });

  it('registrar una merma invalida la caché: la lectura siguiente replaya', async () => {
    await readLedger();
    freshness.bump(); // lo que hace InventoryService al crear un WASTE
    await readLedger();
    expect(fetches).toBe(2);
  });

  it('varias mermas seguidas no disparan un replay por cada una', async () => {
    await readLedger();
    freshness.bump();
    freshness.bump();
    freshness.bump();
    await readLedger();
    // El replay ocurre al LEER, no al escribir: 3 mermas → 1 recálculo.
    expect(fetches).toBe(2);
  });

  it('lecturas concurrentes comparten un solo replay', async () => {
    await Promise.all([readLedger(), readLedger(), readLedger()]);
    expect(fetches).toBe(1);
  });

  it('invalidateLedgerCache (snapshot mensual) sigue forzando el recálculo', async () => {
    await readLedger();
    cogs.invalidateLedgerCache();
    await readLedger();
    expect(fetches).toBe(2);
  });
});
