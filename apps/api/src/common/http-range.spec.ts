import type { Request, Response } from 'express';
import { sendBufferWithRangeSupport } from './http-range';

/** Doble mínimo de `express.Response` que registra lo que se escribió. */
function fakeRes() {
  const headers: Record<string, unknown> = {};
  const state = { status: 200, body: undefined as Buffer | undefined, ended: false };
  const res = {
    setHeader(k: string, v: unknown) {
      headers[k] = v;
      return res;
    },
    status(code: number) {
      state.status = code;
      return res;
    },
    end(chunk?: Buffer) {
      state.body = chunk;
      state.ended = true;
      return res;
    },
  };
  return { res: res as unknown as Response, headers, state };
}

const req = (range?: string) => ({ headers: range ? { range } : {} }) as unknown as Request;
const OPTS = { mime: 'audio/mpeg', cacheControl: 'public, max-age=60' };
const buffer = Buffer.from('0123456789'); // 10 bytes

describe('sendBufferWithRangeSupport — sin Range', () => {
  it('responde 200 con el buffer completo', () => {
    const { res, headers, state } = fakeRes();
    sendBufferWithRangeSupport(req(), res, buffer, OPTS);
    expect(state.status).toBe(200);
    expect(state.body?.toString()).toBe('0123456789');
    expect(headers['Content-Length']).toBe(10);
    expect(headers['Content-Range']).toBeUndefined();
  });

  it('siempre anuncia Accept-Ranges (sin esto el browser no hace seeking)', () => {
    const { res, headers } = fakeRes();
    sendBufferWithRangeSupport(req(), res, buffer, OPTS);
    expect(headers['Accept-Ranges']).toBe('bytes');
    expect(headers['Content-Type']).toBe('audio/mpeg');
    expect(headers['Cache-Control']).toBe('public, max-age=60');
  });
});

describe('sendBufferWithRangeSupport — con Range', () => {
  it('sirve 206 con la porción pedida', () => {
    const { res, headers, state } = fakeRes();
    sendBufferWithRangeSupport(req('bytes=2-5'), res, buffer, OPTS);
    expect(state.status).toBe(206);
    expect(state.body?.toString()).toBe('2345');
    expect(headers['Content-Range']).toBe('bytes 2-5/10');
    expect(headers['Content-Length']).toBe(4);
  });

  it('rango abierto al final ("bytes=4-") llega hasta el último byte', () => {
    const { res, headers, state } = fakeRes();
    sendBufferWithRangeSupport(req('bytes=4-'), res, buffer, OPTS);
    expect(state.status).toBe(206);
    expect(state.body?.toString()).toBe('456789');
    expect(headers['Content-Range']).toBe('bytes 4-9/10');
  });

  it('rango sin inicio ("bytes=0-0") devuelve el primer byte', () => {
    const { res, state } = fakeRes();
    sendBufferWithRangeSupport(req('bytes=0-0'), res, buffer, OPTS);
    expect(state.status).toBe(206);
    expect(state.body?.toString()).toBe('0');
  });

  it('recorta un fin que se pasa del tamaño real', () => {
    const { res, headers, state } = fakeRes();
    sendBufferWithRangeSupport(req('bytes=8-999'), res, buffer, OPTS);
    expect(state.status).toBe(206);
    expect(headers['Content-Range']).toBe('bytes 8-9/10');
    expect(state.body?.toString()).toBe('89');
  });

  it('416 cuando el inicio se pasa del tamaño', () => {
    const { res, headers, state } = fakeRes();
    sendBufferWithRangeSupport(req('bytes=10-12'), res, buffer, OPTS);
    expect(state.status).toBe(416);
    expect(headers['Content-Range']).toBe('bytes */10');
    expect(state.body).toBeUndefined();
  });

  it('416 cuando el inicio es mayor que el fin', () => {
    const { res, state } = fakeRes();
    sendBufferWithRangeSupport(req('bytes=6-3'), res, buffer, OPTS);
    expect(state.status).toBe(416);
  });

  it('un header Range con sintaxis inválida cae al 200 completo', () => {
    const { res, state } = fakeRes();
    sendBufferWithRangeSupport(req('items=1-2'), res, buffer, OPTS);
    expect(state.status).toBe(200);
    expect(state.body?.toString()).toBe('0123456789');
  });
});
