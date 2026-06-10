import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import supertest from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';

export interface AppContext {
  app: INestApplication;
  prisma: PrismaService;
  request: ReturnType<typeof supertest>;
}

export async function bootstrapApp(): Promise<AppContext> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.use(cookieParser());
  await app.init();

  const prisma = app.get(PrismaService);
  const request = supertest(app.getHttpServer());

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
