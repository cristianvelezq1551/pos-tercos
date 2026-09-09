// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ComboRecipeView, type ComboComponentRow } from './ComboRecipeView';

const preparado: ComboComponentRow = {
  productId: '11111111-1111-4111-8111-111111111111',
  productName: 'Double smash',
  quantity: 2,
  unitCost: 10763.54,
  costContribution: 21527.07,
  missingReason: null,
  directResale: false,
};
const bebida: ComboComponentRow = {
  productId: '22222222-2222-4222-8222-222222222222',
  productName: 'Pepsi 400ml',
  quantity: 2,
  unitCost: 1666.67,
  costContribution: 3333.33,
  missingReason: null,
  directResale: true,
};

const render1 = (props: Partial<Parameters<typeof ComboRecipeView>[0]> = {}) =>
  render(
    <ComboRecipeView
      components={[preparado, bebida]}
      totalCost={24860.4}
      missingReasons={[]}
      comboPrice={60000}
      {...props}
    />,
  );

describe('ComboRecipeView', () => {
  it('NUNCA dice que no hay nada que descontar: un combo sí descuenta', () => {
    render1();
    // El cartel del editor vacío era falso para un combo y hacía pensar que la
    // venta no iba a mover el inventario.
    expect(screen.queryByText(/sin insumos para descontar/i)).toBeNull();
    expect(screen.getByText(/Este combo no lleva receta propia/i)).toBeTruthy();
  });

  it('lista cada componente con su cantidad y de dónde sale el descuento', () => {
    render1();
    expect(screen.getByText(/Double smash/)).toBeTruthy();
    expect(screen.getByText(/Pepsi 400ml/)).toBeTruthy();
    expect(screen.getAllByText(/2×/)).toHaveLength(2);
    expect(screen.getByText(/descuenta su propio stock/i)).toBeTruthy();
    expect(screen.getByText(/descuenta los insumos de su receta/i)).toBeTruthy();
    // Solo el preparado enlaza a una receta; la bebida no tiene.
    expect(screen.getAllByRole('link', { name: /Ver su receta/i })).toHaveLength(1);
  });

  it('muestra costo y margen del combo', () => {
    render1();
    expect(screen.getByText(/24\.860/)).toBeTruthy();
    expect(screen.getByText(/58\.6% de margen/)).toBeTruthy();
  });

  it('un costo en $0 se declara faltante, no exacto — nada cuesta cero', () => {
    // Con cero como cifra buena, la pantalla pintaría "100% de margen" en verde.
    render1({
      components: [{ ...preparado, unitCost: 0, costContribution: 0 }],
      totalCost: 0,
    });
    expect(screen.getByText('sin costo cargado')).toBeTruthy();
    expect(screen.getByText('sin costo')).toBeTruthy();
    expect(screen.queryByText(/% de margen/)).toBeNull();
    expect(screen.getByText(/Falta cargar el costo/i)).toBeTruthy();
  });

  it('avisa fuerte si el combo quedó sin componentes: ahí SÍ no descuenta nada', () => {
    render1({ components: [], totalCost: 0 });
    expect(screen.getByText(/no se descuenta nada del inventario/i)).toBeTruthy();
    // Y no confunde el caso con "falta cargar un costo", que es otro problema.
    expect(screen.queryByText(/Falta cargar el costo/i)).toBeNull();
  });

  it('un componente borrado del catálogo se nombra, no se esconde', () => {
    render1({
      components: [{ ...preparado, productName: '(eliminado)', directResale: null }],
    });
    expect(screen.getByText(/Componente no encontrado/i)).toBeTruthy();
  });
});
