import { DRAWER_KICK } from '@pos-tercos/domain';
import { mkdir, writeFile } from 'fs/promises';
import { join, resolve } from 'path';

/**
 * Driver de impresora térmica ESC/POS.
 *
 * 3 modos según env:
 *
 * 1) `PRINTER_USB_VENDOR_ID` + `PRINTER_USB_PRODUCT_ID` (recomendado en
 *    macOS): abre la impresora USB directamente con libusb (escpos-usb)
 *    sin pasar por CUPS. Bypassea cualquier driver. Es la única forma
 *    confiable para térmicas como STMicroelectronics POS58 que no
 *    exponen device serial en macOS.
 *
 * 2) `PRINTER_DEVICE` (Linux/Raspberry Pi): escribe directo al device
 *    `/dev/usb/lp0` o similar. Más simple pero requiere kernel module
 *    `usblp` (estándar en Linux, no existe en macOS).
 *
 * 3) Sin ninguno (dev): dump a `./tmp/print-out/{ts}.bin` para
 *    inspección manual.
 *
 * El contrato `sendBytes(bytes)` y `kickDrawer()` no cambia entre
 * modos — el HTTP server (main.ts) no necesita saber cuál se usa.
 */

const VENDOR_ID = process.env.PRINTER_USB_VENDOR_ID
  ? parseHexOrDec(process.env.PRINTER_USB_VENDOR_ID)
  : null;
const PRODUCT_ID = process.env.PRINTER_USB_PRODUCT_ID
  ? parseHexOrDec(process.env.PRINTER_USB_PRODUCT_ID)
  : null;
const PRINTER_DEVICE = process.env.PRINTER_DEVICE ?? null;
const FALLBACK_DIR = resolve(
  process.cwd(),
  process.env.PRINT_AGENT_LOG_DIR ?? './tmp/print-out',
);

/** Adapter shape compatible con `escpos-usb`. */
type UsbAdapter = {
  open(cb: (err: Error | null) => void): void;
  write(data: Buffer, cb?: (err: Error | null) => void): void;
  close(): void;
};

async function openUsbDevice(): Promise<UsbAdapter | null> {
  if (VENDOR_ID === null || PRODUCT_ID === null) return null;
  // Import dinámico para que el agent siga arrancando aunque libusb
  // no esté disponible en este entorno (CI, dev sin permisos, etc.).
  const mod = await import('escpos-usb');
  // escpos-usb exporta `default` (CJS) o named (ESM) según versión.
  const UsbClass = (mod as unknown as { default?: unknown }).default ?? mod;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Ctor = UsbClass as any;
  return new Ctor(VENDOR_ID, PRODUCT_ID) as UsbAdapter;
}

export async function sendBytes(bytes: Buffer): Promise<void> {
  // Modo 1: USB directo via libusb (siempre abre/cierra fresco — la POS58
  // no soporta múltiples writes por handle sin reset en macOS).
  if (VENDOR_ID !== null && PRODUCT_ID !== null) {
    const device = await openUsbDevice();
    if (!device) {
      throw new Error('escpos-usb device init returned null');
    }
    await new Promise<void>((resolveFn, rejectFn) => {
      device.open((openErr) => {
        if (openErr) {
          rejectFn(openErr);
          return;
        }
        device.write(bytes, (writeErr) => {
          try {
            device.close();
          } catch {
            // ignore close errors
          }
          if (writeErr) rejectFn(writeErr);
          else resolveFn();
        });
      });
    });
    return;
  }

  // Modo 2: device file (Linux)
  if (PRINTER_DEVICE) {
    await writeFile(PRINTER_DEVICE, bytes);
    return;
  }

  // Modo 3: dump a disco (dev sin hardware)
  await mkdir(FALLBACK_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const path = join(FALLBACK_DIR, `${ts}.bin`);
  await writeFile(path, bytes);
  // eslint-disable-next-line no-console
  console.log(
    `[print-agent] no PRINTER_USB_* ni PRINTER_DEVICE — wrote ${bytes.length}B to ${path}`,
  );
}

export async function kickDrawer(): Promise<void> {
  await sendBytes(DRAWER_KICK);
}

function parseHexOrDec(s: string): number {
  const trimmed = s.trim();
  if (trimmed.startsWith('0x') || trimmed.startsWith('0X')) {
    return parseInt(trimmed, 16);
  }
  return parseInt(trimmed, 10);
}
