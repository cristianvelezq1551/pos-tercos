/**
 * Identidad de fila en las listas editables del formulario de producto (§L2).
 *
 * Con el índice como `key`, React reconcilia por POSICIÓN: al quitar una fila
 * del medio destruye el nodo de la última y reusa los de arriba para datos que
 * ya no son suyos. El síntoma que se ve es la pérdida de foco mientras se
 * escribe — alguien cargando 5 variantes quita una y el cursor desaparece.
 *
 * Los inputs son controlados, así que los VALORES nunca se corrompen: por eso
 * el test mira el foco, que es donde la diferencia se nota.
 */
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { ProductFormVariantsSection } from './ProductFormVariantsSection';
import { newRowKey, type FormState } from './ProductFormTypes';

function filaVariante(name: string, price: string) {
  return { rowKey: newRowKey(), name, price };
}

/** Envuelve la sección con el estado real del formulario. */
function Host({ inicial }: { inicial: FormState['sizes'] }) {
  const [form, setForm] = useState<FormState>(
    () =>
      ({
        kind: 'variants',
        name: '',
        description: '',
        preparationSteps: [],
        basePrice: '',
        category: '',
        imageUrl: '',
  prepImageUrl: '',
        emoji: '',
        modifiersEnabled: false,
        isCombo: false,
        comboPrice: '',
        isActive: true,
        directResale: false,
        unitPurchase: '',
        unitStock: '',
        conversionFactor: '',
        thresholdMin: '0',
        sizes: inicial,
        modifiers: [],
        comboComponents: [],
      }) as FormState,
  );
  return <ProductFormVariantsSection form={form} setForm={setForm} pending={false} />;
}

describe('ProductFormVariantsSection — identidad de fila', () => {
  it('quitar una fila de arriba NO le roba el foco a la de abajo', () => {
    render(
      <Host
        inicial={[
          filaVariante('Pollo', '18000'),
          filaVariante('Carne', '20000'),
          filaVariante('Mixta', '22000'),
        ]}
      />,
    );

    // Alguien está escribiendo en la ÚLTIMA variante...
    const mixta = screen.getByDisplayValue('Mixta') as HTMLInputElement;
    mixta.focus();
    expect(document.activeElement).toBe(mixta);

    // ...y quita la PRIMERA (se equivocó al cargarla).
    fireEvent.click(screen.getAllByRole('button', { name: 'Quitar variante' })[0]!);

    // La fila donde estaba el cursor sigue existiendo y conserva el foco.
    // Con `key={i}` React destruye el nodo de la última fila y el foco se cae
    // al body: `activeElement` deja de ser el input de "Mixta".
    const mixtaDespues = screen.getByDisplayValue('Mixta');
    expect(document.activeElement).toBe(mixtaDespues);
    expect(screen.queryByDisplayValue('Pollo')).toBeNull();
  });

  it('quitar una fila quita ESA fila, no la de al lado', () => {
    render(
      <Host
        inicial={[
          filaVariante('Pollo', '18000'),
          filaVariante('Carne', '20000'),
          filaVariante('Mixta', '22000'),
        ]}
      />,
    );

    const quitar = screen.getAllByRole('button', { name: 'Quitar variante' });
    fireEvent.click(quitar[1]!); // la del medio

    expect(screen.getByDisplayValue('Pollo')).toBeTruthy();
    expect(screen.queryByDisplayValue('Carne')).toBeNull();
    expect(screen.getByDisplayValue('Mixta')).toBeTruthy();
  });
});
