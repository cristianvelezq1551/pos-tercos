/**
 * Impresión de prueba directa (sin pasar por el HTTP server) para validar el
 * driver USB. Carga apps/print-agent/.env (IDs USB) y manda un recibo corto.
 *
 *   pnpm -F @pos-tercos/print-agent test-print
 */
import { existsSync } from 'fs';
import { resolve } from 'path';

const envPath = resolve(process.cwd(), '.env');
if (existsSync(envPath) && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(envPath);
}

async function main(): Promise<void> {
  const { sendBytes } = await import('./printer-driver');
  const ticket =
    '\n' +
    '   *** PRUEBA TERCOS ***\n' +
    '   Print-agent OK\n' +
    `   ${new Date().toLocaleString('es-CO')}\n` +
    '\n\n\n';
  await sendBytes(Buffer.from(ticket, 'utf8'));
  console.log('PRINT_OK');
}

main().catch((e) => {
  console.error('PRINT_ERR:', e && e.message ? e.message : e);
  process.exit(1);
});
