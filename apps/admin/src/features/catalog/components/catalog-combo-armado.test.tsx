// @vitest-environment jsdom
import type { Product, ProductAvailability } from '@pos-tercos/types';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CatalogTiles } from './CatalogTiles';

const producto: Product = {
  id: 'combo-1',
  name: '2 Papas con pollo',
  description: null,
  preparationSteps: [],
  basePrice: 60000,
  category: 'Combos',
  imageUrl: null,
  prepImages: [],
  emoji: null,
  modifiersEnabled: false,
  isCombo: true,
  comboPrice: 40000,
  isActive: true,
  soldOut: false,
  forceAvailable: false,
  directResale: false,
  unitPurchase: 'caja',
  unitStock: 'unidad',
  conversionFactor: 24,
  thresholdMin: 0,
  lastUnitCost: null,
  lastUnitCostDate: null,
  createdAt: '2026-09-01T12:00:00.000Z',
  updatedAt: '2026-09-01T12:00:00.000Z',
};

function pintar(avail: Partial<ProductAvailability>, overrides: { forced?: boolean } = {}) {
  const disponibilidad = {
    productId: producto.id,
    available: true,
    stock: 10,
    reason: null,
    publicReason: null,
    variants: [],
    ...avail,
  } as ProductAvailability;
  return render(
    <CatalogTiles
      products={[producto]}
      byId={new Map([[producto.id, disponibilidad]])}
      soldOutOverride={new Map()}
      forceAvailableOverride={new Map([[producto.id, overrides.forced ?? false]])}
      togglingId={null}
      promoById={new Map()}
      onOpen={vi.fn()}
      onToggleSoldOut={vi.fn()}
      onToggleForceAvailable={vi.fn()}
    />,
  );
}

/**
 * Un combo cuyo plato ganó variantes después de entrar al combo, sin que el combo
 * diga cuál lleva. El servidor lo rechaza aunque esté "forzado": si la caja lo
 * ofreciera, el cajero lo tocaría y el cobro diría que no con el cliente enfrente.
 */
const MAL_ARMADO = {
  available: false,
  stock: null,
  reason: 'Falta elegir la variante de Papas TERCOS en el combo',
  publicReason: null,
  blockedBySetup: true,
} as const;

describe('Catálogo de la caja · combo mal armado', () => {
  it('el sello dice "Revisar combo" y el motivo, NUNCA "Agotado"', () => {
    pintar(MAL_ARMADO);
    expect(screen.getByText('Revisar combo')).toBeTruthy();
    expect(screen.getByText(/Falta elegir la variante de Papas TERCOS/)).toBeTruthy();
    expect(screen.queryByText('Agotado')).toBeNull();
  });

  it('no ofrece "Forzar": forzar no lo arregla', () => {
    pintar(MAL_ARMADO);
    expect(screen.queryByRole('button', { name: /Forzar/ })).toBeNull();
  });

  it('aunque ya esté forzado, la tarjeta no se puede tocar', () => {
    pintar(MAL_ARMADO, { forced: true });
    const tarjeta = screen.getByRole('button', { name: /2 Papas con pollo/ });
    expect((tarjeta as HTMLButtonElement).disabled).toBe(true);
  });

  it('REGRESIÓN: un combo sin stock sí ofrece "Forzar"', () => {
    pintar({ available: false, stock: null, reason: 'Sin Pollo', publicReason: null });
    expect(screen.getByText('Agotado')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Forzar/ })).toBeTruthy();
  });
});
