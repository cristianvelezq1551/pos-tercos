import { createDecipheriv, createECDH, hkdfSync, randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { generateVapidKeys } from './web-push-crypto';
import { WebPushAdapter } from './web-push.adapter';

/**
 * El cifrado ya está verificado contra el vector oficial del RFC 8291. Lo que
 * falta probar es la PETICIÓN: cabeceras, cuerpo y qué se hace con cada
 * respuesta. Se levanta un servicio de push falso porque es la única forma de
 * ver lo que sale por el cable sin depender de Google ni de Mozilla.
 */
describe('WebPushAdapter', () => {
  const vapid = { ...generateVapidKeys(), subject: 'mailto:duenio@tercos.co' };
  const adapter = new WebPushAdapter(vapid);

  // Par de llaves del "navegador": con la privada se descifra lo recibido.
  const ua = createECDH('prime256v1');
  ua.generateKeys();
  const authSecret = randomBytes(16);
  const keys = {
    p256dh: ua.getPublicKey().toString('base64url'),
    auth: authSecret.toString('base64url'),
  };

  let server: Server;
  let base: string;
  let recibido: { headers: Record<string, string | undefined>; body: Buffer } | null;
  let respuesta = { status: 201, body: '' };

  beforeAll(async () => {
    server = createServer((req, res) => {
      const trozos: Buffer[] = [];
      req.on('data', (c: Buffer) => trozos.push(c));
      req.on('end', () => {
        recibido = { headers: req.headers as Record<string, string>, body: Buffer.concat(trozos) };
        res.writeHead(respuesta.status);
        res.end(respuesta.body);
      });
    });
    await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((ok) => server.close(() => ok()));
  });

  beforeEach(() => {
    recibido = null;
    respuesta = { status: 201, body: '' };
  });

  const target = () => ({ endpoint: `${base}/push/abc`, ...keys });

  /** Lo que haría el service worker al recibir el aviso. */
  function descifrarLoRecibido(): unknown {
    const body = recibido!.body;
    const salt = body.subarray(0, 16);
    const idlen = body[20];
    const asPublic = body.subarray(21, 21 + idlen);
    const ct = body.subarray(21 + idlen);
    const shared = ua.computeSecret(asPublic);
    const keyInfo = Buffer.concat([
      Buffer.from('WebPush: info\0'),
      ua.getPublicKey(),
      asPublic,
    ]);
    const ikm = Buffer.from(hkdfSync('sha256', shared, authSecret, keyInfo, 32));
    const cek = Buffer.from(
      hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16),
    );
    const nonce = Buffer.from(
      hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12),
    );
    const d = createDecipheriv('aes-128-gcm', cek, nonce);
    d.setAuthTag(ct.subarray(ct.length - 16));
    const plano = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
    return JSON.parse(plano.subarray(0, plano.length - 1).toString('utf8'));
  }

  it('el navegador recibe exactamente el aviso que se le mandó', async () => {
    const r = await adapter.send(target(), {
      title: 'Tercos · Stock bajo',
      body: 'Pan: 21 de 30 unidad',
      url: '/purchase-suggestions',
      tag: 'low_stock',
    });
    expect(r).toEqual({ ok: true, gone: false });
    expect(descifrarLoRecibido()).toEqual({
      title: 'Tercos · Stock bajo',
      body: 'Pan: 21 de 30 unidad',
      url: '/purchase-suggestions',
      tag: 'low_stock',
    });
  });

  it('manda las cabeceras que el servicio de push exige', async () => {
    await adapter.send(target(), { title: 'x', body: 'y' });
    const h = recibido!.headers;
    expect(h['content-encoding']).toBe('aes128gcm');
    expect(h['content-type']).toBe('application/octet-stream');
    expect(h.ttl).toBe('21600');
    // Sin el JWT de VAPID el servicio responde 401 y el aviso nunca sale.
    expect(h.authorization).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=/);
  });

  it('un aviso larguísimo se recorta en vez de reventar el cifrado', async () => {
    const r = await adapter.send(target(), { title: 'x', body: 'a'.repeat(5000) });
    expect(r.ok).toBe(true);
    const payload = descifrarLoRecibido() as { body: string };
    expect(payload.body.endsWith('…')).toBe(true);
    expect(payload.body.length).toBeLessThanOrEqual(500);
  });

  it('un 410 marca la suscripción como muerta para que la borren', async () => {
    // Es la ÚNICA señal de que el navegador se desinstaló o revocó el permiso.
    respuesta = { status: 410, body: 'gone' };
    expect(await adapter.send(target(), { title: 'x', body: 'y' })).toMatchObject({
      ok: false,
      gone: true,
    });
  });

  it('un 404 también', async () => {
    respuesta = { status: 404, body: '' };
    expect((await adapter.send(target(), { title: 'x', body: 'y' })).gone).toBe(true);
  });

  it('un 500 del servicio NO borra la suscripción: el dispositivo sigue vivo', async () => {
    respuesta = { status: 500, body: 'boom' };
    const r = await adapter.send(target(), { title: 'x', body: 'y' });
    expect(r).toMatchObject({ ok: false, gone: false });
    expect(r.error).toContain('500');
  });

  it('una red caída tampoco borra nada', async () => {
    const r = await adapter.send(
      { endpoint: 'https://127.0.0.1:1/push/x', ...keys },
      { title: 'x', body: 'y' },
    );
    expect(r).toMatchObject({ ok: false, gone: false });
  });

  it('una llave inválida falla sin salir a la red', async () => {
    const r = await adapter.send(
      { endpoint: `${base}/push/abc`, p256dh: 'no-es-una-llave', auth: keys.auth },
      { title: 'x', body: 'y' },
    );
    expect(r).toMatchObject({ ok: false, gone: false });
    expect(recibido).toBeNull();
  });
});
