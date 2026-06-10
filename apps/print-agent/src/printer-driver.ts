import { execFile } from 'child_process';
import { mkdir, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

/**
 * Driver de impresora térmica ESC/POS. Recibe bytes ya renderizados y los
 * manda a la impresora según el entorno:
 *
 * 1) Windows — `PRINTER_NAME` (nombre de la impresora instalada en Windows):
 *    imprime RAW por el spooler vía Win32 (PowerShell + winspool). Sin Zadig,
 *    sin módulos nativos. Es el modo recomendado en la PC del mostrador.
 *
 * 2) USB libusb — `PRINTER_USB_VENDOR_ID` + `PRINTER_USB_PRODUCT_ID`
 *    (macOS/Linux): abre la impresora USB directo con `usb` (carga perezosa,
 *    así el .exe de Windows no necesita el binario nativo).
 *
 * 3) `PRINTER_DEVICE` (Linux/Pi): escribe al device `/dev/usb/lp0`.
 *
 * 4) Sin nada (dev): dump a `./tmp/print-out/{ts}.bin`.
 *
 * Sin dependencias del monorepo (DRAWER_KICK inline) → empaquetable como exe.
 */

/** ESC p 0 50 50 — pulso de apertura del cajón monedero. */
const DRAWER_KICK = Buffer.from([0x1b, 0x70, 0x00, 0x32, 0x32]);

/** Lee la config del entorno EN CADA LLAMADA (el agent carga su .env tarde). */
function readConfig() {
  return {
    printerName: process.env.PRINTER_NAME ?? null,
    vendorId: process.env.PRINTER_USB_VENDOR_ID
      ? parseHexOrDec(process.env.PRINTER_USB_VENDOR_ID)
      : null,
    productId: process.env.PRINTER_USB_PRODUCT_ID
      ? parseHexOrDec(process.env.PRINTER_USB_PRODUCT_ID)
      : null,
    device: process.env.PRINTER_DEVICE ?? null,
    fallbackDir: resolve(
      process.cwd(),
      process.env.PRINT_AGENT_LOG_DIR ?? './tmp/print-out',
    ),
  };
}

export async function sendBytes(bytes: Buffer): Promise<void> {
  const cfg = readConfig();

  // Modo 1: Windows spooler RAW (recomendado en el mostrador).
  if (process.platform === 'win32' && cfg.printerName) {
    await writeWindowsRaw(cfg.printerName, bytes);
    return;
  }

  // Modo 2: USB directo (macOS/Linux) via libusb.
  if (cfg.vendorId !== null && cfg.productId !== null) {
    await writeUsb(cfg.vendorId, cfg.productId, bytes);
    return;
  }

  // Modo 3: device file (Linux).
  if (cfg.device) {
    await writeFile(cfg.device, bytes);
    return;
  }

  // En Windows, sin PRINTER_NAME no hay forma de imprimir → error claro
  // (en vez de "guardar a disco" silencioso que parece que no hace nada).
  if (process.platform === 'win32') {
    throw new Error(
      'Falta PRINTER_NAME en el .env (junto al .exe). Debe ser igual al nombre de Get-Printer | Select Name. ' +
        'Atención: el archivo debe llamarse .env (no .env.txt).',
    );
  }

  // Modo 4: dump a disco (dev sin hardware).
  await mkdir(cfg.fallbackDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const path = join(cfg.fallbackDir, `${ts}.bin`);
  await writeFile(path, bytes);
  console.log(
    `[print-agent] sin PRINTER_NAME/PRINTER_USB_*/PRINTER_DEVICE — ${bytes.length}B a ${path}`,
  );
}

export async function kickDrawer(): Promise<void> {
  await sendBytes(DRAWER_KICK);
}

// ====================================================================
// Windows: impresión RAW por el spooler (Win32 winspool vía PowerShell)
// ====================================================================

const PS_RAW_SCRIPT = String.raw`
param([Parameter(Mandatory=$true)][string]$Printer,[Parameter(Mandatory=$true)][string]$DataFile)
$ErrorActionPreference = 'Stop'
$bytes = [System.IO.File]::ReadAllBytes($DataFile)
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class TercosRawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct DOCINFO { [MarshalAs(UnmanagedType.LPWStr)] public string pDocName; [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile; [MarshalAs(UnmanagedType.LPWStr)] public string pDataType; }
  [DllImport("winspool.Drv", EntryPoint="OpenPrinterW", SetLastError=true, CharSet=CharSet.Unicode)] public static extern bool OpenPrinter(string src, out IntPtr h, IntPtr pd);
  [DllImport("winspool.Drv", EntryPoint="ClosePrinter")] public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterW", SetLastError=true, CharSet=CharSet.Unicode)] public static extern bool StartDocPrinter(IntPtr h, int level, ref DOCINFO di);
  [DllImport("winspool.Drv", EntryPoint="EndDocPrinter")] public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint="StartPagePrinter")] public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint="EndPagePrinter")] public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint="WritePrinter")] public static extern bool WritePrinter(IntPtr h, IntPtr buf, int count, out int written);
  public static void Send(string printer, byte[] data) {
    IntPtr h;
    if (!OpenPrinter(printer, out h, IntPtr.Zero)) throw new Exception("No se pudo abrir la impresora '" + printer + "'. Verificar el nombre exacto en Dispositivos e impresoras.");
    DOCINFO di = new DOCINFO(); di.pDocName = "Tercos Recibo"; di.pDataType = "RAW";
    try {
      if (!StartDocPrinter(h, 1, ref di)) throw new Exception("StartDocPrinter fallo");
      StartPagePrinter(h);
      IntPtr p = Marshal.AllocCoTaskMem(data.Length);
      try { Marshal.Copy(data, 0, p, data.Length); int w; if (!WritePrinter(h, p, data.Length, out w)) throw new Exception("WritePrinter fallo"); }
      finally { Marshal.FreeCoTaskMem(p); }
      EndPagePrinter(h); EndDocPrinter(h);
    } finally { ClosePrinter(h); }
  }
}
"@
[TercosRawPrinter]::Send($Printer, $bytes)
`;

async function writeWindowsRaw(printerName: string, bytes: Buffer): Promise<void> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const dataFile = join(tmpdir(), `tercos-print-${stamp}.bin`);
  const scriptFile = join(tmpdir(), `tercos-rawprint-${stamp}.ps1`);
  await writeFile(dataFile, bytes);
  await writeFile(scriptFile, PS_RAW_SCRIPT, 'utf8');
  try {
    await new Promise<void>((res, rej) => {
      execFile(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          scriptFile,
          '-Printer',
          printerName,
          '-DataFile',
          dataFile,
        ],
        { windowsHide: true, timeout: 15000 },
        (err, _stdout, stderr) => {
          if (err) rej(new Error(stderr?.trim() || err.message));
          else res();
        },
      );
    });
  } finally {
    await rm(dataFile, { force: true }).catch(() => undefined);
    await rm(scriptFile, { force: true }).catch(() => undefined);
  }
}

