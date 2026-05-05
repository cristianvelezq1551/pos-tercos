import { DRAWER_KICK } from '@pos-tercos/domain';
import { mkdir, writeFile } from 'fs/promises';
import { join, resolve } from 'path';

/**
 * Driver de impresora. v1 viene en modo "log" — escribe los bytes a un
 * archivo `.bin` en `./tmp/print-out/` para inspección. Cuando llegue
 * el hardware se reemplaza este módulo por una integración real:
 *
 *  - Linux/Raspberry Pi: `/dev/usb/lp0` (kernel CUPS-less). escribir
 *    los bytes con `writeFile('/dev/usb/lp0', bytes)`.
 *  - Alternativa: `node-escpos` con USB driver (libusb).
 *
 * Mantenemos el contrato `sendBytes(bytes)` y `kickDrawer()` para que
 * el resto del agente (HTTP server) no cambie cuando se haga el swap.
 */

const PRINTER_DEVICE = process.env.PRINTER_DEVICE ?? null;
const FALLBACK_DIR = resolve(
  process.cwd(),
  process.env.PRINT_AGENT_LOG_DIR ?? './tmp/print-out',
);

export async function sendBytes(bytes: Buffer): Promise<void> {
  if (PRINTER_DEVICE) {
    // Modo prod: escribe directo al device. Permisos: el user que corre
    // el agente debe estar en el grupo `lp` (o tener ACL en udev).
    await writeFile(PRINTER_DEVICE, bytes);
    return;
  }
  // Modo dev/no-hw: dump a disco. El timestamp evita pisar entre prints.
  await mkdir(FALLBACK_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const path = join(FALLBACK_DIR, `${ts}.bin`);
  await writeFile(path, bytes);
  // eslint-disable-next-line no-console
  console.log(`[print-agent] no PRINTER_DEVICE set — wrote ${bytes.length}B to ${path}`);
}

export async function kickDrawer(): Promise<void> {
  await sendBytes(DRAWER_KICK);
}
