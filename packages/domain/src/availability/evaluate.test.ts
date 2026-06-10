import { describe, expect, it } from 'vitest';
import { evaluateAvailability, type AvailabilityProduct } from './evaluate';
import type { RecipeEdgeNode, RecipeGraph } from '../recipe/types';

function product(id: string, overrides: Partial<AvailabilityProduct> = {}): AvailabilityProduct {
  return {
    id,
    name: id,
    isActive: true,
    directResale: false,
    isCombo: false,
    soldOut: false,
    comboComponents: [],
    ...overrides,
  };
}

function buildGraph(opts: {
  subproducts?: Array<{ id: string; name?: string; yield?: number }>;
  ingredients?: Array<{ id: string; name?: string }>;
  edges?: Array<{
    parentId: string;
    parentKind?: 'product' | 'subproduct';
    childKind: 'ingredient' | 'subproduct';
    childId: string;
    qty: number;
    merma?: number;
  }>;
}): RecipeGraph {
  const edgesByParent = new Map<string, RecipeEdgeNode[]>();
  for (const e of opts.edges ?? []) {
    const kind = e.parentKind ?? 'product';
    const key = `${kind === 'product' ? 'p' : 's'}:${e.parentId}`;
    const list = edgesByParent.get(key) ?? [];
    list.push({
      parent: { kind, id: e.parentId },
      child: { kind: e.childKind, id: e.childId },
      quantityNeta: e.qty,
      mermaPct: e.merma ?? 0,
    });
    edgesByParent.set(key, list);
  }
  // Los products del grafo se infieren de las edges (evaluate solo necesita
  // que el parent exista cuando expande).
  const productIds = new Set<string>();
  for (const e of opts.edges ?? []) {
    if ((e.parentKind ?? 'product') === 'product') productIds.add(e.parentId);
  }
  return {
    products: new Map([...productIds].map((id) => [id, { id, name: id }])),
    subproducts: new Map(
      (opts.subproducts ?? []).map((s) => [s.id, { id: s.id, name: s.name ?? s.id, yield: s.yield ?? 1 }]),
    ),
    ingredients: new Map(
      (opts.ingredients ?? []).map((i) => [i.id, { id: i.id, name: i.name ?? i.id, unitRecipe: 'g' }]),
    ),
    edgesByParent,
  };
}

const EMPTY_GRAPH = buildGraph({});

function evaluate(opts: {
  products: AvailabilityProduct[];
  graph?: RecipeGraph;
  productStock?: Record<string, number>;
  ingredientStock?: Record<string, number>;
  subproductStock?: Record<string, number>;
}) {
  return evaluateAvailability({
    products: opts.products,
    graph: opts.graph ?? EMPTY_GRAPH,
    productStock: new Map(Object.entries(opts.productStock ?? {})),
    ingredientStock: new Map(Object.entries(opts.ingredientStock ?? {})),
    subproductStock: new Map(Object.entries(opts.subproductStock ?? {})),
  });
}

describe('evaluateAvailability · reventa directa', () => {
  it('disponible con stock > 0', () => {
    const [r] = evaluate({
      products: [product('coca', { directResale: true })],
      productStock: { coca: 5 },
    });
    expect(r).toEqual({ productId: 'coca', available: true, stock: 5, reason: null });
  });

  it('sin stock → "Sin stock"', () => {
    const [r] = evaluate({
      products: [product('coca', { directResale: true })],
      productStock: { coca: 0 },
    });
    expect(r.available).toBe(false);
    expect(r.reason).toBe('Sin stock');
  });

  it('producto sin entrada de stock cuenta como 0', () => {
    const [r] = evaluate({ products: [product('coca', { directResale: true })] });
    expect(r.available).toBe(false);
  });
});

describe('evaluateAvailability · 86 manual (soldOut)', () => {
  it('soldOut invalida aunque haya stock', () => {
    const [r] = evaluate({
      products: [product('coca', { directResale: true, soldOut: true })],
      productStock: { coca: 99 },
    });
    expect(r.available).toBe(false);
    expect(r.reason).toBe('Agotado (manual)');
  });

  it('los productos inactivos no aparecen en el resultado', () => {
    const results = evaluate({
      products: [product('activo', { directResale: true }), product('viejo', { directResale: true, isActive: false })],
      productStock: { activo: 1, viejo: 1 },
    });
    expect(results.map((r) => r.productId)).toEqual(['activo']);
  });
});

