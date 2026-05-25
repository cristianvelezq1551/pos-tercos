# Tercos Print Agent

Servicio local minúsculo que recibe bytes **ESC/POS** y los manda a la
impresora térmica. **Corre en la misma PC que la impresora** (el mostrador).

El navegador del POS pide el recibo al backend (`GET /sales/:id/escpos`) y le
manda los bytes a **este agent en `localhost:9120`**. Así la impresora **no
depende de que el backend la alcance** — imprime aunque la API esté remota.

> No usa el diálogo de impresión del navegador (manda bytes crudos con corte
> incluido) → nada de "papel infinito".

---

## Windows — la forma simple (un .exe, doble clic)

**No necesitás instalar Node ni saber comandos.**

1. **Instalá la impresora en Windows** (con su driver, o el genérico
   "Generic / Text Only"). Anotá su **nombre exacto**. Para verlo, abrí
   PowerShell y corré:
   ```powershell
   Get-Printer | Select-Object Name
   ```
   (ej: `POS58 Printer`)

2. **Copiá 2 archivos** a una carpeta de la PC Windows (ej. `C:\Tercos\`):
   - `tercos-print-agent.exe`  (se genera en `dist/`, te lo paso)
   - un archivo de texto llamado **`.env`** con esto adentro:
     ```
     PRINT_AGENT_PORT=9120
     PRINTER_NAME=POS58 Printer
     ```
     ⚠️ `PRINTER_NAME` debe ser **idéntico** al del paso 1 (mayúsculas/espacios).

3. **Doble clic en `tercos-print-agent.exe`.** Se abre una ventana negra que
   dice `listening on :9120`. **Dejala abierta** (es el servicio).

4. **Probá**: en el POS, tocá **"Recibo"** en el historial → sale el papel. 🎉

### Que arranque solo al prender la PC
Apretá `Win+R`, escribí `shell:startup`, Enter. Pegá ahí un **acceso directo**
al `.exe`. Listo: arranca con Windows.

### Si dice "No se pudo abrir la impresora"
El `PRINTER_NAME` no coincide. Copialo EXACTO de `Get-Printer | Select Name`.

---

## Generar / regenerar el .exe (desde la Mac)
```bash
pnpm -F @pos-tercos/print-agent package:win
# → apps/print-agent/dist/tercos-print-agent.exe   (copialo a la PC Windows)
```

## macOS / Linux (dev, USB libusb)
`.env` con los IDs USB (`pnpm -F @pos-tercos/print-agent list-usb` para verlos):
```
PRINTER_USB_VENDOR_ID=0x0416
PRINTER_USB_PRODUCT_ID=0x5011
```
- `pnpm -F @pos-tercos/print-agent test-print` → imprime un ticket de prueba.
- Con `pnpm dev` (raíz) el agent ya levanta en `:9120`.

## Endpoints
- `GET /health` · `POST /drawer-open`
- `POST /print` — acepta **`{escposBase64}`** (bytes ya renderizados, camino
  online del backend) **o `{receipt}`** (el recibo en datos: el agent lo rinde con
  `renderReceiptEscPos` y rellena el negocio desde su `.env` → impresión **sin
  backend**, offline).

## POS
El navegador apunta a `http://localhost:9120` por defecto. Para cambiarlo,
seteá `NEXT_PUBLIC_PRINT_AGENT_URL` en el `.env.local` del POS.
