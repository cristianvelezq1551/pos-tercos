/**
 * E2E del turnero configurable: import de defaults idempotente, CRUD de slides
 * con upload de imagen, toggle de visibilidad reflejado en la config pública,
 * streaming de bytes, tracks de audio, y gating de los endpoints de admin.
 */
import * as bcrypt from 'bcrypt';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

// PNG 1x1 válido (firma magic-byte correcta para detectImageMime).
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64',
);
const FAKE_MP3 = Buffer.from('ID3fake-audio-bytes-for-test');

describe('Turnero configurable E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let duenoToken: string;

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.create({
      data: {
        email: 'dueno-display@test.local',
        fullName: 'Dueño Display',
        role: 'DUENO',
        passwordHash: hash,
        mustChangePwd: false,
        active: true,
      },
    });
    duenoToken = await loginAs(request, 'dueno-display@test.local');
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${duenoToken}` });

  it('importa los defaults y es idempotente', async () => {
    const first = await request.post('/display/import-defaults').set(auth()).expect(201);
    expect(first.body.imported).toBe(10);
    expect(first.body.skipped).toBe(false);

    const again = await request.post('/display/import-defaults').set(auth()).expect(201);
    expect(again.body.imported).toBe(0);
    expect(again.body.skipped).toBe(true);
  });

  it('expone la config pública sin auth', async () => {
    const res = await request.get('/display/broll').expect(200);
    expect(res.body.slides.length).toBe(10);
    expect(Array.isArray(res.body.tracks)).toBe(true);
    expect(res.body.slides[0].imageUrl).toMatch(/^\/api\/display\/slide-image\//);
  });

  it('los endpoints de admin exigen auth', async () => {
    await request.get('/display/slides').expect(401);
    await request.post('/display/import-defaults').expect(401);
  });

  it('crea un slide con imagen y lo sirve por bytes', async () => {
    const created = await request
      .post('/display/slides')
      .set(auth())
      .field('name', 'Combo Test')
      .field('tag', 'Test')
      .field('price', '$10K')
      .field('description', 'Slide de prueba e2e')
      .attach('image', PNG_1X1, { filename: 't.png', contentType: 'image/png' })
      .expect(201);
    expect(created.body.name).toBe('Combo Test');

    const img = await request.get(`/display/slide-image/${created.body.id}`).expect(200);
    expect(img.headers['content-type']).toContain('image/png');
    expect(img.body.length).toBeGreaterThan(0);
  });

  it('reemplazar la imagen cambia el `?v=` de imageUrl (cache-bust del browser)', async () => {
    const list = await request.get('/display/slides').set(auth()).expect(200);
    const target = list.body.find((s: { name: string }) => s.name === 'Combo Test');
    expect(target.imageUrl).toMatch(/\?v=.+$/);

    const replaced = await request
      .post(`/display/slides/${target.id}/image`)
      .set(auth())
      .attach('image', PNG_1X1, { filename: 't2.png', contentType: 'image/png' })
      .expect(201);
    expect(replaced.body.imageUrl).toMatch(/\?v=.+$/);
    expect(replaced.body.imageUrl).not.toBe(target.imageUrl);
  });

  it('un slide oculto desaparece de la config pública', async () => {
    const list = await request.get('/display/slides').set(auth()).expect(200);
    const target = list.body[0];
    await request
      .patch(`/display/slides/${target.id}`)
      .set(auth())
      .send({ isActive: false })
      .expect(200);

    const broll = await request.get('/display/broll').expect(200);
    expect(broll.body.slides.find((s: { id: string }) => s.id === target.id)).toBeUndefined();
  });

  it('rechaza una imagen inválida (no es imagen real)', async () => {
    await request
      .post('/display/slides')
      .set(auth())
      .field('name', 'Malo')
      .field('tag', 'X')
      .field('price', '$1')
      .field('description', 'no es imagen')
      .attach('image', Buffer.from('not-an-image'), { filename: 'x.png', contentType: 'image/png' })
      .expect(400);
  });

  it('sube un track y lo refleja en la config + lo sirve', async () => {
    const track = await request
      .post('/display/tracks')
      .set(auth())
      .field('label', 'Ambiente 1')
      .attach('audio', FAKE_MP3, { filename: 'a.mp3', contentType: 'audio/mpeg' })
      .expect(201);
    expect(track.body.label).toBe('Ambiente 1');
    expect(track.body.audioUrl).toMatch(/^\/api\/display\/track-audio\//);

    const broll = await request.get('/display/broll').expect(200);
    expect(broll.body.tracks.length).toBe(1);

    const audio = await request.get(`/display/track-audio/${track.body.id}`).expect(200);
    expect(audio.headers['content-type']).toContain('audio/mpeg');
  });
});
