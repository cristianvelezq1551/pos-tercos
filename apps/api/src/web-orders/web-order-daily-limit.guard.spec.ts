/**
 * El tope diario por IP es un control anti-abuso: cada pedido web dispara una
 * plantilla de WhatsApp con costo real, y el endpoint es público. Los e2e
 * suben el tope (toda la suite comparte 127.0.0.1), así que la garantía de que
 * el freno FUNCIONA vive acá.
 */
import { HttpException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { WebOrderDailyLimitGuard } from './web-order-daily-limit.guard';

/** Contexto mínimo: al guard solo le importa `req.ip`. */
const ctxFor = (ip: string | undefined): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ ip }) }),
  }) as unknown as ExecutionContext;

/** El tope se lee en el constructor → hay que fijarlo ANTES de instanciar. */
function guardWithMax(max?: string): WebOrderDailyLimitGuard {
  if (max === undefined) delete process.env.WEB_ORDER_MAX_PER_IP_PER_DAY;
  else process.env.WEB_ORDER_MAX_PER_IP_PER_DAY = max;
  return new WebOrderDailyLimitGuard();
}

describe('WebOrderDailyLimitGuard', () => {
  const original = process.env.WEB_ORDER_MAX_PER_IP_PER_DAY;

  afterEach(() => {
    if (original === undefined) delete process.env.WEB_ORDER_MAX_PER_IP_PER_DAY;
    else process.env.WEB_ORDER_MAX_PER_IP_PER_DAY = original;
    jest.useRealTimers();
  });

  it('deja pasar hasta el tope y corta el siguiente con 429', () => {
    const guard = guardWithMax('3');
    const ctx = ctxFor('1.2.3.4');

    expect(guard.canActivate(ctx)).toBe(true);
    expect(guard.canActivate(ctx)).toBe(true);
    expect(guard.canActivate(ctx)).toBe(true);

    try {
      guard.canActivate(ctx);
      throw new Error('el 4º pedido debió ser rechazado');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException);
      expect((e as HttpException).getStatus()).toBe(429);
    }
  });

  it('el presupuesto es POR IP: un vecino saturado no bloquea a otro', () => {
    const guard = guardWithMax('1');
    expect(guard.canActivate(ctxFor('1.1.1.1'))).toBe(true);
    expect(() => guard.canActivate(ctxFor('1.1.1.1'))).toThrow(HttpException);
    // Otra IP arranca con su propio contador.
    expect(guard.canActivate(ctxFor('2.2.2.2'))).toBe(true);
  });

  it('el contador se libera al vencer la ventana de 24h', () => {
    jest.useFakeTimers();
    const guard = guardWithMax('1');
    const ctx = ctxFor('9.9.9.9');

    expect(guard.canActivate(ctx)).toBe(true);
    expect(() => guard.canActivate(ctx)).toThrow(HttpException);

    jest.advanceTimersByTime(24 * 60 * 60 * 1000 + 1);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('sin la env var cae al default de 25', () => {
    const guard = guardWithMax(undefined);
    const ctx = ctxFor('5.5.5.5');
    for (let i = 0; i < 25; i++) expect(guard.canActivate(ctx)).toBe(true);
    expect(() => guard.canActivate(ctx)).toThrow(HttpException);
  });

  it('una env var basura no desarma el freno: cae al default', () => {
    for (const basura of ['0', '-5', 'muchos', '2.5', '']) {
      const guard = guardWithMax(basura);
      const ctx = ctxFor('7.7.7.7');
      for (let i = 0; i < 25; i++) expect(guard.canActivate(ctx)).toBe(true);
      expect(() => guard.canActivate(ctx)).toThrow(HttpException);
    }
  });

  it('una request sin IP identificable no evade el tope', () => {
    const guard = guardWithMax('2');
    expect(guard.canActivate(ctxFor(undefined))).toBe(true);
    expect(guard.canActivate(ctxFor(undefined))).toBe(true);
    expect(() => guard.canActivate(ctxFor(undefined))).toThrow(HttpException);
  });
});
