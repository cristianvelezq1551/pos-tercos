import { describe, expect, it } from 'vitest';
import {
  decimalANumero,
  normalizarDecimal,
  textoDeDecimal,
  textoRepresenta,
} from './decimal-input';

describe('normalizarDecimal', () => {
  it('acepta la COMA como separador: es la del teclado en español', () => {
    // El bug que reportó el dueño: "6,17" se convertía en 617.
    expect(normalizarDecimal('6,17')).toBe('6.17');
  });

  it('acepta el punto igual', () => {
    expect(normalizarDecimal('6.17')).toBe('6.17');
  });

  it('deja escribir el separador suelto, sin cerrar el número', () => {
    // Tecleando "6.17" se pasa por "6." — si eso se descartara, nunca se
    // llegaría a los decimales.
    expect(normalizarDecimal('6.')).toBe('6.');
    expect(normalizarDecimal('6,')).toBe('6.');
  });

  it('un segundo separador se ignora sin borrar lo escrito', () => {
    expect(normalizarDecimal('6.1.7')).toBe('6.17');
  });

  it('descarta letras y signos', () => {
    expect(normalizarDecimal('6a,1b7')).toBe('6.17');
    expect(normalizarDecimal('-6')).toBe('6');
  });

  it('vacío sigue vacío', () => {
    expect(normalizarDecimal('')).toBe('');
  });

  it('corta los decimales que sobran en vez de redondear al vuelo', () => {
    // Redondeando, quien escribe "1,559" ve saltar el campo a "1,56" sin
    // entender por qué. Cortando, el tercer decimal simplemente no entra.
    expect(normalizarDecimal('1.559', 2)).toBe('1.55');
    expect(normalizarDecimal('6.17', 4)).toBe('6.17');
  });

  it('sin tope no corta nada', () => {
    expect(normalizarDecimal('1.55555')).toBe('1.55555');
  });
});

describe('decimalANumero', () => {
  it('convierte lo tecleado', () => {
    expect(decimalANumero('6.17')).toBe(6.17);
  });

  it('los estados a medias valen 0 o el entero, nunca NaN', () => {
    expect(decimalANumero('')).toBe(0);
    expect(decimalANumero('6.')).toBe(6);
    expect(decimalANumero('.')).toBe(0);
  });
});

describe('textoRepresenta', () => {
  it('reconoce que "6." ya es 6: no hay que pisarlo mientras se escribe', () => {
    expect(textoRepresenta('6.', 6)).toBe(true);
    expect(textoRepresenta('6.17', 6.17)).toBe(true);
  });

  it('un valor distinto sí se pisa', () => {
    expect(textoRepresenta('6.17', 8)).toBe(false);
  });

  it('vacío representa a null (campo sin dato)', () => {
    expect(textoRepresenta('', null)).toBe(true);
    expect(textoRepresenta('6', null)).toBe(false);
  });
});

describe('textoDeDecimal', () => {
  it('el cero y el vacío se muestran vacíos para poder escribir directo', () => {
    expect(textoDeDecimal(0)).toBe('');
    expect(textoDeDecimal(null)).toBe('');
  });

  it('cualquier otro valor se muestra tal cual', () => {
    expect(textoDeDecimal(6.17)).toBe('6.17');
    expect(textoDeDecimal(12)).toBe('12');
  });
});
