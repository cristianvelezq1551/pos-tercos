import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { assertRequiredEnv } from './common/assert-env';

const IS_PROD = process.env.NODE_ENV === 'production';

async function bootstrap() {
  assertRequiredEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Detrás del proxy de Railway/Cloudflare: confiar en X-Forwarded-For para que
  // el rate-limit (ThrottlerGuard) cuente por IP REAL del cliente y no por la
  // del proxy (si no, todos comparten un bucket y el throttle es evadible/DoS).
  app.set('trust proxy', 1);

  // Headers de seguridad. `crossOriginResourcePolicy: false` porque servimos
  // imágenes (menú, recibos) que las apps consumen cross-origin.
  app.use(helmet({ crossOriginResourcePolicy: false }));

  app.use(cookieParser());

  // Tope al body JSON: los endpoints públicos (POST /web/orders) aceptan
  // payloads sin que un cliente pueda inflar memoria/CPU del parser. Las cargas
  // de factura van por Multer (multipart, su propio límite de 10MB), no por acá.
  app.useBodyParser('json', { limit: '256kb' });

  // CORS: en prod EXIGIMOS allowlist explícita. Reflejar cualquier origen con
  // credenciales (origin:true) sería CSRF/robo de sesión cross-site.
  const corsOrigins = (process.env.CORS_ORIGINS ?? '').split(',').filter(Boolean);
  if (IS_PROD && corsOrigins.length === 0) {
    throw new Error(
      'CORS_ORIGINS es obligatorio en producción (allowlist de orígenes separada por comas).',
    );
  }
  app.enableCors({
    origin: corsOrigins.length ? corsOrigins : true,
    credentials: true,
  });

  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3001);
  const host = process.env.API_HOST ?? '0.0.0.0';
  await app.listen(port, host);

  console.log(`[api] listening on http://localhost:${port}`);
}

void bootstrap();
