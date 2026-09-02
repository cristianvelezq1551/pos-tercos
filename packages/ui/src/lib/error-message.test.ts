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
      'No tienes un turno abierto. Abre turno antes de vender.',
      'La caja de hoy ya fue cerrada. No se abre una segunda el mismo día.',
      'Asigna el costo del envío antes de cobrar el domicilio.',
      'El medio de pago RAPPI no está habilitado. Configúralo en el admin.',
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
      [409, /recarga/i],
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

  it('no muestra el "API 500" del fallback de ApiError', () => {
    // ApiError arma `API ${status}` cuando el backend no manda mensaje; sin
    // esta regla la pantalla decía "No se pudieron cargar las sugerencias.
    // API 500" — código HTTP a la vista.
    expect(mensajeDeError(new Error('API 500'), { status: 500 })).not.toContain('API 500');
    expect(mensajeDeError(new Error('API 404'), { status: 404 })).toBe(
      'No encontramos lo que buscabas.',
    );
  });
});

describe('el archivo que no pasó por el proxy', () => {
  // Lo que el dueño vio en pantalla al subir una factura pesada. Ninguno de los
  // tres le dice qué hacer, y el 413 SÍ se resuelve desde la pantalla.
  it.each([
    'Request Entity Too Large',
    'FUNCTION_PAYLOAD_TOO_LARGE',
    'Request failed (413)',
  ])('traduce %s', (crudo) => {
    const m = mensajeDeError(new Error(crudo));
    expect(m).toContain('demasiado grande');
    expect(m).not.toContain('413');
  });

  it('también cuando llega solo el código de estado', () => {
    expect(mensajeDeError(new Error(''), { status: 413 })).toContain('demasiado grande');
  });
});
