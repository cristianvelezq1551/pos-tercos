import { describe, expect, it } from 'vitest';
import type { AuditAction, AuditLogEntry } from '@pos-tercos/types';
import { BITACORA_GROUPS, describeEvent } from './events';

function entry(
  action: AuditAction,
  extra: Partial<Pick<AuditLogEntry, 'metadata' | 'afterJson'>> = {},
): AuditLogEntry {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    userId: null,
    action,
    entityType: null,
    entityId: null,
    beforeJson: null,
    afterJson: null,
    metadata: null,
    createdAt: '2026-08-24T12:00:00.000Z',
    ...extra,
  };
}

describe('bitácora · cocina', () => {
  it('el grupo Cocina incluye lo que hace el cocinero, no solo el histórico del KDS', () => {
    const cocina = BITACORA_GROUPS.find((g) => g.key === 'cocina');
    expect(cocina?.actions).toEqual(
      expect.arrayContaining([
        'SUBPRODUCT_PRODUCED',
        'INVENTORY_MOVEMENT_WASTE',
        'KITCHEN_CHECKLIST_COMPLETED',
        'KITCHEN_INCIDENT_LOGGED',
        'STOCK_COUNT_REGISTERED',
      ]),
    );
  });

  it('"Todo" no deja fuera ningún grupo', () => {
    const todo = new Set(BITACORA_GROUPS.find((g) => g.key === 'todo')?.actions ?? []);
    for (const group of BITACORA_GROUPS) {
      if (group.key === 'todo') continue;
      for (const action of group.actions) expect(todo.has(action)).toBe(true);
    }
  });

  it('ningún evento de cocina se muestra con el código crudo', () => {
    const cocina = BITACORA_GROUPS.find((g) => g.key === 'cocina')?.actions ?? [];
    for (const action of cocina) {
      expect(describeEvent(entry(action)).label).not.toBe(action);
    }
  });

  it('la producción dice qué y cuánto', () => {
    const d = describeEvent(
      entry('SUBPRODUCT_PRODUCED', {
        metadata: { subproductName: 'Salsa', quantityProduced: 20, unit: 'porción' },
      }),
    );
    expect(d.label).toBe('Produjo una tanda');
    expect(d.detail).toBe('Salsa: 20 porción');
  });

  it('la merma del cocinero muestra qué se tiró y por qué', () => {
    const d = describeEvent(
      entry('INVENTORY_MOVEMENT_WASTE', {
        metadata: { name: 'Carne', quantity: 200, unit: 'g', reason: 'se quemó' },
      }),
    );
    expect(d.detail).toBe('Carne: 200 g · se quemó');
    expect(d.tone).toBe('warning');
  });

  it('la merma del admin trae el detalle en afterJson y también se lee', () => {
    // El controller de inventario audita en `after`, no en `metadata`: si la
    // bitácora mirara solo uno, media cocina saldría sin detalle.
    const d = describeEvent(
      entry('INVENTORY_MOVEMENT_WASTE', {
        afterJson: { delta: -5, notes: 'vencido' },
      }),
    );
    expect(d.detail).toContain('vencido');
  });

  it('distingue cerrar apertura de cerrar cierre', () => {
    expect(describeEvent(entry('KITCHEN_CHECKLIST_COMPLETED', { metadata: { type: 'CLOSE' } })).label).toBe(
      'Cerró la rutina de cierre',
    );
    expect(describeEvent(entry('KITCHEN_CHECKLIST_COMPLETED', { metadata: { type: 'OPEN' } })).label).toBe(
      'Cerró la rutina de apertura',
    );
  });
});
