import { describe, expect, it } from 'vitest';
import { isDangerouslyExposed, resolveHost, secretOk } from './auth';

/**
 * Este archivo decide quién puede abrir el CAJÓN MONEDERO. Mutantes que estos
 * tests matan:
 * - `secretOk` devolviendo true con secret mal → cualquier página web que
 *   visite el operador imprime y abre el cajón.
 * - la regla fail-safe invertida: sin secret escuchando en 0.0.0.0 → cualquier
 *   dispositivo de la LAN abre el cajón sin credencial ninguna.
 * - comparar con `===` → fuga por timing sobre la LAN.
 */

const SECRET = 's3cr3t-largo-y-aleatorio';

describe('secretOk — auth del agent', () => {
  it('acepta el secret exacto', () => {
    expect(secretOk(SECRET, SECRET)).toBe(true);
  });

  it('rechaza un secret equivocado de la misma longitud', () => {
    const wrong = 'X'.repeat(SECRET.length);
    expect(wrong).toHaveLength(SECRET.length);
    expect(secretOk(wrong, SECRET)).toBe(false);
  });

  it('rechaza un prefijo válido (no alcanza con acertar el principio)', () => {
    expect(secretOk(SECRET.slice(0, -1), SECRET)).toBe(false);
  });

  it('rechaza el secret con basura pegada al final', () => {
    expect(secretOk(`${SECRET}x`, SECRET)).toBe(false);
  });

  it('rechaza cuando NO viene el header', () => {
    expect(secretOk(undefined, SECRET)).toBe(false);
    expect(secretOk('', SECRET)).toBe(false);
  });

  it('con header repetido usa el primer valor', () => {
    expect(secretOk([SECRET, 'otro'], SECRET)).toBe(true);
    expect(secretOk(['otro', SECRET], SECRET)).toBe(false);
  });

  it('no explota comparando longitudes distintas (timingSafeEqual lanzaría)', () => {
    expect(() => secretOk('corto', SECRET)).not.toThrow();
    expect(secretOk('corto', SECRET)).toBe(false);
    expect(secretOk('x'.repeat(500), SECRET)).toBe(false);
  });

  it('sin secret configurado la auth queda apagada (la protege el HOST loopback)', () => {
    expect(secretOk(undefined, null)).toBe(true);
    expect(secretOk('lo que sea', null)).toBe(true);
  });

  it('distingue secretos que solo difieren en un byte del medio', () => {
    const almost = `${SECRET.slice(0, 5)}X${SECRET.slice(6)}`;
    expect(almost).toHaveLength(SECRET.length);
    expect(secretOk(almost, SECRET)).toBe(false);
  });
});

describe('resolveHost — regla fail-safe de exposición', () => {
  it('SIN secret escucha solo en loopback (nadie de la LAN alcanza el cajón)', () => {
    expect(resolveHost(null)).toBe('127.0.0.1');
  });

  it('CON secret escucha en toda la red (agent en la Pi sirviendo tablets)', () => {
    expect(resolveHost(SECRET)).toBe('0.0.0.0');
  });

  it('PRINT_AGENT_HOST explícito manda sobre la regla', () => {
    expect(resolveHost(null, '192.168.1.50')).toBe('192.168.1.50');
    expect(resolveHost(SECRET, '127.0.0.1')).toBe('127.0.0.1');
  });

  it('un PRINT_AGENT_HOST vacío no cuenta como explícito (cae a la regla segura)', () => {
    expect(resolveHost(null, '')).toBe('127.0.0.1');
  });
});

describe('isDangerouslyExposed — el aviso de arranque', () => {
  it('marca la combinación peligrosa: red abierta y sin secret', () => {
    expect(isDangerouslyExposed(null, '0.0.0.0')).toBe(true);
    expect(isDangerouslyExposed(null, '192.168.1.50')).toBe(true);
  });

  it('no marca loopback sin secret (es el default seguro)', () => {
    expect(isDangerouslyExposed(null, '127.0.0.1')).toBe(false);
    expect(isDangerouslyExposed(null, 'localhost')).toBe(false);
  });

  it('no marca red abierta CON secret (cada request se autentica)', () => {
    expect(isDangerouslyExposed(SECRET, '0.0.0.0')).toBe(false);
  });

  it('la config por defecto nunca es peligrosa, haya o no secret', () => {
    for (const secret of [null, SECRET]) {
      expect(isDangerouslyExposed(secret, resolveHost(secret))).toBe(false);
    }
  });
});
