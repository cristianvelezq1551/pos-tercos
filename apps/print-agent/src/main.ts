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

const PrintBodySchema = z.object({
  escposBase64: z.string().min(1),
});

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
      const bytes = Buffer.from(parsed.data.escposBase64, 'base64');
      await sendBytes(bytes);
      console.log(`[print-agent] ✓ impreso (${bytes.length} bytes)`);
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
