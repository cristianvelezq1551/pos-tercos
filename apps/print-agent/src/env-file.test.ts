import { describe, expect, it } from 'vitest';
import { applyEnvPairs, parseEnvFile } from './env-file';

/**
 * Si este parser falla, el agent arranca sin PRINTER_NAME y el cajero ve
 * "impreso OK" sin que salga nada. El .env lo edita el dueño a mano en Windows
 * (Notepad), así que tiene que aguantar CRLF, comillas y espacios.
 */

describe('parseEnvFile', () => {
  it('lee pares simples', () => {
    expect(parseEnvFile('PRINTER_NAME=EPSON TM-T20III\nPRINT_AGENT_PORT=9120')).toEqual([
      ['PRINTER_NAME', 'EPSON TM-T20III'],
      ['PRINT_AGENT_PORT', '9120'],
    ]);
  });

  it('soporta finales de línea de Windows (CRLF)', () => {
    expect(parseEnvFile('A=1\r\nB=2\r\n')).toEqual([
      ['A', '1'],
      ['B', '2'],
    ]);
  });

  it('saca las comillas del valor', () => {
    expect(parseEnvFile('A="con espacios"\nB=\'simple\'')).toEqual([
      ['A', 'con espacios'],
      ['B', 'simple'],
    ]);
  });

  it('recorta espacios alrededor del valor y de la clave', () => {
    expect(parseEnvFile('  PRINTER_NAME  =  EPSON  ')).toEqual([['PRINTER_NAME', 'EPSON']]);
  });

  it('ignora comentarios, incluso indentados', () => {
    expect(parseEnvFile('# comentario\n   # otro\nA=1')).toEqual([['A', '1']]);
  });

  it('ignora líneas vacías y basura sin `=`', () => {
    expect(parseEnvFile('\n\nesto no es una variable\nA=1\n')).toEqual([['A', '1']]);
  });

  it('acepta un valor vacío (borrar un valor sin borrar la línea)', () => {
    expect(parseEnvFile('PRINTER_NAME=')).toEqual([['PRINTER_NAME', '']]);
  });

  it('conserva el `=` que venga DENTRO del valor (secrets en base64)', () => {
    expect(parseEnvFile('PRINT_AGENT_SECRET=abc==')).toEqual([
      ['PRINT_AGENT_SECRET', 'abc=='],
    ]);
  });

  it('rechaza claves que no son identificadores válidos', () => {
    expect(parseEnvFile('9INVALIDA=1\nMI-VAR=2\nVALIDA_1=3')).toEqual([['VALIDA_1', '3']]);
  });

  it('un archivo vacío no rompe nada', () => {
    expect(parseEnvFile('')).toEqual([]);
  });
});

describe('applyEnvPairs', () => {
  it('define las variables que faltaban', () => {
    const env = {} as NodeJS.ProcessEnv;
    applyEnvPairs([['PRINTER_NAME', 'EPSON']], env);
    expect(env.PRINTER_NAME).toBe('EPSON');
  });

  it('NO pisa lo que ya venía del sistema (el servicio de Windows gana)', () => {
    const env = { PRINTER_NAME: 'del servicio' } as NodeJS.ProcessEnv;
    applyEnvPairs([['PRINTER_NAME', 'del archivo']], env);
    expect(env.PRINTER_NAME).toBe('del servicio');
  });

  it('una variable definida como cadena vacía cuenta como definida', () => {
    const env = { PRINTER_NAME: '' } as NodeJS.ProcessEnv;
    applyEnvPairs([['PRINTER_NAME', 'del archivo']], env);
    expect(env.PRINTER_NAME).toBe('');
  });

  it('con claves repetidas gana la primera del archivo', () => {
    const env = {} as NodeJS.ProcessEnv;
    applyEnvPairs(
      [
        ['A', 'primera'],
        ['A', 'segunda'],
      ],
      env,
    );
    expect(env.A).toBe('primera');
  });
});
