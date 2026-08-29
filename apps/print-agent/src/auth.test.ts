import { describe, expect, it } from 'vitest';
import { allowedOrigins, isDangerouslyExposed, originOk, resolveHost, secretOk } from './auth';

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

/**
 * La barrera de ORIGEN es lo único que separa la página de la caja de una
 * página cualquiera: el navegador del mostrador llama al agent SIN credencial
 * (el secreto no puede viajar en el bundle), así que sin esto cualquier web que
 * abra el cajero abría el cajón monedero.
 *
 * La mitad de estos casos son de SEGURIDAD y la otra mitad de NO ROMPER lo que
 * ya funciona — las dos importan igual: si el mostrador deja de imprimir, el
 * arreglo se revierte y el agujero vuelve.
 */
describe('originOk — quién puede imprimir y abrir el cajón', () => {
  const permitidos = allowedOrigins({} as NodeJS.ProcessEnv);

  // ── Lo que HOY funciona y tiene que seguir funcionando ──────────────
  it('la caja en producción imprime', () => {
    expect(originOk('https://admin.tercos.co', permitidos)).toBe(true);
  });

  it('el despliegue de QA en Vercel imprime', () => {
    expect(
      originOk(
        'https://pos-tercos-admin-git-main-cristianvelezq1551s-projects.vercel.app',
        permitidos,
      ),
    ).toBe(true);
  });

  it('desarrollo en localhost imprime, en cualquier puerto', () => {
    for (const o of [
      'http://localhost:3004',
      'http://localhost:3104',
      'http://127.0.0.1:3004',
      'https://localhost:3004',
    ]) {
      expect(originOk(o, permitidos)).toBe(true);
    }
  });

  it('SIN cabecera Origin pasa: es la API (adapter escpos), no un navegador', () => {
    // Una página web NO puede omitir Origin en un POST, así que permitir la
    // ausencia no abre nada — y romperlo dejaría al backend sin abrir el cajón.
    expect(originOk(undefined, permitidos)).toBe(true);
    expect(originOk('', permitidos)).toBe(true);
  });

  it('una barra final o mayúsculas en la config no dejan sin imprimir', () => {
    const conRuido = allowedOrigins({
      PRINT_AGENT_ALLOWED_ORIGINS: ' https://Caja.Tercos.CO/ ,, ',
    } as NodeJS.ProcessEnv);
    expect(originOk('https://caja.tercos.co', conRuido)).toBe(true);
  });

  it('PRINT_AGENT_ALLOWED_ORIGINS SUMA, nunca reemplaza a los del negocio', () => {
    // Si reemplazara, una variable mal escrita dejaría al mostrador sin imprimir.
    const extra = allowedOrigins({
      PRINT_AGENT_ALLOWED_ORIGINS: 'https://otra.tercos.co',
    } as NodeJS.ProcessEnv);
    expect(originOk('https://admin.tercos.co', extra)).toBe(true);
    expect(originOk('https://otra.tercos.co', extra)).toBe(true);
  });

  // ── Lo que tiene que quedar afuera ──────────────────────────────────
  it('una página cualquiera NO abre el cajón', () => {
    expect(originOk('https://evil.com', permitidos)).toBe(false);
    expect(originOk('http://evil.com', permitidos)).toBe(false);
  });

  it('no alcanza con que el dominio del negocio aparezca en el origen', () => {
    for (const o of [
      'https://admin.tercos.co.evil.com',
      'https://evil.com/?x=https://admin.tercos.co',
      'https://adminxtercos.co',
      'http://admin.tercos.co',
    ]) {
      expect(originOk(o, permitidos)).toBe(false);
    }
  });

  it('`Origin: null` (iframe aislado, data:) no pasa', () => {
    expect(originOk('null', permitidos)).toBe(false);
  });

  it('un host que solo EMPIEZA con localhost no pasa', () => {
    expect(originOk('http://localhost.evil.com', permitidos)).toBe(false);
    expect(originOk('http://127.0.0.1.evil.com', permitidos)).toBe(false);
  });

  it('un esquema raro no pasa aunque el host sea local', () => {
    expect(originOk('file://localhost', permitidos)).toBe(false);
  });

  it('con el header repetido manda el primero', () => {
    expect(originOk(['https://evil.com', 'https://admin.tercos.co'], permitidos)).toBe(false);
  });
});