// ====================================================================
// USB libusb (macOS / Linux) — carga perezosa de `usb`
// ====================================================================

async function writeUsb(
  vendorId: number,
  productId: number,
  bytes: Buffer,
): Promise<void> {
  const hex = `0x${vendorId.toString(16)}:0x${productId.toString(16)}`;
  // Carga perezosa: el .exe de Windows no necesita el binario nativo de `usb`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { findByIds } = (await import('usb')) as any;
  const device = findByIds(vendorId, productId);
  if (!device) {
    throw new Error(`No se encontró la impresora USB ${hex}. ¿Conectada/encendida?`);
  }
  device.open();
  const iface = device.interface(0);
  try {
    if (typeof iface.isKernelDriverActive === 'function' && iface.isKernelDriverActive()) {
      iface.detachKernelDriver();
    }
  } catch {
    // macOS / sin permiso de detach — claim suele bastar.
  }
  iface.claim();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out = iface.endpoints.find((e: any) => e.direction === 'out');
  if (!out) {
    iface.release(true, () => undefined);
    device.close();
    throw new Error(`La impresora ${hex} no expone endpoint de salida.`);
  }
  try {
    await new Promise<void>((res, rej) =>
      out.transfer(bytes, (err: Error | undefined) => (err ? rej(err) : res())),
    );
  } finally {
    await new Promise<void>((res) => iface.release(true, () => res()));
    try {
      device.close();
    } catch {
      // ignore
    }
  }
}

function parseHexOrDec(s: string): number {
  const trimmed = s.trim();
  if (trimmed.startsWith('0x') || trimmed.startsWith('0X')) {
    return parseInt(trimmed, 16);
  }
  return parseInt(trimmed, 10);
}
