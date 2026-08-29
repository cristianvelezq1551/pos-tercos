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

  // Un ÚNICO socket de escucha para toda la suite.
  //
  // `app.init()` deja el servidor sin escuchar, y entonces supertest levanta y
  // cierra uno en un puerto efímero POR PETICIÓN. Con pocas peticiones no se
  // nota; con miles (la simulación financiera hace ~10.000) el sistema empieza
  // a reciclar puertos que quedaron en TIME_WAIT y alguna petición aterriza en
  // OTRO proceso que escuche en la máquina. El síntoma no se parece en nada a
  // la causa: un 404 con cuerpo vacío en una ruta que existe, o un 401 con el
  // cuerpo de error de una API ajena. Se persiguió como bug del backend hasta
  // que se vio que la petición nunca había llegado a la app.
  //
  // Escuchando una sola vez, supertest reutiliza ese servidor para todas las
  // peticiones. `app.close()` lo cierra.
  await new Promise<void>((resolve, reject) => {
    const server = app.getHttpServer() as {
      listen: (port: number, cb: () => void) => void;
      once: (evento: string, cb: (err: Error) => void) => void;
    };
    server.once('error', reject);
    server.listen(0, resolve);
  });

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
