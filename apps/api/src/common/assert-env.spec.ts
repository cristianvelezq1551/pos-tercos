import { assertRequiredEnv, isProd } from './assert-env';

/**
 * Cada rama de este archivo es un invariante de PRODUCCIÓN: si se rompe, la API
 * arranca en silencio con CORS abierto, cookies sin Secure, storage efímero o
 * el cajón monedero expuesto. Los tests fijan ese contrato.
 */

const LONG_SECRET = 'x'.repeat(40);
const LOCAL_DB = 'postgresql://u:p@localhost:5432/db';
const REMOTE_DB = 'postgresql://u:p@db.railway.internal:5432/db?connection_limit=15';

/** Base mínima válida de producción; cada test la muta para probar UNA cosa. */
function prodEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    NODE_ENV: 'production',
    DATABASE_URL: REMOTE_DB,
    JWT_ACCESS_SECRET: LONG_SECRET,
    WEB_ORDER_TOKEN_SECRET: LONG_SECRET,
    CORS_ORIGINS: 'https://tercos.co',
    STORAGE_PROVIDER: 'r2',
    TRUST_PROXY_HOPS: '2',
    ...overrides,
  };
}

describe('assert-env', () => {
  const original = process.env;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    process.env = {} as NodeJS.ProcessEnv;
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = original;
    warn.mockRestore();
  });

  /** Reemplaza el entorno completo (no hereda nada del proceso real). */
  function setEnv(env: Record<string, string | undefined>) {
    process.env = {} as NodeJS.ProcessEnv;
    for (const [k, v] of Object.entries(env)) {
      if (v !== undefined) process.env[k] = v;
    }
  }

  describe('isProd — fuente única del flag', () => {
    it('APP_ENV tiene prioridad sobre NODE_ENV', () => {
      setEnv({ NODE_ENV: 'development', APP_ENV: 'production' });
      expect(isProd()).toBe(true);
      setEnv({ NODE_ENV: 'production', APP_ENV: 'qa' });
      expect(isProd()).toBe(false);
    });

    it('sin ninguna de las dos, no es producción', () => {
      setEnv({});
      expect(isProd()).toBe(false);
    });
  });

  describe('entorno declarado', () => {
    it('mata el boot con un valor desconocido (typo tipo "Production")', () => {
      setEnv({ NODE_ENV: 'Production', DATABASE_URL: LOCAL_DB, JWT_ACCESS_SECRET: 'dev' });
      expect(() => assertRequiredEnv()).toThrow(/no es un valor conocido/);
    });

    it.each(['development', 'test', 'qa'])('acepta el entorno conocido %s', (env) => {
      setEnv({ NODE_ENV: env, DATABASE_URL: LOCAL_DB, JWT_ACCESS_SECRET: 'dev' });
      expect(() => assertRequiredEnv()).not.toThrow();
    });

    it('sin entorno declarado, deja pasar solo si la DB es local (máquina de dev)', () => {
      setEnv({ DATABASE_URL: LOCAL_DB, JWT_ACCESS_SECRET: 'dev' });
      expect(() => assertRequiredEnv()).not.toThrow();
    });

    it('sin entorno declarado y DB remota, mata el boot (deploy mal configurado)', () => {
      setEnv({ DATABASE_URL: REMOTE_DB, JWT_ACCESS_SECRET: LONG_SECRET });
      expect(() => assertRequiredEnv()).toThrow(/apunta a un host remoto/);
    });
  });

  describe('variables requeridas', () => {
    it('exige DATABASE_URL y JWT_ACCESS_SECRET en cualquier entorno', () => {
      setEnv({ NODE_ENV: 'development', DATABASE_URL: LOCAL_DB });
      expect(() => assertRequiredEnv()).toThrow(/JWT_ACCESS_SECRET/);
    });

    it('NO exige JWT_REFRESH_SECRET (los refresh tokens son opacos, no JWT)', () => {
      setEnv({ NODE_ENV: 'development', DATABASE_URL: LOCAL_DB, JWT_ACCESS_SECRET: 'dev' });
      expect(() => assertRequiredEnv()).not.toThrow();
    });

    it.each(['WEB_ORDER_TOKEN_SECRET', 'CORS_ORIGINS', 'STORAGE_PROVIDER'])(
      'en prod exige %s',
      (key) => {
        setEnv(prodEnv({ [key]: undefined }));
        expect(() => assertRequiredEnv()).toThrow(new RegExp(key));
      },
    );

    it('lista TODAS las faltantes de una vez (no una por deploy fallido)', () => {
      setEnv(prodEnv({ CORS_ORIGINS: undefined, STORAGE_PROVIDER: undefined }));
      expect(() => assertRequiredEnv()).toThrow(/CORS_ORIGINS, STORAGE_PROVIDER/);
    });

    it('una base de prod completa arranca', () => {
      setEnv(prodEnv());
      expect(() => assertRequiredEnv()).not.toThrow();
    });
  });

  describe('selectores de adapter — un typo no puede caer al default', () => {
    it.each([
      ['STORAGE_PROVIDER', 'cloudflare'],
      ['STORAGE_PROVIDER', 'R2'],
      ['PRINTER_PROVIDER', 'epson'],
    ])('%s="%s" mata el boot', (key, value) => {
      setEnv({
        NODE_ENV: 'development',
        DATABASE_URL: LOCAL_DB,
        JWT_ACCESS_SECRET: 'dev',
        [key]: value,
      });
      expect(() => assertRequiredEnv()).toThrow(/no es un valor válido/);
    });

    it('se valida también en dev (no solo en prod)', () => {
      setEnv({
        DATABASE_URL: LOCAL_DB,
        JWT_ACCESS_SECRET: 'dev',
        STORAGE_PROVIDER: 'r2 ',
      });
      expect(() => assertRequiredEnv()).toThrow(/no es un valor válido/);
    });
  });

  describe('piso de entropía de secretos en prod', () => {
    it('rechaza un secret corto', () => {
      setEnv(prodEnv({ JWT_ACCESS_SECRET: 'secret' }));
      expect(() => assertRequiredEnv()).toThrow(/demasiado cortos/);
    });

    it('nombra todos los secretos débiles a la vez', () => {
      setEnv(prodEnv({ JWT_ACCESS_SECRET: 'corto', WEB_ORDER_TOKEN_SECRET: 'corto' }));
      expect(() => assertRequiredEnv()).toThrow(/JWT_ACCESS_SECRET, WEB_ORDER_TOKEN_SECRET/);
    });

    it('en dev NO aplica el piso (los secrets de desarrollo son cortos a propósito)', () => {
      setEnv({ NODE_ENV: 'development', DATABASE_URL: LOCAL_DB, JWT_ACCESS_SECRET: 'dev' });
      expect(() => assertRequiredEnv()).not.toThrow();
    });

    it('acepta exactamente 32 caracteres (el límite es inclusivo)', () => {
      setEnv(prodEnv({ JWT_ACCESS_SECRET: 'y'.repeat(32) }));
      expect(() => assertRequiredEnv()).not.toThrow();
    });
  });

  describe('storage local en prod', () => {
    it('mata el boot (filesystem efímero = fotos perdidas en cada redeploy)', () => {
      setEnv(prodEnv({ STORAGE_PROVIDER: 'local' }));
      expect(() => assertRequiredEnv()).toThrow(/pierde las fotos/);
    });

    it('se permite solo con la excepción explícita ALLOW_LOCAL_STORAGE=1', () => {
      setEnv(prodEnv({ STORAGE_PROVIDER: 'local', ALLOW_LOCAL_STORAGE: '1' }));
      expect(() => assertRequiredEnv()).not.toThrow();
    });
  });

  describe('WhatsApp obligatorio', () => {
    it('WHATSAPP_REQUIRED=true sin proveedor mata el boot', () => {
      setEnv(prodEnv({ WHATSAPP_REQUIRED: 'true' }));
      expect(() => assertRequiredEnv()).toThrow(/no hay proveedor configurado/);
    });

    it('con KAPSO_API_KEY arranca', () => {
      setEnv(prodEnv({ WHATSAPP_REQUIRED: 'true', KAPSO_API_KEY: 'k' }));
      expect(() => assertRequiredEnv()).not.toThrow();
    });

    it('sin el flag, la ausencia de proveedor es solo un warning', () => {
      setEnv(prodEnv());
      expect(() => assertRequiredEnv()).not.toThrow();
      expect(warn.mock.calls.flat().join(' ')).toMatch(/KAPSO_API_KEY/);
    });
  });

  describe('TRUST_PROXY_HOPS — anti fuerza bruta por IP', () => {
    it.each([
      ['ausente', undefined],
      ['cero', '0'],
      ['negativo', '-1'],
      ['no numérico', 'dos'],
      ['decimal', '1.5'],
      ['vacío', ''],
    ])('en prod rechaza %s', (_label, value) => {
      setEnv(prodEnv({ TRUST_PROXY_HOPS: value }));
      expect(() => assertRequiredEnv()).toThrow(/TRUST_PROXY_HOPS/);
    });

    it('acepta un entero >= 1 (Cloudflare→Railway = 2)', () => {
      setEnv(prodEnv({ TRUST_PROXY_HOPS: '2' }));
      expect(() => assertRequiredEnv()).not.toThrow();
    });

    it('en dev no se exige', () => {
      setEnv({ NODE_ENV: 'development', DATABASE_URL: LOCAL_DB, JWT_ACCESS_SECRET: 'dev' });
      expect(() => assertRequiredEnv()).not.toThrow();
    });
  });

  describe('print-agent expuesto', () => {
    it('escpos en prod sin PRINT_AGENT_SECRET mata el boot (cajón abierto a cualquier web)', () => {
      setEnv(prodEnv({ PRINTER_PROVIDER: 'escpos' }));
      expect(() => assertRequiredEnv()).toThrow(/PRINT_AGENT_SECRET/);
    });

    it('con el secret arranca', () => {
      setEnv(prodEnv({ PRINTER_PROVIDER: 'escpos', PRINT_AGENT_SECRET: 's3cr3t' }));
      expect(() => assertRequiredEnv()).not.toThrow();
    });
  });

  describe('warnings que no bloquean el boot', () => {
    it('avisa por DATABASE_URL sin connection_limit', () => {
      setEnv(prodEnv({ DATABASE_URL: 'postgresql://u:p@db.railway.internal:5432/db' }));
      assertRequiredEnv();
      expect(warn.mock.calls.flat().join(' ')).toMatch(/connection_limit/);
    });

    it('avisa por cada feature de negocio sin configurar', () => {
      setEnv(prodEnv());
      assertRequiredEnv();
      const msg = warn.mock.calls.flat().join(' ');
      for (const key of ['OWNER_WHATSAPP_PHONE', 'PRINTER_PROVIDER', 'TZ', 'KAPSO_API_KEY']) {
        expect(msg).toContain(key);
      }
    });

    it('no avisa de nada en dev', () => {
      setEnv({ NODE_ENV: 'development', DATABASE_URL: LOCAL_DB, JWT_ACCESS_SECRET: 'dev' });
      assertRequiredEnv();
      expect(warn).not.toHaveBeenCalled();
    });
  });
});
