/**
 * Lista TODOS los dispositivos USB detectados por libusb (usb v2), con su
 * vendor/product ID listos para pegar en `.env`. Marca los candidatos a
 * impresora (clase printer).
 *
 *   pnpm -F @pos-tercos/print-agent list-usb
 */
import { getDeviceList } from 'usb';

function hex(n: number): string {
  return '0x' + n.toString(16).padStart(4, '0');
}

function main(): void {
  let devices;
  try {
    devices = getDeviceList();
  } catch (err) {
    console.error('Error consultando USB (¿libusb sin permisos?):', err);
    return;
  }

  if (!devices || devices.length === 0) {
    console.log('No se detectaron dispositivos USB.');
    return;
  }

  console.log('\nDispositivos USB detectados:\n');
  for (const d of devices) {
    const dd = d.deviceDescriptor;
    const cls = dd.bDeviceClass;
    // Clase 7 = printer; 0 = "por interfaz" (muchas térmicas son vendor-specific).
    const hint = cls === 7 ? '  ← IMPRESORA (clase printer)' : '';
    console.log(
      `  PRINTER_USB_VENDOR_ID=${hex(dd.idVendor)}  PRINTER_USB_PRODUCT_ID=${hex(dd.idProduct)}  (class ${cls})${hint}`,
    );
  }
  console.log(
    '\nIdentificar la impresora (probar conectar/desconectar para ver cuál cambia),\n' +
      'copiar esas 2 variables en apps/print-agent/.env y reiniciar el dev.\n',
  );
}

main();
