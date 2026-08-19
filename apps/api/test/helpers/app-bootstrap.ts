import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import supertest from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { seedProductCategories } from './db-cleaner';

export interface AppContext {
  app: INestApplication;
  prisma: PrismaService;
  request: ReturnType<typeof supertest>;
}

/**
 * `configure` (opcional) permite a un test sustituir providers ANTES de compilar
 * (ej. mockear el LLM para no pegarle a Anthropic). Recibe el builder de Nest y
 * debe devolverlo encadenado.
 */
type ModuleBuilder = ReturnType<typeof Test.createTestingModule>;

export async function bootstrapApp(
  configure?: (builder: ModuleBuilder) => ModuleBuilder,
): Promise<AppContext> {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (configure) builder = configure(builder);
  const moduleFixture: TestingModule = await builder.compile();

  const app = moduleFixture.createNestApplication();
  app.use(cookieParser());
  await app.init();

  const prisma = app.get(PrismaService);
  const request = supertest(app.getHttpServer());

  // Reference data que los tests dan por sentada (crear producto exige categoría).
  await seedProductCategories(prisma);

  return { app, prisma, request };
}

/**
 * Login with a test user and return the Bearer token.
 */
export async function loginAs(
  request: ReturnType<typeof supertest>,
  email: string,
  password = 'dev12345',
): Promise<string> {
  const res = await request
    .post('/auth/login')
    .send({ email, password })
    .expect(200);

  return res.body.accessToken as string;
}
