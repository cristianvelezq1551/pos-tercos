import { describe, expect, it } from 'vitest';
import { mensajeDeError } from './error-message';

describe('mensajeDeError', () => {
  describe('lo que NO debe llegar nunca a la pantalla', () => {
    it.each([
      ['excepción del framework', 'ThrottlerException: Too Many Requests'],
      ['excepción de JS', "TypeError: Cannot read properties of undefined (reading 'id')"],
      ['rastro de stack', 'Error: boom\n    at Object.<anonymous> (/app/main.js:1:1)'],
      ['código de Prisma', 'Invalid `prisma.sale.create()`: P2002 unique constraint'],
      ['validación en inglés', 'Validation failed'],
      ['error genérico de Nest', 'Internal server error'],
      ['JSON crudo de la API', '{"statusCode":500,"message":"x"}'],
      ['error de socket', 'connect ECONNREFUSED 127.0.0.1:3001'],
    ])('reemplaza %s', (_caso, crudo) => {
      const salida = mensajeDeError(new Error(crudo));
      expect(salida).not.toBe(crudo);
      expect(salida).not.toMatch(/Exception|ECONNREFUSED|statusCode|P2002|at Object/);
      // Y lo que sale es una frase, no un código.
      expect(salida.length).toBeGreaterThan(15);
    });
  });

  describe('lo que SÍ debe pasar tal cual', () => {
    it.each([
      'No tenés un turno abierto. Abrí turno antes de vender.',
      'La caja de hoy ya fue cerrada. No se abre una segunda el mismo día.',
      'Asigná el costo del envío antes de cobrar el domicilio.',
      'El medio de pago RAPPI no está habilitado. Configuralo en el admin.',
      'Falta el celular.',
    ])('deja pasar el mensaje del negocio: %s', (mensaje) => {
      expect(mensajeDeError(new Error(mensaje))).toBe(mensaje);
    });
  });

  describe('sin conexión', () => {
    it.each(['Failed to fetch', 'NetworkError when attempting to fetch resource', 'Load failed'])(
      'detecta %s',
      (crudo) => {
        expect(mensajeDeError(new Error(crudo))).toMatch(/Sin conexión/i);
      },
    );
  });

  describe('por código HTTP', () => {
    it.each([
      [401, /sesión venció/i],
      [403, /permiso/i],
      [404, /no encontramos/i],
      [409, /recargá/i],
      [429, /demasiados intentos/i],
      [500, /problema/i],
      [502, /problema/i],
    ])('%s da un mensaje entendible', (status, esperado) => {
      expect(mensajeDeError(new Error('Internal server error'), { status })).toMatch(esperado);
    });

    it('toma el status del propio error si lo trae', () => {
      const err = Object.assign(new Error('Forbidden'), { status: 403 });
      expect(mensajeDeError(err)).toMatch(/permiso/i);
    });
  });

  describe('entradas raras', () => {
    it.each([
      ['null', null],
      ['undefined', undefined],
      ['objeto vacío', {}],
      ['string vacío', ''],
      ['número', 42],
    ])('nunca devuelve vacío con %s', (_caso, entrada) => {
      const salida = mensajeDeError(entrada);
      expect(salida.length).toBeGreaterThan(10);
    });

    it('respeta el fallback del caller', () => {
      expect(mensajeDeError(null, { fallback: 'No se pudo imprimir el recibo.' })).toBe(
        'No se pudo imprimir el recibo.',
      );
    });

    it('acepta un string suelto como error', () => {
      expect(mensajeDeError('El PIN no coincide.')).toBe('El PIN no coincide.');
    });
  });
});
