import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { existsSync, readFileSync, readSync } from 'fs';
import { timingSafeEqual } from 'crypto';
import { dirname, resolve } from 'path';
import { z } from 'zod';
import { log, LOG_FILE } from './logger';

// Carga el `.env` (PRINTER_NAME / IDs USB / puerto) ANTES de leer env. Lo busca
// junto al ejecutable Y en el cwd (cuando es .exe, lo natural es ponerlo al lado
// del .exe). Parser manual de respaldo si esta versión de Node no trae
// process.loadEnvFile → así el .exe funciona en cualquier Node.
function loadEnv(): void {
  const candidates = [
    resolve(dirname(process.execPath), '.env'),
    resolve(process.cwd(), '.env'),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      if (typeof process.loadEnvFile === 'function') {
        process.loadEnvFile(path);
      } else {
        for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
          if (line.trimStart().startsWith('#')) continue;
          const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
          if (!m) continue;
          const val = m[2].trim().replace(/^["']|["']$/g, '');
          if (process.env[m[1]] === undefined) process.env[m[1]] = val;
        }
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

import { renderReceiptEscPos, type ReceiptData } from '@pos-tercos/domain';
import { sendBytes, kickDrawer, listPrinters } from './printer-driver';

/**
 * Cola de impresión: procesa los /print y /drawer DE A UNO. El POS dispara
 * varios casi simultáneos (comanda cocina + comanda completa + factura ×N
 * impresoras); imprimir RAW en paralelo por el spooler de Windows puede trabar
 * o intercalar bytes. Serializar lo hace confiable.
 */
let printChain: Promise<void> = Promise.resolve();
function enqueuePrint<T>(work: () => Promise<T>): Promise<T> {
  const result = printChain.then(work);
  // La cadena nunca se rompe por un fallo de un trabajo (el siguiente sigue).
  printChain = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

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

/**
 * A qué interfaz escucha. FRONTERA DE SEGURIDAD real (el CORS `*` es obligatorio
 * para el Private Network Access de Chrome y NO protege nada). Regla fail-safe:
 *
 * - SIN `PRINT_AGENT_SECRET` → escucha SOLO en `127.0.0.1`: inalcanzable desde
 *   la LAN o desde cualquier web → nadie de la red puede abrir el cajón/imprimir.
 *   Sirve para el caso "agent en la misma PC que el navegador del POS".
 * - CON secret → escucha en toda la red (`0.0.0.0`) para el caso "agent en la Pi
 *   sirviendo tablets por LAN", pero cada request debe traer el secret válido.
 *
 * `PRINT_AGENT_HOST` permite forzar la interfaz explícitamente.
 */
const HOST = process.env.PRINT_AGENT_HOST ?? (SHARED_SECRET ? '0.0.0.0' : '127.0.0.1');

/** Compara el secret en tiempo constante (evita fuga por timing sobre la LAN). */
function secretOk(headerVal: string | string[] | undefined): boolean {
  if (!SHARED_SECRET) return true; // sin secret → auth off (protegido por HOST=127.0.0.1)
  const provided = Array.isArray(headerVal) ? headerVal[0] : headerVal;
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(SHARED_SECRET);
  if (a.length !== b.length) return false; // longitudes distintas: no llamar timingSafeEqual (lanza)
  return timingSafeEqual(a, b);
}

/**
 * Recibo en datos (sin `business`): el POS lo manda así cuando imprime
 * SIN backend (offline). El agent rinde los bytes ESC/POS con
 * `renderReceiptEscPos` y rellena el negocio desde su propio `.env`
 * (BUSINESS_*). Espeja `ReceiptData` de @pos-tercos/domain salvo `business`.
 */
const ModifierSchema = z.object({
  name: z.string(),
  priceDelta: z.number(),
});
const ReceiptItemSchema = z.object({
  productName: z.string(),
  sizeName: z.string().nullable(),
  quantity: z.number(),
  unitPrice: z.number(),
  lineSubtotal: z.number(),
  lineDiscount: z.number(),
  lineTotal: z.number(),
  appliedPromotionName: z.string().nullable(),
  modifiers: z.array(ModifierSchema),
});
const ReceiptInputSchema = z.object({
  receiptNumber: z.number(),
  provisionalNumber: z.string().nullable().optional(),
  createdAt: z.string(),
  cashierName: z.string().nullable(),
  customerName: z.string().nullable(),
  items: z.array(ReceiptItemSchema),
  subtotal: z.number(),
  discountTotal: z.number(),
  total: z.number(),
  reprintLabel: z.string().nullable(),
  openDrawer: z.boolean().optional(),
});

// El /print acepta DOS formas: bytes ya renderizados (online, vienen del
// backend) o el recibo en datos (offline, lo rinde el agent). Al menos una.
const PrintBodySchema = z
  .object({
    escposBase64: z.string().min(1).optional(),
    receipt: ReceiptInputSchema.optional(),
    // Impresora destino (nombre Windows). El POS rutea cada documento a la
    // impresora asignada; si falta, el agent usa la del .env.
    printer: z.string().min(1).nullable().optional(),
  })
  .refine((b) => Boolean(b.escposBase64) || Boolean(b.receipt), {
    message: 'Falta escposBase64 o receipt',
  });

const DrawerBodySchema = z
  .object({ printer: z.string().min(1).nullable().optional() })
  .optional();

/** Datos del negocio para el recibo offline — del .env del agent (misma PC). */
function businessFromEnv(): ReceiptData['business'] {
  return {
    name: process.env.BUSINESS_NAME ?? 'POS Tercos',
    address: process.env.BUSINESS_ADDRESS ?? 'Dirección por configurar',
    nit: process.env.BUSINESS_NIT ?? '900.000.000-0',
    phone: process.env.BUSINESS_PHONE ?? null,
  };
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

// El navegador del POS (en otra origin: localhost:3002 o el devtunnel https)
// le pega al agent en localhost → es cross-origin. Permitimos CORS amplio: el
// agent solo escucha local y la auth real es el secret opcional.
function cors(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Agent-Secret');
  res.setHeader('Access-Control-Max-Age', '86400');
  // CRÍTICO para el POS servido por HTTPS (Vercel) pegándole a localhost:
  // Chrome/Edge aplican "Private Network Access" — un sitio público que llama a
  // una dirección privada (localhost) exige este header en el preflight, si no
  // BLOQUEA el request. Sin esto, imprimir desde el deploy de Vercel falla mudo.
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
}

function json(res: ServerResponse, status: number, body: unknown): void {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  try {
    // Preflight CORS del navegador.
    if (req.method === 'OPTIONS') {
      cors(res);
      res.writeHead(204);
      res.end();
      return;
    }

    // Auth via header X-Agent-Secret (timing-safe). Si no hay secret configurado,
    // el agent solo escucha en 127.0.0.1 (ver HOST) → no es alcanzable desde la red.
    if (!secretOk(req.headers['x-agent-secret'])) {
      json(res, 401, { error: 'invalid agent secret' });
      return;
    }

    if (req.method === 'GET' && req.url === '/health') {
      json(res, 200, { ok: true, name: 'print-agent', port: PORT });
      return;
    }

    // Lista de impresoras disponibles → el POS arma la config de ruteo.
    if (req.method === 'GET' && req.url === '/printers') {
      const list = await listPrinters();
      json(res, 200, list);
      return;
    }

    if (req.method === 'POST' && req.url === '/print') {
      const origin = (req.headers['origin'] as string) ?? '-';
      log(`[print-agent] /print recibido (origin ${origin})`);
      const body = await readBody(req);
      const parsed = PrintBodySchema.safeParse(JSON.parse(body));
      if (!parsed.success) {
        log(`[print-agent] ✗ /print body inválido: ${JSON.stringify(parsed.error.flatten())}`);
        json(res, 400, { error: parsed.error.flatten() });
        return;
      }
      // Online: bytes ya renderizados por el backend. Offline: el recibo en
      // datos → el agent lo rinde acá (rellena el negocio desde su .env).
      const bytes = parsed.data.escposBase64
        ? Buffer.from(parsed.data.escposBase64, 'base64')
        : renderReceiptEscPos({
            ...parsed.data.receipt!,
            business: businessFromEnv(),
          });
      const mode = parsed.data.escposBase64 ? 'bytes' : 'receipt';
      const dest = parsed.data.printer ?? '(.env)';
      const t0 = Date.now();
      try {
        await enqueuePrint(() => {
          log(`[print-agent] → enviando ${bytes.length}B a "${dest}" (modo ${mode})…`);
          return sendBytes(bytes, parsed.data.printer ?? null);
        });
      } catch (e) {
        log(`[print-agent] ✗ FALLO al imprimir en "${dest}" tras ${Date.now() - t0}ms: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
        json(res, 500, { error: e instanceof Error ? e.message : String(e) });
        return;
      }
      log(`[print-agent] ✓ impreso en "${dest}" (${bytes.length}B, ${Date.now() - t0}ms)`);
      json(res, 200, { ok: true, bytesSent: bytes.length });
      return;
    }

    if (req.method === 'POST' && req.url === '/drawer-open') {
      const body = await readBody(req);
      const parsed = DrawerBodySchema.safeParse(body ? JSON.parse(body) : undefined);
      const printer = parsed.success ? (parsed.data?.printer ?? null) : null;
      log(`[print-agent] /drawer-open (impresora ${printer ?? '(.env)'})`);
      await enqueuePrint(() => kickDrawer(printer));
      json(res, 200, { ok: true });
      return;
    }

    json(res, 404, { error: 'not found' });
  } catch (err) {
    log(`[print-agent] ✗ error: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
    json(res, 500, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

server.listen(PORT, HOST, () => {
  log(`[print-agent] listening on ${HOST}:${PORT}  (plataforma: ${process.platform})`);
  log(`[print-agent] log file → ${LOG_FILE}`);
  if (!SHARED_SECRET && HOST !== '127.0.0.1' && HOST !== 'localhost') {
    log(
      `[print-agent] ⚠ SIN PRINT_AGENT_SECRET y escuchando en ${HOST} (red). ` +
        `Cualquier dispositivo de la LAN puede abrir el cajón/imprimir. ` +
        `Configurá PRINT_AGENT_SECRET o dejá HOST en 127.0.0.1.`,
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
    console.log('>>> Presioná Enter para cerrar esta ventana…');
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
      `Cierro esta copia (es normal). Verificá en http://localhost:${PORT}/health.`,
  );
  if (process.stdin.isTTY) {
    console.log('\n>>> Ya hay un print-agent corriendo (esto es normal).');
    console.log('>>> Presioná Enter para cerrar esta ventana…');
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
