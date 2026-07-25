import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StockLedgerSnapshot } from './types';

/**
 * El ledger offline es lo único que impide vender lo que ya no existe cuando
 * no hay red. Mutantes que estos tests matan:
 * - no descontar el consumo local → el cajero vende 20 hamburguesas con insumo
 *   para 2 y al sincronizar el backend rechaza todo.
 * - descender a los insumos PROFUNDOS de un subproducto → doble descuento
 *   (esos insumos ya se consumieron al producir la tanda).
 * - un combo que no descuenta sus componentes.
 */

const getLedger = vi.fn();
const setLedger = vi.fn();
vi.mock('./db', () => ({ offlineDb: { getLedger: () => getLedger(), setLedger: (l: unknown) => setLedger(l) } }));

const { applyConsumptionForSale, computeOfflineAvailability } = await import(
  './offline-availability'
);

type Edge = {
  parentId: string;
  parentKind?: 'product' | 'subproduct';
  childKind: 'ingredient' | 'subproduct';
  childId: string;
  qty: number;
  merma?: number;
};

const prod = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: id,
  isActive: true,
  directResale: false,
  isCombo: false,
  soldOut: false,
  forceAvailable: false,
  comboComponents: [],
  ...over,
});

/** Construye el ledger tal como lo cachea el POS (grafo ya serializado). */
function ledger(opts: {
  products: ReturnType<typeof prod>[];
  edges?: Edge[];
  subproducts?: Array<{ id: string; yield?: number }>;
  ingredients?: string[];
  productStock?: Record<string, number>;
  ingredientStock?: Record<string, number>;
  subproductStock?: Record<string, number>;
  productConsumed?: Record<string, number>;
  ingredientConsumed?: Record<string, number>;
  subproductConsumed?: Record<string, number>;
}): StockLedgerSnapshot {
  const byParent = new Map<string, unknown[]>();
  for (const e of opts.edges ?? []) {
    const kind = e.parentKind ?? 'product';
    const key = `${kind === 'product' ? 'p' : 's'}:${e.parentId}`;
    const list = byParent.get(key) ?? [];
    list.push({
      parent: { kind, id: e.parentId },
      child: { kind: e.childKind, id: e.childId },
      quantityNeta: e.qty,
      mermaPct: e.merma ?? 0,
    });
    byParent.set(key, list);
  }
  return {
    snapshot: {
      products: opts.products,
      graph: {
        products: opts.products.map((p) => ({ id: p.id, name: p.name })),
        subproducts: (opts.subproducts ?? []).map((s) => ({
          id: s.id,
          name: s.id,
          yield: s.yield ?? 1,
        })),
        ingredients: (opts.ingredients ?? []).map((id) => ({ id, name: id, unitRecipe: 'g' })),
        edgesByParent: [...byParent.entries()],
      },
      productStock: opts.productStock ?? {},
      ingredientStock: opts.ingredientStock ?? {},
      subproductStock: opts.subproductStock ?? {},
      asOf: '2026-07-22T10:00:00.000Z',
    },
    productConsumed: opts.productConsumed ?? {},
    ingredientConsumed: opts.ingredientConsumed ?? {},
    subproductConsumed: opts.subproductConsumed ?? {},
    cachedAt: '2026-07-22T10:00:00.000Z',
  } as StockLedgerSnapshot;
}

const sale = (lines: Array<{ productId: string; quantity: number }>) =>
  ({ lines }) as Parameters<typeof applyConsumptionForSale>[0];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('computeOfflineAvailability', () => {
  it('sin snapshot cacheado devuelve vacío en vez de romper la pantalla', async () => {
    getLedger.mockResolvedValue(undefined);
    await expect(computeOfflineAvailability()).resolves.toEqual([]);
  });

  it('resta el consumo local del stock del backend', async () => {
    getLedger.mockResolvedValue(
      ledger({
        products: [prod('coke', { directResale: true })],
        productStock: { coke: 10 },
        productConsumed: { coke: 4 },
      }),
    );
    const [r] = await computeOfflineAvailability();
    expect(r.productId).toBe('coke');
    expect(r.stock).toBe(6);
    expect(r.available).toBe(true);
  });

  it('marca agotado cuando el consumo local se comió todo el stock', async () => {
    getLedger.mockResolvedValue(
      ledger({
        products: [prod('coke', { directResale: true })],
        productStock: { coke: 3 },
        productConsumed: { coke: 3 },
      }),
    );
    const [r] = await computeOfflineAvailability();
    expect(r.available).toBe(false);
  });

  it('un preparado se agota cuando falta el insumo tras el consumo local', async () => {
    const build = (ingredientConsumed: Record<string, number>) =>
      ledger({
        products: [prod('burger')],
        edges: [{ parentId: 'burger', childKind: 'ingredient', childId: 'pan', qty: 1 }],
        ingredients: ['pan'],
        ingredientStock: { pan: 2 },
        ingredientConsumed,
      });

    getLedger.mockResolvedValue(build({}));
    expect((await computeOfflineAvailability())[0].available).toBe(true);

    getLedger.mockResolvedValue(build({ pan: 2 }));
    expect((await computeOfflineAvailability())[0].available).toBe(false);
  });

  it('tolera un snapshot viejo sin subproductStock', async () => {
    const l = ledger({ products: [prod('coke', { directResale: true })], productStock: { coke: 1 } });
    delete (l.snapshot as { subproductStock?: unknown }).subproductStock;
    getLedger.mockResolvedValue(l);
    await expect(computeOfflineAvailability()).resolves.toHaveLength(1);
  });
});

