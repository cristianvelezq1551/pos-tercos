import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { assertRequiredEnv, isProd } from './common/assert-env';

async function bootstrap() {
  // Valida además que el entorno esté DECLARADO (APP_ENV/NODE_ENV conocido):
  // de eso cuelgan el CORS estricto, las cookies Secure y el piso de secretos.
  assertRequiredEnv();
  const IS_PROD = isProd();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Detrás del proxy de Railway/Cloudflare: confiar en X-Forwarded-For para que
  // el rate-limit (ThrottlerGuard) cuente por IP REAL del cliente y no por la
  // del proxy (si no, todos comparten un bucket y el throttle es evadible/DoS).
  //
  // §2.9: el nº de saltos es CONFIGURABLE. Con Cloudflare DELANTE de Railway hay
  // DOS proxies → `trust proxy 1` resolvería `req.ip` a la IP del edge de CF y
  // agruparía a TODOS los clientes en un bucket (auto-DoS del login). Verificar
  // `req.ip` real en QA y setear `TRUST_PROXY_HOPS` según la topología (1 = solo
  // Railway; 2 = Cloudflare→Railway). Default 1 (dev/sin CF proxied).
  const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? '1');
  app.set('trust proxy', Number.isFinite(trustProxyHops) && trustProxyHops > 0 ? trustProxyHops : 1);

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
  // El `true` (reflejar cualquier origen) es EXCLUSIVO de dev: atado a !IS_PROD
  // para que aunque el throw de arriba desapareciera, prod nunca pueda reflejar.
  app.enableCors({
    origin: corsOrigins.length ? corsOrigins : !IS_PROD,
    credentials: true,
  });

  // Graceful shutdown: Railway manda SIGTERM en cada deploy/restart. Sin esto,
  // Node muere de inmediato → las requests en vuelo se cortan con 5xx y
  // `PrismaService.onModuleDestroy` ($disconnect limpio) nunca corre. Con los
  // hooks, Nest drena el server HTTP y cierra Prisma dentro del grace period.
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3001);
  const host = process.env.API_HOST ?? '0.0.0.0';
  await app.listen(port, host);

  console.log(`[api] listening on http://localhost:${port}`);
}

void bootstrap();
