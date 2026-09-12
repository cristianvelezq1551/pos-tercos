import { loginsPorMinuto, peticionesPorMinuto } from './rate-limit';

/**
 * Los dos topes por IP son el freno real de producción: solo el entorno de los
 * tests los sube (todo el job pega desde una sola IP). Lo que estas pruebas
 * fijan es que producción NUNCA se quede sin freno por una variable mal
 * escrita — el mismo criterio que `WEB_ORDER_MAX_PER_IP_PER_DAY`.
 */
describe('topes de peticiones por IP', () => {
  describe('tope general', () => {
    const original = process.env.API_RATE_LIMIT_PER_MINUTE;
    afterEach(() => {
      if (original === undefined) delete process.env.API_RATE_LIMIT_PER_MINUTE;
      else process.env.API_RATE_LIMIT_PER_MINUTE = original;
    });

    it('sin variable, el tope real de producción', () => {
      delete process.env.API_RATE_LIMIT_PER_MINUTE;
      expect(peticionesPorMinuto()).toBe(100);
    });

    it('con un número válido, ese', () => {
      process.env.API_RATE_LIMIT_PER_MINUTE = '5000';
      expect(peticionesPorMinuto()).toBe(5000);
    });

    it.each(['0', '-1', 'muchas', ''])('un valor basura (%s) cae al default', (valor) => {
      process.env.API_RATE_LIMIT_PER_MINUTE = valor;
      expect(peticionesPorMinuto()).toBe(100);
    });
  });

  const original = process.env.AUTH_LOGINS_PER_MINUTE;
  afterEach(() => {
    if (original === undefined) delete process.env.AUTH_LOGINS_PER_MINUTE;
    else process.env.AUTH_LOGINS_PER_MINUTE = original;
  });

  it('sin variable, el tope real de producción', () => {
    delete process.env.AUTH_LOGINS_PER_MINUTE;
    expect(loginsPorMinuto()).toBe(10);
  });

  it('con un número válido, ese', () => {
    process.env.AUTH_LOGINS_PER_MINUTE = '200';
    expect(loginsPorMinuto()).toBe(200);
  });

  it.each(['0', '-5', 'muchos', '', '3.5'])(
    'un valor basura (%s) NO deja la puerta abierta: cae al default',
    (valor) => {
      process.env.AUTH_LOGINS_PER_MINUTE = valor;
      expect(loginsPorMinuto()).toBe(10);
    },
  );
});
