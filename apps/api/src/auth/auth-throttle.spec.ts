import { loginsPorMinuto } from './auth.controller';

/**
 * El tope de logins por minuto es el anti-brute-force de la contraseña: solo el
 * entorno de los tests de navegador lo sube (todo el job pega desde una IP). Lo
 * que estas pruebas fijan es que producción NUNCA se quede sin freno por una
 * variable mal escrita — el mismo criterio que `WEB_ORDER_MAX_PER_IP_PER_DAY`.
 */
describe('tope de logins por minuto', () => {
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
