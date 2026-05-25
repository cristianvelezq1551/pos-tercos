import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { existsSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { z } from 'zod';

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
      `\n   ¡Ojo! En Windows, Notepad puede guardar el archivo como ".env.txt".` +
      `\n   Tiene que llamarse exactamente .env (sin .txt).`,
  );
}
loadEnv();

import { renderReceiptEscPos, type ReceiptData } from '@pos-tercos/domain';
import { sendBytes, kickDrawer } from './printer-driver';

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
  turnNumber: z.number().nullable(),
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
  })
  .refine((b) => Boolean(b.escposBase64) || Boolean(b.receipt), {
    message: 'Falta escposBase64 o receipt',
  });

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

    // Auth opcional via header X-Agent-Secret. Si SHARED_SECRET está
    // seteado en env, se exige; si no, se acepta cualquier request.
    if (SHARED_SECRET && req.headers['x-agent-secret'] !== SHARED_SECRET) {
      json(res, 401, { error: 'invalid agent secret' });
      return;
    }

    if (req.method === 'GET' && req.url === '/health') {
      json(res, 200, { ok: true, name: 'print-agent', port: PORT });
      return;
    }

    if (req.method === 'POST' && req.url === '/print') {
      console.log('[print-agent] /print recibido…');
      const body = await readBody(req);
      const parsed = PrintBodySchema.safeParse(JSON.parse(body));
      if (!parsed.success) {
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
      await sendBytes(bytes);
      const mode = parsed.data.escposBase64 ? 'bytes' : 'receipt';
      console.log(`[print-agent] ✓ impreso (${bytes.length} bytes, modo ${mode})`);
      json(res, 200, { ok: true, bytesSent: bytes.length });
      return;
    }

    if (req.method === 'POST' && req.url === '/drawer-open') {
      await kickDrawer();
      json(res, 200, { ok: true });
      return;
    }

    json(res, 404, { error: 'not found' });
  } catch (err) {
    console.error('[print-agent] error', err);
    json(res, 500, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

server.listen(PORT, () => {
  console.log(`[print-agent] listening on :${PORT}  (plataforma: ${process.platform})`);
  console.log(
    `[print-agent] config → PRINTER_NAME=${process.env.PRINTER_NAME ?? '(vacío)'} | ` +
      `USB=${process.env.PRINTER_USB_VENDOR_ID ?? '-'}:${process.env.PRINTER_USB_PRODUCT_ID ?? '-'} | ` +
      `PRINTER_DEVICE=${process.env.PRINTER_DEVICE ?? '-'}`,
  );
  if (process.platform === 'win32' && !process.env.PRINTER_NAME) {
    console.log(
      '[print-agent] ⚠ En Windows FALTA PRINTER_NAME en el .env → no va a imprimir. ' +
        'Agregá PRINTER_NAME=<nombre exacto> (Get-Printer | Select Name).',
    );
  }
});
