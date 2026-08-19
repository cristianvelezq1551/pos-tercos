/**
 * §4.8: la matriz de permisos de `users` (todo Dueño-only) y el read de la
 * bitácora `/audit` no tenían test. Cubre: un ADMIN_OPERATIVO recibe 403 en los
 * endpoints sensibles; `terminate` mata la sesión del terminado; y el filtro
 * `/audit?action=CSV` (herramienta antifraude del dueño) devuelve solo lo pedido.
 */
import * as bcrypt from 'bcrypt';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

const ymd = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

describe('Permisos de usuarios + bitácora E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let duenoToken: string;
  let operativoToken: string;

  const dueno = () => ({ Authorization: `Bearer ${duenoToken}` });
  const op = () => ({ Authorization: `Bearer ${operativoToken}` });

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.createMany({
      data: [
        { email: 'dueno-ua@test.local', fullName: 'Dueño UA', role: 'DUENO', passwordHash: hash, mustChangePwd: false, active: true },
        { email: 'op-ua@test.local', fullName: 'Op UA', role: 'ADMIN_OPERATIVO', passwordHash: hash, mustChangePwd: false, active: true },
      ],
    });
    duenoToken = await loginAs(request, 'dueno-ua@test.local');
    operativoToken = await loginAs(request, 'op-ua@test.local');
    // El dueño setea su propio PIN (para terminate/delete). Requiere su password.
    await request.post('/approvals/pin').set(dueno()).send({ pin: '111111', password: 'dev12345' }).expect(201);
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  it('un ADMIN_OPERATIVO recibe 403 en todos los endpoints de usuarios (Dueño-only)', async () => {
    await request.get('/users').set(op()).expect(403);
    await request.post('/users').set(op()).send({ email: 'x@x.co', fullName: 'X Y', role: 'COCINERO', password: 'abcdefgh' }).expect(403);
    // Un id cualquiera: el guard bloquea antes de tocar la lógica.
    const fakeId = '00000000-0000-4000-8000-000000000999';
    await request.patch(`/users/${fakeId}`).set(op()).send({ fullName: 'Z Z' }).expect(403);
    await request.post(`/users/${fakeId}/pin`).set(op()).send({ pin: '222222', password: 'dev12345' }).expect(403);
    await request.post(`/users/${fakeId}/employment`).set(op()).set('x-approval-pin', '111111').send({ payType: 'DAILY', salaryAmount: 1 }).expect(403);
    await request.post(`/users/${fakeId}/terminate`).set(op()).set('x-approval-pin', '111111').send({ date: ymd() }).expect(403);
    await request.delete(`/users/${fakeId}`).set(op()).set('x-approval-pin', '111111').expect(403);
  });

  it('terminate mata la sesión del usuario terminado', async () => {
    const hash = await bcrypt.hash('dev12345', 10);
    const u = await prisma.user.create({
      data: { email: 'cocinero-ua@test.local', fullName: 'Coci UA', role: 'COCINERO', passwordHash: hash, mustChangePwd: false, active: true },
    });
    const uToken = await loginAs(request, 'cocinero-ua@test.local');
    // El token del cocinero funciona.
    await request.get('/auth/me').set({ Authorization: `Bearer ${uToken}` }).expect(200);

    // El dueño lo termina (con PIN).
    await request
      .post(`/users/${u.id}/terminate`)
      .set(dueno())
      .set('x-approval-pin', '111111')
      .send({ date: ymd(), note: 'fin de contrato' })
      .expect(201);

    // El token viejo del cocinero ya no vale.
    await request.get('/auth/me').set({ Authorization: `Bearer ${uToken}` }).expect(401);
  });

  it('un ADMIN_OPERATIVO no puede leer la bitácora (403)', async () => {
    await request.get('/audit').set(op()).expect(403);
  });

  it('/audit?action=CSV devuelve SOLO las acciones pedidas', async () => {
    // Acciones que SÍ se auditan: movimientos de inventario (INITIAL / WASTE).
    const prod = await request
      .post('/products')
      .set(dueno())
      .send({ category: 'Test', name: 'Prod Audit', basePrice: 4000, directResale: true, unitPurchase: 'caja', unitStock: 'unit', conversionFactor: 12, modifiersEnabled: false })
      .expect(201);
    await request
      .post('/inventory/movements')
      .set(dueno())
      .send({ entityType: 'PRODUCT', productId: prod.body.id, delta: 5, type: 'INITIAL', unitCost: 1000 })
      .expect(201);
    await request
      .post('/inventory/movements')
      .set(dueno())
      .send({ entityType: 'PRODUCT', productId: prod.body.id, delta: -1, type: 'WASTE', notes: 'se cayó' })
      .expect(201);

    // Filtro simple: solo INITIAL.
    const only = await request.get('/audit?action=INVENTORY_MOVEMENT_INITIAL').set(dueno()).expect(200);
    const rowsOnly = only.body as Array<{ action: string }>;
    expect(rowsOnly.length).toBeGreaterThan(0);
    expect(rowsOnly.every((r) => r.action === 'INVENTORY_MOVEMENT_INITIAL')).toBe(true);

    // Filtro CSV: las dos acciones.
    const csv = await request.get('/audit?action=INVENTORY_MOVEMENT_INITIAL,INVENTORY_MOVEMENT_WASTE').set(dueno()).expect(200);
    const actions = new Set((csv.body as Array<{ action: string }>).map((r) => r.action));
    expect(actions.has('INVENTORY_MOVEMENT_INITIAL')).toBe(true);
    expect(actions.has('INVENTORY_MOVEMENT_WASTE')).toBe(true);
    // Y NADA fuera de esas dos.
    expect([...actions].every((a) => a === 'INVENTORY_MOVEMENT_INITIAL' || a === 'INVENTORY_MOVEMENT_WASTE')).toBe(true);
  });
});
