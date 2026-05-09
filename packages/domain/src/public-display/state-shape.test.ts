import { describe, expect, it } from 'vitest';
import { PublicDisplayStateSchema } from '@pos-tercos/types';

const baseOrder = {
  saleId: '11111111-1111-1111-1111-111111111111',
  receiptNumber: 428,
  customerName: 'Andrés',
  at: '2026-05-08T12:00:00.000Z',
};

describe('PublicDisplayStateSchema · items[] extension', () => {
  it('parses a state with items on current and next', () => {
    const parsed = PublicDisplayStateSchema.safeParse({
      current: {
        ...baseOrder,
        items: [
          { productName: 'Hamburguesa Carnívora', imageUrl: '/api/products/images/x.png', quantity: 2 },
          { productName: 'Papas Nash', imageUrl: null, quantity: 1 },
        ],
      },
      next: [
        { ...baseOrder, saleId: '22222222-2222-2222-2222-222222222222', receiptNumber: 429, customerName: 'Carolina', items: [] },
      ],
      asOf: '2026-05-08T12:00:01.000Z',
      currentTurn: 7,
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts current=null and empty next', () => {
    const parsed = PublicDisplayStateSchema.safeParse({
      current: null,
      next: [],
      asOf: '2026-05-08T12:00:01.000Z',
      currentTurn: 1,
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects items.length > 4', () => {
    const parsed = PublicDisplayStateSchema.safeParse({
      current: {
        ...baseOrder,
        items: Array.from({ length: 5 }, (_, i) => ({
          productName: `Item ${i}`,
          imageUrl: null,
          quantity: 1,
        })),
      },
      next: [],
      asOf: '2026-05-08T12:00:01.000Z',
      currentTurn: 1,
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects non-positive quantity', () => {
    const parsed = PublicDisplayStateSchema.safeParse({
      current: {
        ...baseOrder,
        items: [{ productName: 'X', imageUrl: null, quantity: 0 }],
      },
      next: [],
      asOf: '2026-05-08T12:00:01.000Z',
      currentTurn: 1,
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects empty productName', () => {
    const parsed = PublicDisplayStateSchema.safeParse({
      current: {
        ...baseOrder,
        items: [{ productName: '', imageUrl: null, quantity: 1 }],
      },
      next: [],
      asOf: '2026-05-08T12:00:01.000Z',
      currentTurn: 1,
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects state missing items field on current', () => {
    const parsed = PublicDisplayStateSchema.safeParse({
      current: { ...baseOrder },
      next: [],
      asOf: '2026-05-08T12:00:01.000Z',
      currentTurn: 1,
    });
    expect(parsed.success).toBe(false);
  });
});
