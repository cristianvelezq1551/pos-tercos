import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { z } from 'zod';
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

const PORT = Number(process.env.PRINT_AGENT_PORT ?? 9100);
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

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  try {
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
      const body = await readBody(req);
      const parsed = PrintBodySchema.safeParse(JSON.parse(body));
      if (!parsed.success) {
        json(res, 400, { error: parsed.error.flatten() });
        return;
      }
      const bytes = Buffer.from(parsed.data.escposBase64, 'base64');
      await sendBytes(bytes);
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
    // eslint-disable-next-line no-console
    console.error('[print-agent] error', err);
    json(res, 500, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[print-agent] listening on :${PORT}`);
});
