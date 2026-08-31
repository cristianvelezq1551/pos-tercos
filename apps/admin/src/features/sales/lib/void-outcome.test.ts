import { describe, expect, it } from 'vitest';
import { VOID_OUTCOMES, endpointForOutcome, outcomeVerb } from './void-outcome';

/**
 * El agujero que esto cierra: hasta ahora, devolver la plata de una venta de
 * MOSTRADOR solo se podía hacer anulando, y anular devuelve el inventario. Si
 * la comida ya se había preparado, el costo desaparecía de los libros: el
 * negocio perdía la plata y la comida, y el margen se veía mejor de lo que era.
 */
describe('desenlace de una anulación', () => {
  it('si la comida NO salió, se anula (vuelve el inventario)', () => {
    expect(endpointForOutcome('no-salio')).toBe('void');
  });

  it('si la comida SÍ salió, se reembolsa (el inventario NO vuelve)', () => {
    expect(endpointForOutcome('si-salio')).toBe('refund');
  });

  it('las dos opciones dicen su consecuencia, no solo su nombre', () => {
    for (const o of VOID_OUTCOMES) {
      expect(o.consequence.length, o.value).toBeGreaterThan(30);
      expect(o.consequence.toLowerCase(), o.value).toContain('inventario');
    }
  });

  it('el botón nombra lo que va a pasar, no un genérico', () => {
    expect(outcomeVerb('si-salio').action).toBe('Devolver la plata');
    expect(outcomeVerb('no-salio').action).toBe('Anular venta');
  });
});
