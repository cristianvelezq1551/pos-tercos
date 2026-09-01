import { describe, expect, it } from 'vitest';
import { filtrarPorTexto, matchesQuery, normalizeForSearch, squashForSearch } from './buscar';

describe('normalizeForSearch', () => {
  it('baja a minúsculas, quita tildes y colapsa espacios', () => {
    expect(normalizeForSearch('  Piña   COLADA ')).toBe('pina colada');
  });
});

describe('squashForSearch', () => {
  it('elimina separadores', () => {
    expect(squashForSearch('Coca-Cola 400')).toBe('cocacola400');
  });
});

describe('matchesQuery', () => {
  it('sin texto tecleado, todo coincide', () => {
    expect(matchesQuery('Pan brioche', '   ')).toBe(true);
  });

  it('encuentra sin tildes ni mayúsculas', () => {
    expect(matchesQuery('Piña en almíbar', 'pina')).toBe(true);
  });

  it('exige TODOS los términos: "coca 400" no trae toda la gaseosa', () => {
    expect(matchesQuery('Coca-Cola 400 ml', 'coca 400')).toBe(true);
    expect(matchesQuery('Coca-Cola 1.5 L', 'coca 400')).toBe(false);
  });

  it('ignora los separadores del nombre', () => {
    expect(matchesQuery('Coca-Cola', 'cocacola')).toBe(true);
  });
});

describe('filtrarPorTexto', () => {
  const filas = [{ name: 'Tomate' }, { name: 'Pan brioche' }, { name: 'Papa criolla' }];

  it('devuelve la lista intacta cuando no hay búsqueda', () => {
    expect(filtrarPorTexto(filas, '', (f) => f.name)).toBe(filas);
  });

  it('filtra por lo tecleado', () => {
    expect(filtrarPorTexto(filas, 'pa', (f) => f.name).map((f) => f.name)).toEqual([
      'Pan brioche',
      'Papa criolla',
    ]);
  });

  // Reordenar mientras se escribe hace saltar de lugar la fila que se mira.
  it('conserva el orden que traía la lista', () => {
    expect(filtrarPorTexto(filas, 'a', (f) => f.name).map((f) => f.name)).toEqual([
      'Tomate',
      'Pan brioche',
      'Papa criolla',
    ]);
  });
});
