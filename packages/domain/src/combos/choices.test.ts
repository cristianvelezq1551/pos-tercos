import { describe, expect, it } from 'vitest';
import type { ChoiceGroupLike } from './choices';
import {
  aChoices,
  aInputDeChoices,
  elegir,
  nuevaSeleccion,
  recargoDeSeleccion,
  resumenDeSeleccion,
  seleccionCompleta,
} from './choices';

const grupo = (over: Partial<ChoiceGroupLike> = {}): ChoiceGroupLike => ({
  id: 'g1',
  label: 'Bebida',
  quantity: 2,
  options: [
    { productId: 'pepsi', productName: 'Pepsi', priceDelta: 0 },
    { productId: 'coca', productName: 'Coca-Cola', priceDelta: 0 },
    { productId: 'jugo', productName: 'Jugo', priceDelta: 3000 },
  ],
  ...over,
});

describe('combo-choices', () => {
  it('arranca SIN nada elegido: una casilla por unidad', () => {
    expect(nuevaSeleccion([grupo()])).toEqual({ g1: [null, null] });
  });

  it('no deja confirmar hasta que todas las unidades estén elegidas', () => {
    const g = grupo();
    let sel = nuevaSeleccion([g]);
    expect(seleccionCompleta([g], sel)).toBe(false);
    sel = elegir(sel, 'g1', 0, 'coca');
    expect(seleccionCompleta([g], sel)).toBe(false);
    sel = elegir(sel, 'g1', 1, 'coca');
    expect(seleccionCompleta([g], sel)).toBe(true);
  });

  it('agrupa dos casillas de la misma bebida en una sola entrada', () => {
    const g = grupo();
    let sel = nuevaSeleccion([g]);
    sel = elegir(sel, 'g1', 0, 'coca');
    sel = elegir(sel, 'g1', 1, 'coca');
    expect(aInputDeChoices(aChoices([g], sel))).toEqual([
      { groupId: 'g1', productId: 'coca', quantity: 2 },
    ]);
  });

  it('congela nombre y recargo, como el snapshot de los extras', () => {
    const g = grupo();
    let sel = nuevaSeleccion([g]);
    sel = elegir(sel, 'g1', 0, 'jugo');
    sel = elegir(sel, 'g1', 1, 'jugo');
    expect(aChoices([g], sel)).toEqual([
      {
        groupId: 'g1',
        groupLabel: 'Bebida',
        productId: 'jugo',
        productName: 'Jugo',
        quantity: 2,
        priceDelta: 3000,
      },
    ]);
  });

  it('permite mezclar: una de cada una', () => {
    const g = grupo();
    let sel = nuevaSeleccion([g]);
    sel = elegir(sel, 'g1', 0, 'pepsi');
    sel = elegir(sel, 'g1', 1, 'coca');
    expect(aInputDeChoices(aChoices([g], sel))).toEqual([
      { groupId: 'g1', productId: 'pepsi', quantity: 1 },
      { groupId: 'g1', productId: 'coca', quantity: 1 },
    ]);
  });

  it('ignora las unidades sin elegir al armar el pedido', () => {
    const g = grupo();
    const sel = elegir(nuevaSeleccion([g]), 'g1', 0, 'coca');
    expect(aInputDeChoices(aChoices([g], sel))).toEqual([
      { groupId: 'g1', productId: 'coca', quantity: 1 },
    ]);
  });

  it('cobra el recargo POR UNIDAD elegida', () => {
    const g = grupo();
    let sel = nuevaSeleccion([g]);
    sel = elegir(sel, 'g1', 0, 'jugo');
    expect(recargoDeSeleccion([g], sel)).toBe(3000);
    sel = elegir(sel, 'g1', 1, 'jugo');
    expect(recargoDeSeleccion([g], sel)).toBe(6000);
  });

  it('una opción sin recargo no suma nada', () => {
    const g = grupo();
    let sel = nuevaSeleccion([g]);
    sel = elegir(sel, 'g1', 0, 'coca');
    sel = elegir(sel, 'g1', 1, 'pepsi');
    expect(recargoDeSeleccion([g], sel)).toBe(0);
  });

  it('resume lo elegido para la fila del carrito', () => {
    const g = grupo();
    let sel = nuevaSeleccion([g]);
    sel = elegir(sel, 'g1', 0, 'coca');
    sel = elegir(sel, 'g1', 1, 'coca');
    expect(resumenDeSeleccion([g], sel)).toEqual(['Bebida: 2 Coca-Cola']);

    sel = elegir(sel, 'g1', 1, 'pepsi');
    expect(resumenDeSeleccion([g], sel)).toEqual(['Bebida: Coca-Cola, Pepsi']);
  });

  it('un combo sin grupos no pide nada y se confirma de una', () => {
    expect(nuevaSeleccion([])).toEqual({});
    expect(seleccionCompleta([], {})).toBe(true);
    expect(aChoices([], {})).toEqual([]);
  });
});
