import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { existsSync, readFileSync, readSync } from 'fs';
import { dirname, resolve } from 'path';
import { applyEnvPairs, parseEnvFile } from './env-file';
import { log, LOG_FILE } from './logger';

// Carga el `.env` (PRINTER_NAME / IDs USB / puerto) ANTES de leer env. Lo busca
// junto al ejecutable Y en el cwd (cuando es .exe, lo natural es ponerlo al lado
// del .exe). Parser manual de respaldo si esta versión de Node no trae
// process.loadEnvFile → así el .exe funciona en cualquier Node.
function loadEnv(): void {
  const candidates = [resolve(dirname(process.execPath), '.env'), resolve(process.cwd(), '.env')];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      if (typeof process.loadEnvFile === 'function') {
        process.loadEnvFile(path);
      } else {
        applyEnvPairs(parseEnvFile(readFileSync(path, 'utf8')), process.env);
      }
      console.log(`[print-agent] .env cargado desde: ${path}`);
    } catch (e) {
      console.log(`[print-agent] error leyendo ${path}: ${String(e)}`);
    }
    return; // primer .env encontrado gana
  }
  console.log(
    `[print-agent] ⚠ NO se encontró .env. Buscado en:\n` +
      candidates.map((c) => `   - ${c}`).join('\n') +
      `\n   Atención: en Windows, Notepad puede guardar el archivo como ".env.txt".` +
      `\n   Debe llamarse exactamente .env (sin .txt).`,
  );
}
loadEnv();

import { renderReceiptEscPos } from '@pos-tercos/domain';
import { allowedOrigins, isDangerouslyExposed, originOk, resolveHost, secretOk } from './auth';
import { createPrintQueue } from './print-queue';
import { businessFromEnv, DrawerBodySchema, PrintBodySchema } from './schemas';
import { sendBytes, kickDrawer, listPrinters } from './printer-driver';

const printQueue = createPrintQueue();

/**
 * Print Agent — servicio Node local que corre en la Raspberry Pi del
 * local conectada a la impresora térmica Epson TM-T20III via USB.
 *
 * Endpoints (HTTP local, no auth — sólo accesible desde la red interna):
 *   POST /print           body { escposBase64: string }
 *   POST /drawer-open     body {} (no payload)
 *   GET  /health          → { ok: true, name: 'print-agent', port }
 *
 * El backend NestJS (apps/api) habla con este agente vía
 * `EscPosPrinterAdapter` y `EscPosCashDrawerAdapter` (FASE 15.C).
 *
 * Auth: el dueño/dev se asegura de que el puerto NO esté expuesto a
 * internet — el firewall de la red local + Cloudflare Tunnel restringido
 * por subnet alcanza para v1.
 */

// 9120 por defecto: el 9100 lo usa Flutter DevTools y colisiona con el agent.
const PORT = Number(process.env.PRINT_AGENT_PORT ?? 9120);
const SHARED_SECRET = process.env.PRINT_AGENT_SECRET ?? null;

const HOST = resolveHost(SHARED_SECRET, process.env.PRINT_AGENT_HOST);

/**
 * Orígenes que pueden imprimir o abrir el cajón (ver auth.ts). Válvula de
 * escape: `PRINT_AGENT_ALLOW_ANY_ORIGIN=1` vuelve al comportamiento viejo
 * (cualquier página). Está para desatascar el mostrador en el momento, no
 * para dejarlo puesto — el arranque lo grita en el log.
 */
const ALLOWED_ORIGINS = allowedOrigins(process.env);
const ORIGIN_CHECK_OFF = process.env.PRINT_AGENT_ALLOW_ANY_ORIGIN === '1';

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

// El navegador de la caja (en otra origin: localhost:3004 o admin.tercos.co)
// le pega al agent en localhost → es cross-origin. Quién puede hacerlo lo
// decide la barrera de ORIGEN del handler; estas cabeceras solo permiten que
// el navegador LEA la respuesta.
function cors(res: ServerResponse, origin?: string): void {
  // Se hace ECO del origen que pidió en vez de '*': con '*' el navegador no
  // distingue la página de la caja de cualquier otra. Los GET (/health,
  // /printers) siguen abiertos a todos — no tienen efecto físico y romperlos
  // dejaría sin diagnóstico al mostrador.
  res.setHeader('Access-Control-Allow-Origin', origin ?? '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Agent-Secret');
  res.setHeader('Access-Control-Max-Age', '86400');
  // CRÍTICO para el POS servido por HTTPS (Vercel) pegándole a localhost:
  // Chrome/Edge aplican "Private Network Access" — un sitio público que llama a
  // una dirección privada (localhost) exige este header en el preflight, si no
  // BLOQUEA el request. Sin esto, imprimir desde el deploy de Vercel falla mudo.
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
}

