import { describe, expect, it, vi } from 'vitest';
import { createPrintQueue } from './print-queue';

/**
 * Serializar no es un lujo: el POS dispara comanda de cocina + comanda completa
 * + factura casi a la vez, y el spooler RAW de Windows puede INTERCALAR los
 * bytes de dos trabajos paralelos (sale un ticket con mitad de cada recibo) o
 * trabarse. Mutantes que estos tests matan:
 * - correr en paralelo → recibos mezclados.
 * - una impresión que falla rompe la cadena → el agent no imprime NUNCA MÁS
 *   hasta reiniciarlo (el bug más caro posible en medio del servicio).
 */

/** Promesa que se resuelve/rechaza a mano, para controlar el orden. */
function deferred<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('createPrintQueue', () => {
  it('no arranca el segundo trabajo hasta que termina el primero', async () => {
    const q = createPrintQueue();
    const first = deferred();
    const started: string[] = [];

    const p1 = q.enqueue(async () => {
      started.push('a');
      await first.promise;
    });
    const p2 = q.enqueue(async () => {
      started.push('b');
    });

    await tick();
    expect(started).toEqual(['a']); // 'b' todavía no arrancó

    first.resolve();
    await Promise.all([p1, p2]);
    expect(started).toEqual(['a', 'b']);
  });

  it('respeta el orden de encolado con N trabajos', async () => {
    const q = createPrintQueue();
    const order: number[] = [];
    await Promise.all(
      [1, 2, 3, 4, 5].map((n) =>
        q.enqueue(async () => {
          await tick();
          order.push(n);
        }),
      ),
    );
    expect(order).toEqual([1, 2, 3, 4, 5]);
  });

  it('un trabajo que falla NO rompe la cadena: el siguiente igual se imprime', async () => {
    const q = createPrintQueue();
    const done: string[] = [];

    const failing = q.enqueue(async () => {
      throw new Error('impresora sin papel');
    });
    const next = q.enqueue(async () => {
      done.push('siguiente');
    });

    await expect(failing).rejects.toThrow('impresora sin papel');
    await next;
    expect(done).toEqual(['siguiente']);
  });

  it('sobrevive a varios fallos seguidos', async () => {
    const q = createPrintQueue();
    const results: string[] = [];
    const jobs = ['ok', 'falla', 'falla', 'ok'].map((kind) =>
      q
        .enqueue(async () => {
          if (kind === 'falla') throw new Error('boom');
          results.push('impreso');
        })
        .catch(() => results.push('falló')),
    );
    await Promise.all(jobs);
    expect(results).toEqual(['impreso', 'falló', 'falló', 'impreso']);
  });

  it('devuelve el valor del trabajo al llamador', async () => {
    const q = createPrintQueue();
    await expect(q.enqueue(async () => 42)).resolves.toBe(42);
  });

  it('propaga el error original sin envolverlo (el handler lo devuelve al POS)', async () => {
    const q = createPrintQueue();
    const err = new Error('No se pudo abrir la impresora "Cocina"');
    await expect(q.enqueue(() => Promise.reject(err))).rejects.toBe(err);
  });

  it('un trabajo síncrono que lanza tampoco rompe la cadena', async () => {
    const q = createPrintQueue();
    const boom = q.enqueue(() => {
      throw new Error('lanzó sincrónico');
    });
    await expect(boom).rejects.toThrow('lanzó sincrónico');
    await expect(q.enqueue(async () => 'vivo')).resolves.toBe('vivo');
  });

  it('cada cola es independiente (no comparten cadena por estado global)', async () => {
    const a = createPrintQueue();
    const b = createPrintQueue();
    const blocked = deferred();
    a.enqueue(() => blocked.promise);

    const spy = vi.fn().mockResolvedValue('ok');
    await expect(b.enqueue(spy)).resolves.toBe('ok'); // no lo bloquea la cola `a`
    expect(spy).toHaveBeenCalled();
    blocked.resolve();
  });
});
