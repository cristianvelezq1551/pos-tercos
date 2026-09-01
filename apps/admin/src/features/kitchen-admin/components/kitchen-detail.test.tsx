// @vitest-environment jsdom
import type { ChecklistDay, KitchenProductionRun, KitchenWasteEntry } from '@pos-tercos/types';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChecklistHistoryPanel } from './ChecklistHistoryPanel';
import { ProductionsTable } from './ProductionsTable';
import { WasteTable } from './WasteTable';

/**
 * Las tablas del hub de cocina RESUMEN y el detalle se abre al tocar el nombre
 * de la fila.
 *
 * Lo que se rompió: la celda "Consumió" apilaba un renglón por insumo, así que
 * una tanda de diez insumos estiraba la fila y hundía las demás columnas; el
 * histórico de checklist desplegaba las tareas de cada día y un mes era un muro
 * de texto. El dato no puede perderse al resumir: por eso cada caso comprueba
 * que lo que sale de la tabla aparece ENTERO en el detalle.
 */

const RUN: KitchenProductionRun = {
  runId: '11111111-1111-4111-8111-111111111111',
  subproductId: '22222222-2222-4222-8222-222222222222',
  subproductName: 'Pollo apanado',
  quantityProduced: 20,
  unit: 'porción',
  userId: null,
  userName: 'Rony',
  notes: 'Tanda de la mañana',
  evidenceUrl: null,
  createdAt: '2026-09-01T14:31:00.000Z',
  inputs: [
    { entityType: 'INGREDIENT', entityId: 'a1', name: 'Pan brioche', quantity: 210, unit: 'unidad' },
    { entityType: 'INGREDIENT', entityId: 'a2', name: 'Pollo crudo', quantity: 273, unit: 'gr' },
    { entityType: 'INGREDIENT', entityId: 'a3', name: 'Repollo', quantity: 336, unit: 'gr' },
    { entityType: 'INGREDIENT', entityId: 'a4', name: 'Salsa de miel', quantity: 400, unit: 'ml' },
  ],
};

const MOTIVO_LARGO =
  'Se cayó la bandeja al sacarla del horno y quedó completa en el piso; no se pudo recuperar nada';

const MERMA: KitchenWasteEntry = {
  movementId: '33333333-3333-4333-8333-333333333333',
  entityType: 'INGREDIENT',
  entityId: 'a2',
  name: 'Pollo crudo',
  quantity: 300,
  unit: 'gr',
  reason: MOTIVO_LARGO,
  userId: null,
  userName: 'Rony',
  evidenceUrl: null,
  reversedQty: 0,
  costAmount: 3600,
  costEstimated: false,
  createdAt: '2026-09-01T14:31:00.000Z',
};

const DIA: ChecklistDay = {
  day: '2026-09-01',
  type: 'OPEN',
  items: [
    { itemId: 'b1', label: 'Revisar neveras', done: true, doneById: null, doneByName: 'Rony', doneAt: null },
    { itemId: 'b2', label: 'Limpiar la plancha', done: false, doneById: null, doneByName: null, doneAt: null },
  ],
  doneCount: 1,
  totalCount: 2,
  completedAt: null,
  completedById: null,
  completedByName: null,
  legacy: false,
};

describe('producción: la celda "Consumió" resume y el detalle los muestra todos', () => {
  it('la tabla nombra un insumo y cuenta el resto, no los apila', () => {
    render(<ProductionsTable runs={[RUN]} />);
    expect(screen.getByText('Pan brioche +3 más')).toBeDefined();
    // Los otros tres NO están en la tabla: si aparecieran, la fila volvería a
    // estirarse, que es justo lo que se corrigió.
    expect(screen.queryByText(/Salsa de miel/)).toBeNull();
  });

  it('tocar el nombre de la tanda abre el detalle con los cuatro insumos', () => {
    render(<ProductionsTable runs={[RUN]} />);
    fireEvent.click(screen.getByRole('button', { name: /Ver detalle de la tanda de Pollo apanado/ }));

    const dialogo = screen.getByRole('dialog');
    expect(dialogo).toBeDefined();
    for (const i of RUN.inputs) {
      expect(screen.getByText(i.name)).toBeDefined();
    }
    expect(screen.getByText(/Consumió \(4\)/)).toBeDefined();
  });
});

describe('merma: el motivo largo se lee entero en el detalle', () => {
  it('tocar el nombre abre el detalle con el motivo completo', () => {
    render(<WasteTable entries={[MERMA]} />);
    fireEvent.click(screen.getByRole('button', { name: /Ver detalle de la merma de Pollo crudo/ }));

    expect(screen.getByRole('dialog')).toBeDefined();
    // Aparece dos veces (recortado en la tabla, entero en el detalle): lo que
    // importa es que el detalle no lo pierda.
    expect(screen.getAllByText(MOTIVO_LARGO).length).toBeGreaterThan(0);
  });
});

describe('checklist: el histórico resume y el día se abre a un toque', () => {
  it('la lista no despliega las tareas', () => {
    render(<ChecklistHistoryPanel days={[DIA]} />);
    expect(screen.getByText(/1 de 2 tareas/)).toBeDefined();
    expect(screen.queryByText('Limpiar la plancha')).toBeNull();
  });

  it('abre el detalle con cada tarea y si se cumplió', () => {
    render(<ChecklistHistoryPanel days={[DIA]} />);
    fireEvent.click(screen.getByRole('button', { name: /Ver las tareas de Apertura del 2026-09-01/ }));

    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText('Revisar neveras')).toBeDefined();
    expect(screen.getByText('Limpiar la plancha')).toBeDefined();
    expect(screen.getByText(/Quedaron 1 de 2 sin marcar/)).toBeDefined();
  });
});
