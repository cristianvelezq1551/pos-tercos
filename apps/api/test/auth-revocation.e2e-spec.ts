/**
 * auth-revocation.e2e-spec.ts
 *
 * tokenVersion: el access JWT de un usuario se invalida AL INSTANTE cuando se
 * lo desactiva, se le cambia el rol o se le resetea la contraseña — sin esperar
 * a que expire el token de 24h. El guard compara `tv` del token contra
 * users.token_version (con cache de 60s + invalidate inmediato).
 */

import * as bcrypt from 'bcrypt';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { KdsGateway } from '../src/kds/kds.gateway';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

describe('Revocación de sesión (tokenVersion) E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let duenoToken: string;

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.create({
      data: {
        email: 'dueno-rev@test.local',
        fullName: 'Dueño Rev',
        role: 'DUENO',
        passwordHash: hash,
        mustChangePwd: false,
        active: true,
      },
    });
    duenoToken = await loginAs(request, 'dueno-rev@test.local');
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  const makeUser = async (email: string, role = 'CAJERO'): Promise<string> => {
    const hash = await bcrypt.hash('dev12345', 10);
    const u = await prisma.user.create({
      data: { email, fullName: email, role: role as 'CAJERO', passwordHash: hash, mustChangePwd: false, active: true },
    });
    return u.id;
  };

  it('desactivar al usuario MATA su access token vigente (401)', async () => {
    const id = await makeUser('rev-deact@test.local');
    const token = await loginAs(request, 'rev-deact@test.local');

    // El token funciona ANTES de desactivar.
    await request.get('/auth/me').set('Authorization', `Bearer ${token}`).expect(200);

    // El dueño lo desactiva.
    await request
      .patch(`/users/${id}`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({ active: false })
      .expect(200);

    // El MISMO token (no expirado) ya no sirve.
    await request.get('/auth/me').set('Authorization', `Bearer ${token}`).expect(401);
  });

  it('cambiar el rol MATA el access token vigente (evita rol viejo por 24h)', async () => {
    const id = await makeUser('rev-role@test.local', 'CAJERO');
    const token = await loginAs(request, 'rev-role@test.local');
    await request.get('/auth/me').set('Authorization', `Bearer ${token}`).expect(200);

    await request
      .patch(`/users/${id}`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({ role: 'COCINERO' })
      .expect(200);

    await request.get('/auth/me').set('Authorization', `Bearer ${token}`).expect(401);
  });

  it('resetear la contraseña MATA el access token vigente', async () => {
    const id = await makeUser('rev-pwd@test.local');
    const token = await loginAs(request, 'rev-pwd@test.local');
    await request.get('/auth/me').set('Authorization', `Bearer ${token}`).expect(200);

    await request
      .post(`/users/${id}/reset-password`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({ newPassword: 'nuevaclave123' })
      .expect(204);

    await request.get('/auth/me').set('Authorization', `Bearer ${token}`).expect(401);
  });

  it('un cambio que NO toca rol/estado/clave (solo nombre) NO mata el token', async () => {
    const id = await makeUser('rev-name@test.local');
    const token = await loginAs(request, 'rev-name@test.local');

    await request
      .patch(`/users/${id}`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({ fullName: 'Nombre Nuevo' })
      .expect(200);

    // El token sigue vivo (no se invalidó por un cambio cosmético).
    await request.get('/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
  });

  // ---------------------------------------------------------------------------
  // La revocación también corta los WebSockets (no solo el plano HTTP): un
  // socket abierto con token de usuario dado de baja NO debe sobrevivir 24h.
  // ---------------------------------------------------------------------------
  describe('Revocación en WebSocket (KdsGateway)', () => {
    type FakeSocket = {
      handshake: { headers: Record<string, string>; auth: Record<string, string> };
      data: Record<string, unknown>;
      emit: jest.Mock;
      disconnect: jest.Mock;
      join: jest.Mock;
    };
    const fakeSocket = (token: string): FakeSocket => ({
      handshake: { headers: {}, auth: { token } },
      data: {},
      emit: jest.fn(),
      disconnect: jest.fn(),
      join: jest.fn().mockResolvedValue(undefined),
    });

    it('acepta la conexión con un token válido y rol permitido', async () => {
      const gateway = app.get(KdsGateway);
      const sock = fakeSocket(duenoToken);
      await gateway.handleConnection(sock as unknown as Parameters<typeof gateway.handleConnection>[0]);
      expect(sock.disconnect).not.toHaveBeenCalled();
      expect(sock.join).toHaveBeenCalled();
      expect(sock.data.userId).toBeTruthy();
    });

    it('corta la conexión cuando el usuario fue desactivado (sesión revocada)', async () => {
      const id = await makeUser('rev-ws@test.local', 'CAJERO');
      const token = await loginAs(request, 'rev-ws@test.local');

      // El token conecta ANTES de desactivar.
      const gateway = app.get(KdsGateway);
      const before = fakeSocket(token);
      await gateway.handleConnection(before as unknown as Parameters<typeof gateway.handleConnection>[0]);
      expect(before.disconnect).not.toHaveBeenCalled();

      // El dueño lo desactiva (sube tokenVersion + invalida cache).
      await request
        .patch(`/users/${id}`)
        .set('Authorization', `Bearer ${duenoToken}`)
        .send({ active: false })
        .expect(200);

      // El MISMO token ya no conecta por WS.
      const after = fakeSocket(token);
      await gateway.handleConnection(after as unknown as Parameters<typeof gateway.handleConnection>[0]);
      expect(after.disconnect).toHaveBeenCalled();
      expect(after.join).not.toHaveBeenCalled();
    });
  });
});
