/**
 * La foto de la factura se lee DOS veces y los desacuerdos se avisan.
 *
 * Por qué: la IA no es determinista. Con una factura real de Postobón de 16
 * líneas, cuatro corridas de la MISMA imagen dieron cuatro resultados: el total
 * salió bien las cuatro, el IVA solo una, una línea se leyó mal en todas, y una
 * corrida erró $10 —por debajo de cualquier tolerancia razonable—. Y un error de
 * CANTIDAD que no cambia el total de la línea no lo detecta ninguna suma.
 *
 * Las dos garantías que fija esta suite:
 *   1. Cuando las dos lecturas discrepan, el desacuerdo llega a la pantalla.
 *   2. Cuando la SEGUNDA falla, la carga sigue funcionando igual que antes de
 *      que existiera esta función. Nunca puede impedir cargar una factura.
 */
import * as bcrypt from 'bcrypt';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { LLMService } from '../src/adapters/llm/llm.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 1, 2, 3, 4]);

const item = (over: Record<string, unknown> = {}) => ({
  descriptionRaw: 'ACQUA POSTOBON SANDIA PET 400 ML X 15',
  quantity: 15,
  unit: 'PZA',
  unitPrice: 1053.22,
  total: 18799.98,
  packUnits: null,
  packSizePerUnit: null,
  packSizeMeasure: null,
  ...over,
});

const extraccion = (over: Record<string, unknown> = {}) => ({
  supplierName: 'POSTOBON S.A.',
  supplierNit: '890903939',
  invoiceNumber: 'IT081858285',
  total: 398466.57,
  iva: 63620.71,
  freight: null,
  items: [item()],
  warnings: [],
  ...over,
});

/** Devuelve una lectura distinta en cada llamada, como hace la IA real. */
function llmQueVaria(lecturas: Array<Record<string, unknown>>) {
  let n = 0;
  return {
    extractInvoice: async () => {
      const e = lecturas[Math.min(n, lecturas.length - 1)];
      n += 1;
      return { modelUsed: 'fake-model', extraction: e };
    },
    complete: async () => ({ text: '', modelUsed: 'fake-model' }),
  };
}

describe('Doble lectura de la factura E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let token: string;
  let llm: ReturnType<typeof llmQueVaria>;

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const subir = () =>
    request
      .post('/invoices/upload-photo')
      .set(auth())
      .attach('photo', PNG_BYTES, { filename: 'factura.png', contentType: 'image/png' });

  beforeAll(async () => {
    // El fake se resuelve por referencia: cada test reemplaza `llm.extractInvoice`
    // antes de subir, sin re-levantar la app.
    llm = llmQueVaria([extraccion()]);
    ({ app, prisma, request } = await bootstrapApp((builder) =>
      builder.overrideProvider(LLMService).useValue({
        extractInvoice: (...args: unknown[]) => llm.extractInvoice(...(args as [])),
        complete: () => llm.complete(),
      }),
    ));
    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.create({
      data: { email: 'dueno-doble@test.local', passwordHash: hash, fullName: 'Dueño Doble', role: 'DUENO' },
    });
    token = await loginAs(request, 'dueno-doble@test.local', 'dev12345');
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  it('dos lecturas iguales no agregan ruido', async () => {
    llm = llmQueVaria([extraccion(), extraccion()]);
    const res = await subir().expect(201);
    expect(res.body.extraction.warnings).toEqual([]);
  });

  it('avisa cuando la CANTIDAD difiere — el error que ninguna suma detecta', async () => {
    llm = llmQueVaria([
      extraccion({ items: [item({ quantity: 15 })] }),
      extraccion({ items: [item({ quantity: 16 })] }),
    ]);
    const res = await subir().expect(201);
    const avisos: string[] = res.body.extraction.warnings;
    expect(avisos.some((a) => a.includes('CANTIDAD'))).toBe(true);
    // Y explica por qué importa, que es lo que hace que alguien lo revise.
    expect(avisos.some((a) => a.includes('inventario'))).toBe(true);
  });

  it('avisa cuando el IVA difiere — falló en 3 de 4 corridas reales', async () => {
    llm = llmQueVaria([extraccion({ iva: 63620.71 }), extraccion({ iva: 63527.71 })]);
    const res = await subir().expect(201);
    expect((res.body.extraction.warnings as string[]).some((a) => a.includes('IVA'))).toBe(true);
  });

  it('conserva los avisos que la propia IA ya traía', async () => {
    llm = llmQueVaria([
      extraccion({ warnings: ['La línea 12 se ve borrosa'] }),
      extraccion({ items: [item({ quantity: 16 })], warnings: ['La línea 12 se ve borrosa'] }),
    ]);
    const res = await subir().expect(201);
    const avisos: string[] = res.body.extraction.warnings;
    expect(avisos.some((a) => a.includes('borrosa'))).toBe(true);
    expect(avisos.some((a) => a.includes('CANTIDAD'))).toBe(true);
  });

  it('SI LA SEGUNDA LECTURA FALLA, la factura se carga igual', async () => {
    // La garantía que hace seguro este cambio: es una ayuda, no un requisito.
    let n = 0;
    llm = {
      extractInvoice: async () => {
        n += 1;
        if (n === 2) throw new Error('la segunda corrida se cayó');
        return { modelUsed: 'fake-model', extraction: extraccion() };
      },
      complete: async () => ({ text: '', modelUsed: 'fake-model' }),
    };
    const res = await subir().expect(201);
    expect(res.body.extraction.total).toBe(398466.57);
    expect(res.body.extraction.warnings).toEqual([]);
    expect(res.body.photoStorageKey).toBeTruthy();
  });

  it('si falla la PRIMERA, sigue avisando con el mensaje de siempre', async () => {
    llm = {
      extractInvoice: async () => {
        throw new Error('sin llave');
      },
      complete: async () => ({ text: '', modelUsed: 'fake-model' }),
    };
    const res = await subir().expect(400);
    expect(res.body.message).toContain('La IA no pudo extraer la factura');
  });
});
