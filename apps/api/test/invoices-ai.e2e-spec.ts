/**
 * §4.4 (e2e): el camino IA de facturas (`upload-photo`) no tenía e2e. Todo el
 * costeo FIFO nace acá. Con el LLMService MOCKEADO (no le pega a Anthropic) se
 * cubre: detección de mime por magic bytes (PNG renombrado .jpg → PNG),
 * invocación del LLM y el shape de la respuesta, y el rechazo de no-imágenes.
 */
import * as bcrypt from 'bcrypt';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { LLMService } from '../src/adapters/llm/llm.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

// Magic bytes de un PNG (8 de firma + relleno) — contenido real, más allá del nombre.
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 1, 2, 3, 4]);

const FAKE_EXTRACTION = {
  supplierName: 'Distribuidora Test',
  supplierNit: '900.111.222-3',
  invoiceNumber: 'F-001',
  total: 50000,
  iva: 9500,
  items: [
    { descriptionRaw: 'POLLO ENTERO X 1.8KG', quantity: 4, unit: 'unidad', unitPrice: 10000, total: 40000, packUnits: null, packSizePerUnit: null, packSizeMeasure: null },
  ],
  warnings: [],
};

/** Fake del LLMService: devuelve una extracción fija sin llamar a ningún provider. */
const fakeLlm = {
  extractInvoice: async () => ({ modelUsed: 'fake-model', extraction: FAKE_EXTRACTION }),
  complete: async () => ({ text: '', modelUsed: 'fake-model' }),
};

describe('Facturas por IA (upload-photo) E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let token: string;

  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp((builder) =>
      builder.overrideProvider(LLMService).useValue(fakeLlm),
    ));
    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.create({
      data: { email: 'dueno-ia@test.local', fullName: 'Dueño IA', role: 'DUENO', passwordHash: hash, mustChangePwd: false, active: true },
    });
    token = await loginAs(request, 'dueno-ia@test.local');
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  it('sube una foto válida → la IA extrae y devuelve la factura + la key de la foto', async () => {
    const res = await request
      .post('/invoices/upload-photo')
      .set(auth())
      .attach('photo', PNG_BYTES, 'factura.png')
      .expect(201);
    expect(res.body.photoStorageKey).toBeTruthy();
    expect(res.body.aiModelUsed).toBe('fake-model');
    expect(res.body.extraction.supplierName).toBe('Distribuidora Test');
    expect(res.body.extraction.items).toHaveLength(1);
    expect(res.body.extraction.items[0].descriptionRaw).toContain('POLLO');
  });

  it('el CONTENIDO gana sobre el nombre: un PNG renombrado .jpg se acepta como imagen', async () => {
    const res = await request
      .post('/invoices/upload-photo')
      .set(auth())
      .attach('photo', PNG_BYTES, 'factura.jpg') // extensión miente, los bytes son PNG
      .expect(201);
    expect(res.body.extraction.supplierName).toBe('Distribuidora Test');
  });

  it('un archivo que NO es imagen se rechaza con 400 (antes de llamar a la IA)', async () => {
    const res = await request
      .post('/invoices/upload-photo')
      .set(auth())
      .attach('photo', Buffer.from('esto es un PDF o basura, no una imagen'), 'factura.png')
      .expect(400);
    expect(JSON.stringify(res.body).toLowerCase()).toContain('imagen');
  });

  it('sin archivo → 400', async () => {
    await request.post('/invoices/upload-photo').set(auth()).expect(400);
  });
});
