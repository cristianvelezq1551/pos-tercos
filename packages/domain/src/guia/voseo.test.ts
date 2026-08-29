import { describe, expect, it } from 'vitest';
import { palabrasVoseo, tieneVoseo } from './voseo';

describe('tieneVoseo', () => {
  it('detecta las formas que de verdad aparecieron en una respuesta del asistente', () => {
    const real =
      'Escribís el nombre, marcás Mensual, elegís la categoría, ponés la fecha y guardás.';
    expect(palabrasVoseo(real)).toEqual(
      expect.arrayContaining(['escribís', 'marcás', 'elegís', 'ponés', 'guardás']),
    );
  });

  it('NO marca el FUTURO en tuteo, que también termina en -ás', () => {
    // Falso positivo de fondo: "marcarás" conserva el infinitivo, "marcás" no.
    const futuro = 'Lo marcarás pagado, podrás editarlo y tendrás el comprobante.';
    expect(palabrasVoseo(futuro)).toEqual([]);
    expect(tieneVoseo(futuro)).toBe(false);
  });

  it('sigue detectando voseo de verbos cuya raíz termina en r', () => {
    // La regla simple "si la raíz acaba en r es futuro" habría dejado pasar
    // estos dos, que son de los más frecuentes en un instructivo.
    expect(palabrasVoseo('Entrás al menú y cerrás la caja.')).toEqual(
      expect.arrayContaining(['entrás', 'cerrás']),
    );
  });

  it('NO marca "estás", que es tuteo irregular', () => {
    // Caso real: se marcó "selecciona los días que estás pagando", que es correcto.
    expect(tieneVoseo('Selecciona los días que estás pagando.')).toBe(false);
  });

  it('NO marca sustantivos ni adverbios con la misma terminación', () => {
    const bueno = 'Después de cerrar, revisa si hay más movimientos. El país, el interés, el maíz.';
    expect(palabrasVoseo(bueno)).toEqual([]);
  });

  it('acepta el tuteo correcto que sí queremos', () => {
    const tuteo = 'Escribe el nombre, marca Mensual, elige la categoría, guarda y avísale al dueño.';
    expect(tieneVoseo(tuteo)).toBe(false);
  });

  it('distingue las dos formas en la misma frase', () => {
    expect(palabrasVoseo('Cuando lo guardarás no importa, pero guardás mal.')).toEqual(['guardás']);
  });
});
