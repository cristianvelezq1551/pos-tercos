// @vitest-environment jsdom
import type { Product, ProductAvailability } from '@pos-tercos/types';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CatalogTiles } from './CatalogTiles';

const producto: Product = {
  id: 'combo-1',
  name: 'Combo del miércoles',
  description: null,
  preparationSteps: [],
  basePrice: 60000,
  category: 'Combos',
  imageUrl: null,
  prepImages: [],
  emoji: null,
  modifiersEnabled: false,
  isCombo: false,
  comboPrice: null,
  isActive: true,
  soldOut: false,
  forceAvailable: false,
  directResale: true,
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

describe('Catálogo de la caja · horario del producto', () => {
  it('en su día se ofrece normal', () => {
    pintar({ available: true });
    expect(screen.queryByText('Agotado')).toBeNull();
    expect(screen.queryByText(/^Solo /)).toBeNull();
  });

  it('fuera de su día el sello dice el motivo, NUNCA "Agotado"', () => {
    // "Agotado" mentiría: el producto no se acabó, hoy no se vende.
    pintar({ available: false, reason: 'Solo miércoles', publicReason: 'Solo miércoles' });
    expect(screen.getByText('Solo miércoles')).toBeTruthy();
    expect(screen.queryByText('Agotado')).toBeNull();
  });

  it('sin stock SÍ dice "Agotado" — el horario no tapa el motivo real', () => {
    pintar({ available: false, reason: 'Sin stock', publicReason: null });
    expect(screen.getByText('Agotado')).toBeTruthy();
  });

  it('"forzar disponible" NO destapa un producto fuera de horario', () => {
    // Si la caja lo ofreciera, el cobro lo rechazaría con el cliente enfrente:
    // el backend tampoco deja que forzar se salte el calendario.
    pintar(
      { available: false, reason: 'Solo miércoles', publicReason: 'Solo miércoles' },
      { forced: true },
    );
    expect(screen.getByText('Solo miércoles')).toBeTruthy();
  });

  it('"forzar disponible" SÍ destapa un producto sin stock', () => {
    pintar({ available: false, reason: 'Sin stock', publicReason: null }, { forced: true });
    expect(screen.queryByText('Agotado')).toBeNull();
  });
});