function json(res: ServerResponse, status: number, body: unknown, origin?: string): void {
  cors(res, origin);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  const rawOrigin = req.headers.origin;
  const origin = Array.isArray(rawOrigin) ? rawOrigin[0] : rawOrigin;

  try {
    // Preflight CORS del navegador.
    if (req.method === 'OPTIONS') {
      cors(res, origin);
      res.writeHead(204);
      res.end();
      return;
    }

    // Barrera de ORIGEN, solo para lo que tiene efecto físico (POST: imprimir y
    // abrir el cajón). Va ANTES del secreto porque cubre un caso que el secreto
    // no puede cubrir: el navegador de la caja llama sin credencial, así que la
    // única forma de distinguir la página del POS de una página cualquiera es
    // de dónde viene. Un formulario `text/plain` se salta el preflight, por eso
    // se valida acá y no confiando en las cabeceras CORS.
    if (req.method === 'POST' && !ORIGIN_CHECK_OFF && !originOk(origin, ALLOWED_ORIGINS)) {
      log(
        `[print-agent] ✗ POST ${req.url} rechazado: origen "${origin ?? '(sin origen)'}" no autorizado. ` +
          `Si es una pantalla legítima del negocio, agrégala a PRINT_AGENT_ALLOWED_ORIGINS ` +
          `en el .env del agent (separadas por coma) y reinicia. Permitidos hoy: ` +
          `${ALLOWED_ORIGINS.join(', ')} + cualquier localhost.`,
      );
      json(
        res,
        403,
        {
          error:
            'Esta página no está autorizada a usar la impresora. ' +
            'Si es la caja del negocio, avisa al administrador.',
        },
        origin,
      );
      return;
    }

    // Auth via header X-Agent-Secret (timing-safe). Si no hay secret configurado,
    // el agent solo escucha en 127.0.0.1 (ver HOST) → no es alcanzable desde la red.
    if (!secretOk(req.headers['x-agent-secret'], SHARED_SECRET)) {
      json(res, 401, { error: 'invalid agent secret' }, origin);
      return;
    }

    if (req.method === 'GET' && req.url === '/health') {
      json(res, 200, { ok: true, name: 'print-agent', port: PORT }, origin);
      return;
    }

    // Lista de impresoras disponibles → el POS arma la config de ruteo.
    if (req.method === 'GET' && req.url === '/printers') {
      const list = await listPrinters();
      json(res, 200, list, origin);
      return;
    }

    if (req.method === 'POST' && req.url === '/print') {
      const origin = (req.headers['origin'] as string) ?? '-';
      log(`[print-agent] /print recibido (origin ${origin})`);
      const body = await readBody(req);
      const parsed = PrintBodySchema.safeParse(JSON.parse(body));
      if (!parsed.success) {
        log(`[print-agent] ✗ /print body inválido: ${JSON.stringify(parsed.error.flatten())}`);
        json(res, 400, { error: parsed.error.flatten() }, origin);
        return;
      }
      // Online: bytes ya renderizados por el backend. Offline: el recibo en
      // datos → el agent lo rinde acá (rellena el negocio desde su .env).
      const bytes = parsed.data.escposBase64
        ? Buffer.from(parsed.data.escposBase64, 'base64')
        : renderReceiptEscPos({
            ...parsed.data.receipt!,
            business: businessFromEnv(process.env),
          });
      const mode = parsed.data.escposBase64 ? 'bytes' : 'receipt';
      const dest = parsed.data.printer ?? '(.env)';
      const t0 = Date.now();
      try {
        await printQueue.enqueue(() => {
          log(`[print-agent] → enviando ${bytes.length}B a "${dest}" (modo ${mode})…`);
          return sendBytes(bytes, parsed.data.printer ?? null);
        });
      } catch (e) {
        log(
          `[print-agent] ✗ FALLO al imprimir en "${dest}" tras ${Date.now() - t0}ms: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`,
        );
        json(res, 500, { error: e instanceof Error ? e.message : String(e) }, origin);
        return;
      }
      log(`[print-agent] ✓ impreso en "${dest}" (${bytes.length}B, ${Date.now() - t0}ms)`);
      json(res, 200, { ok: true, bytesSent: bytes.length }, origin);
      return;
    }

    if (req.method === 'POST' && req.url === '/drawer-open') {
      const body = await readBody(req);
      const parsed = DrawerBodySchema.safeParse(body ? JSON.parse(body) : undefined);
      const printer = parsed.success ? (parsed.data?.printer ?? null) : null;
      log(`[print-agent] /drawer-open (impresora ${printer ?? '(.env)'})`);
      await printQueue.enqueue(() => kickDrawer(printer));
      json(res, 200, { ok: true }, origin);
      return;
    }

    json(res, 404, { error: 'not found' }, origin);
  } catch (err) {
    log(
      `[print-agent] ✗ error: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
    );
    json(
      res,
      500,
      {
        error: err instanceof Error ? err.message : String(err),
      },
      origin,
    );
  }
});

server.listen(PORT, HOST, () => {
  log(`[print-agent] listening on ${HOST}:${PORT}  (plataforma: ${process.platform})`);
  log(`[print-agent] log file → ${LOG_FILE}`);
  if (isDangerouslyExposed(SHARED_SECRET, HOST)) {
    log(
      `[print-agent] ⚠ SIN PRINT_AGENT_SECRET y escuchando en ${HOST} (red). ` +
        `Cualquier dispositivo de la LAN puede abrir el cajón/imprimir. ` +
        `Configura PRINT_AGENT_SECRET o deja HOST en 127.0.0.1.`,
    );
  }
  if (ORIGIN_CHECK_OFF) {
    log(
      '[print-agent] ⚠ PRINT_AGENT_ALLOW_ANY_ORIGIN=1 — CUALQUIER página web que ' +
        'abra el cajero puede imprimir y abrir el cajón. Es una válvula de escape ' +
        'temporal: quítala del .env apenas se resuelva el problema.',
    );
  } else {
    log(
      `[print-agent] orígenes autorizados a imprimir → ${ALLOWED_ORIGINS.join(', ')} + localhost`,
    );
  }
  log(
    `[print-agent] config → PRINTER_NAME=${process.env.PRINTER_NAME ?? '(vacío)'} | ` +
      `USB=${process.env.PRINTER_USB_VENDOR_ID ?? '-'}:${process.env.PRINTER_USB_PRODUCT_ID ?? '-'} | ` +
      `PRINTER_DEVICE=${process.env.PRINTER_DEVICE ?? '-'} | ` +
      `SECRET=${process.env.PRINT_AGENT_SECRET ? 'sí' : 'no'}`,
  );
  if (process.platform === 'win32' && !process.env.PRINTER_NAME) {
    log(
      '[print-agent] ⚠ Sin PRINTER_NAME en el .env. OK si el POS rutea por nombre ' +
        '(config de impresoras de la terminal); si no, no podrá imprimir.',
    );
  }
});

/**
 * Error fatal de arranque (puerto ocupado, excepción no atrapada): lo deja en el
 * log Y, si hay consola interactiva (doble clic), espera Enter ANTES de cerrar —
 * así la ventana NO "desaparece" y se puede leer el motivo. Como servicio (sin
 * consola) simplemente sale con el error ya registrado en print-agent.log.
 */
function fatal(context: string, err: unknown): never {
  const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
  log(`[print-agent] ✗ FATAL (${context}): ${msg}`);
  if (process.stdin.isTTY) {
    console.log('\n>>> El print-agent NO pudo arrancar (ver el error de arriba).');
    console.log('>>> Presiona Enter para cerrar esta ventana…');
    try {
      readSync(0, Buffer.alloc(1), 0, 1, null); // bloquea hasta Enter
    } catch {
      // sin stdin disponible — salir igual.
    }
  }
  process.exit(1);
}

/**
 * Puerto ocupado = ya hay un print-agent corriendo (instancia única: el puerto
 * ES el lock). NO es un error: esta copia sale LIMPIA con código 0 para que el
 * auto-reinicio del servicio no la trate como caída y entre en bucle. La que ya
 * está corriendo sigue atendiendo.
 */
function alreadyRunning(): never {
  log(
    `[print-agent] El puerto ${PORT} ya está en uso → ya hay un print-agent corriendo. ` +
      `Cierro esta copia (es normal). Verifica en http://localhost:${PORT}/health.`,
  );
  if (process.stdin.isTTY) {
    console.log('\n>>> Ya hay un print-agent corriendo (esto es normal).');
    console.log('>>> Presiona Enter para cerrar esta ventana…');
    try {
      readSync(0, Buffer.alloc(1), 0, 1, null);
    } catch {
      // sin stdin — salir igual.
    }
  }
  process.exit(0);
}

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') alreadyRunning();
  fatal('listen', err);
});

process.on('uncaughtException', (err) => fatal('uncaughtException', err));
process.on('unhandledRejection', (err) => fatal('unhandledRejection', err));