describe('evaluateAvailability · preparados (primer nivel de receta)', () => {
  const graph = buildGraph({
    subproducts: [{ id: 'salsa', name: 'Salsa de la Casa' }],
    ingredients: [
      { id: 'pan', name: 'Pan' },
      { id: 'carne', name: 'Carne' },
    ],
    edges: [
      { parentId: 'burger', childKind: 'ingredient', childId: 'pan', qty: 1 },
      { parentId: 'burger', childKind: 'ingredient', childId: 'carne', qty: 150, merma: 0.25 },
      { parentId: 'burger', childKind: 'subproduct', childId: 'salsa', qty: 1 },
    ],
  });

  it('disponible cuando insumos y subproductos directos alcanzan para 1 unidad', () => {
    const [r] = evaluate({
      products: [product('burger')],
      graph,
      ingredientStock: { pan: 10, carne: 500 },
      subproductStock: { salsa: 3 },
    });
    expect(r.available).toBe(true);
    expect(r.reason).toBeNull();
  });

  it('falta el subproducto → nombra el subproducto, no sus insumos profundos', () => {
    const [r] = evaluate({
      products: [product('burger')],
      graph,
      ingredientStock: { pan: 10, carne: 500 },
      subproductStock: { salsa: 0 },
    });
    expect(r.available).toBe(false);
    expect(r.reason).toBe('Sin Salsa de la Casa');
  });

  it('la merma cuenta: 150g netos con 25% merma necesitan 200g brutos', () => {
    const [r] = evaluate({
      products: [product('burger')],
      graph,
      ingredientStock: { pan: 10, carne: 199 }, // alcanza neto pero no bruto
      subproductStock: { salsa: 3 },
    });
    expect(r.available).toBe(false);
    expect(r.reason).toContain('Carne');
  });

  it('stock exactamente igual a lo requerido es suficiente (epsilon)', () => {
    const [r] = evaluate({
      products: [product('burger')],
      graph,
      ingredientStock: { pan: 1, carne: 200 },
      subproductStock: { salsa: 1 },
    });
    expect(r.available).toBe(true);
  });

  it('lista todos los faltantes en el motivo', () => {
    const [r] = evaluate({
      products: [product('burger')],
      graph,
      ingredientStock: { pan: 0, carne: 0 },
      subproductStock: { salsa: 0 },
    });
    expect(r.reason).toContain('Pan');
    expect(r.reason).toContain('Carne');
    expect(r.reason).toContain('Salsa de la Casa');
  });

  it('receta rota o ausente NO bloquea (red de seguridad = 86 manual)', () => {
    const [r] = evaluate({ products: [product('sin-receta')], graph: EMPTY_GRAPH });
    expect(r.available).toBe(true);
    expect(r.reason).toBeNull();
  });
});

describe('evaluateAvailability · combos', () => {
  const graph = buildGraph({
    ingredients: [{ id: 'carne', name: 'Carne' }],
    edges: [{ parentId: 'burger', childKind: 'ingredient', childId: 'carne', qty: 150 }],
  });
  const burger = product('burger');
  const coca = product('coca', { name: 'Coca 600ml', directResale: true });
  const combo = product('combo', {
    isCombo: true,
    comboComponents: [
      { productId: 'burger', quantity: 2 },
      { productId: 'coca', quantity: 1 },
    ],
  });

  it('disponible cuando todos los componentes alcanzan', () => {
    const results = evaluate({
      products: [burger, coca, combo],
      graph,
      productStock: { coca: 5 },
      ingredientStock: { carne: 300 }, // justo para 2 burgers
    });
    const r = results.find((x) => x.productId === 'combo')!;
    expect(r.available).toBe(true);
  });

  it('agrega requerimientos: 2 burgers necesitan 300g, con 299g no alcanza', () => {
    const results = evaluate({
      products: [burger, coca, combo],
      graph,
      productStock: { coca: 5 },
      ingredientStock: { carne: 299 },
    });
    const r = results.find((x) => x.productId === 'combo')!;
    expect(r.available).toBe(false);
    expect(r.reason).toContain('Carne');
  });

  it('componente de reventa directa sin stock bloquea el combo', () => {
    const results = evaluate({
      products: [burger, coca, combo],
      graph,
      productStock: { coca: 0 },
      ingredientStock: { carne: 500 },
    });
    const r = results.find((x) => x.productId === 'combo')!;
    expect(r.available).toBe(false);
    expect(r.reason).toBe('Sin Coca 600ml');
  });

  it('componente con 86 manual bloquea el combo con su nombre', () => {
    const results = evaluate({
      products: [product('burger', { soldOut: true, name: 'Burger Clásica' }), coca, combo],
      graph,
      productStock: { coca: 5 },
      ingredientStock: { carne: 500 },
    });
    const r = results.find((x) => x.productId === 'combo')!;
    expect(r.available).toBe(false);
    expect(r.reason).toBe('Sin Burger Clásica');
  });

  it('componente que no existe en el catálogo → "Combo mal configurado"', () => {
    const roto = product('roto', {
      isCombo: true,
      comboComponents: [{ productId: 'fantasma', quantity: 1 }],
    });
    const [r] = evaluate({ products: [roto], graph: EMPTY_GRAPH });
    expect(r.available).toBe(false);
    expect(r.reason).toBe('Combo mal configurado');
  });
});
