import { describe, expect, it } from 'vitest';
import { extractJsonObject } from './extract-json-object';

/**
 * El análisis financiero se cayó con un 500 en la auditoría de QA local porque
 * el modelo devolvió el JSON con texto alrededor. Un 500 abre un Issue de
 * alerta al dueño por algo que no es un error del sistema: la respuesta del
 * modelo hay que leerla con tolerancia, y su ausencia declararla sin drama.
 */
describe('extractJsonObject', () => {
  const obj = { tono: 'saludable', titular: 'Ganaste $1.000', bullets: [] };
  const json = JSON.stringify(obj);

  it('lee JSON puro', () => {
    expect(extractJsonObject(json)).toEqual(obj);
  });

  it('tolera cercas de código y una frase antes o después', () => {
    expect(extractJsonObject('```json\n' + json + '\n```')).toEqual(obj);
    expect(extractJsonObject('Aquí tienes el análisis:\n' + json + '\nEspero que sirva.')).toEqual(obj);
  });

  it('tolera llaves dentro de los textos', () => {
    const conLlaves = { titular: 'Neto {positivo}', bullets: [{ texto: 'a}b' }] };
    expect(extractJsonObject('x ' + JSON.stringify(conLlaves) + ' y')).toEqual(conLlaves);
  });

  it('una respuesta truncada por el tope de tokens NO se da por buena', () => {
    expect(extractJsonObject(json.slice(0, -8))).toBeNull();
  });

  it('sin objeto devuelve null, no lanza', () => {
    expect(extractJsonObject('')).toBeNull();
    expect(extractJsonObject('No puedo analizar esto.')).toBeNull();
    expect(extractJsonObject('[1,2,3]')).toBeNull();
  });
});