describe('applyConsumptionForSale — reventa directa', () => {
  it('descuenta del stock del propio producto y acumula sobre lo previo', async () => {
    getLedger.mockResolvedValue(
      ledger({
        products: [prod('coke', { directResale: true })],
        productStock: { coke: 10 },
        productConsumed: { coke: 1 },
      }),
    );
    await applyConsumptionForSale(sale([{ productId: 'coke', quantity: 3 }]));
    expect(setLedger.mock.calls[0][0].productConsumed).toEqual({ coke: 4 });
  });
});

describe('applyConsumptionForSale — preparados (un solo nivel)', () => {
  it('descuenta los insumos directos aplicando merma', async () => {
    getLedger.mockResolvedValue(
      ledger({
        products: [prod('burger')],
        edges: [
          { parentId: 'burger', childKind: 'ingredient', childId: 'carne', qty: 150, merma: 0.2 },
        ],
        ingredients: ['carne'],
        ingredientStock: { carne: 1000 },
      }),
    );
    await applyConsumptionForSale(sale([{ productId: 'burger', quantity: 2 }]));
    // 150 / (1 - 0.2) = 187.5 por unidad × 2
    expect(setLedger.mock.calls[0][0].ingredientConsumed.carne).toBeCloseTo(375, 6);
  });

  it('descuenta el SUBPRODUCTO, no los insumos profundos (ya se pagaron al producir)', async () => {
    getLedger.mockResolvedValue(
      ledger({
        products: [prod('burger')],
        subproducts: [{ id: 'salsa' }],
        ingredients: ['tomate'],
        edges: [
          { parentId: 'burger', childKind: 'subproduct', childId: 'salsa', qty: 30 },
          {
            parentId: 'salsa',
            parentKind: 'subproduct',
            childKind: 'ingredient',
            childId: 'tomate',
            qty: 500,
          },
        ],
        subproductStock: { salsa: 1000 },
        ingredientStock: { tomate: 5000 },
      }),
    );
    await applyConsumptionForSale(sale([{ productId: 'burger', quantity: 1 }]));
    const saved = setLedger.mock.calls[0][0];
    expect(saved.subproductConsumed).toEqual({ salsa: 30 });
    expect(saved.ingredientConsumed).toEqual({});
  });
});

describe('applyConsumptionForSale — combos', () => {
  it('descuenta cada componente por su cantidad × la del combo', async () => {
    getLedger.mockResolvedValue(
      ledger({
        products: [
          prod('combo', {
            isCombo: true,
            comboComponents: [
              { productId: 'coke', quantity: 2 },
              { productId: 'burger', quantity: 1 },
            ],
          }),
          prod('coke', { directResale: true }),
          prod('burger'),
        ],
        edges: [{ parentId: 'burger', childKind: 'ingredient', childId: 'pan', qty: 1 }],
        ingredients: ['pan'],
        productStock: { coke: 50 },
        ingredientStock: { pan: 50 },
      }),
    );
    await applyConsumptionForSale(sale([{ productId: 'combo', quantity: 3 }]));
    const saved = setLedger.mock.calls[0][0];
    expect(saved.productConsumed).toEqual({ coke: 6 });
    expect(saved.ingredientConsumed).toEqual({ pan: 3 });
  });
});

describe('applyConsumptionForSale — casos degenerados', () => {
  it('sin snapshot cacheado es no-op (no escribe el ledger)', async () => {
    getLedger.mockResolvedValue(undefined);
    await applyConsumptionForSale(sale([{ productId: 'coke', quantity: 1 }]));
    expect(setLedger).not.toHaveBeenCalled();
  });

  it('un producto que no está en el snapshot se ignora sin romper la venta', async () => {
    getLedger.mockResolvedValue(ledger({ products: [prod('coke', { directResale: true })] }));
    await applyConsumptionForSale(sale([{ productId: 'fantasma', quantity: 1 }]));
    expect(setLedger.mock.calls[0][0].productConsumed).toEqual({});
  });

  it('acumula el consumo de varias líneas del mismo producto', async () => {
    getLedger.mockResolvedValue(
      ledger({ products: [prod('coke', { directResale: true })], productStock: { coke: 20 } }),
    );
    await applyConsumptionForSale(
      sale([
        { productId: 'coke', quantity: 2 },
        { productId: 'coke', quantity: 5 },
      ]),
    );
    expect(setLedger.mock.calls[0][0].productConsumed).toEqual({ coke: 7 });
  });
});
