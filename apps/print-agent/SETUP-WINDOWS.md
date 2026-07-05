# Print Agent en Windows 11 — 2 impresoras térmicas USB + POS en Vercel

> Cómo imprimir desde el POS **desplegado en Vercel (HTTPS)** usando impresoras
> térmicas **USB conectadas a la PC del mostrador (Windows 11)**.

## Cómo funciona (importante entenderlo)

El POS corre en Vercel (la nube), pero **las impresoras son locales**. La nube
NO puede "ver" tu USB. La solución (ya implementada):

1. El **backend (Vercel)** solo **genera los bytes ESC/POS** del recibo/comanda.
2. El **navegador** del mostrador los descarga y los **POSTea a un agente local**
   (`print-agent`) que corre en ESA PC, en `http://localhost:9120`.
3. El agente manda los bytes **RAW** a la impresora de Windows por nombre
   (spooler Win32, sin drivers raros).

→ El print-agent **debe estar corriendo en la PC del mostrador**. El navegador
y el agente están en la misma máquina, así que `localhost` funciona aunque el
POS venga de Vercel por HTTPS.

## 1. Construir el .exe (desde la Mac)

```bash
pnpm -F @pos-tercos/print-agent package:win
# → apps/print-agent/dist/tercos-print-agent.exe
```

Copiá `tercos-print-agent.exe` a la PC Windows (ej. `C:\tercos\`).

## 2. Instalar las 2 impresoras en Windows

Conectá ambas térmicas por USB e instalalas como impresoras de Windows
(driver del fabricante o "Generic / Text Only"). Verificá los **nombres exactos**:

```powershell
Get-Printer | Select-Object Name
```

Anotá los nombres (ej. `EPSON TM-T20III Receipt`, `XP-58 Cocina`).

## 3. (Opcional) archivo `.env` junto al .exe

Para 2 impresoras ruteadas desde el POS **no hace falta `PRINTER_NAME`**. Solo
creás un `.env` si querés cambiar el puerto o el branding del recibo offline:

```
PRINT_AGENT_PORT=9120
# NO pongas PRINT_AGENT_SECRET para este setup (el POS no lo envía → 401).
# BUSINESS_NAME / BUSINESS_ADDRESS / BUSINESS_NIT / BUSINESS_PHONE → recibo offline
```

⚠️ En Windows, Notepad guarda como `.env.txt`. Debe llamarse exactamente `.env`.

## 4. Correr el agente

Doble clic al `.exe` (o desde una consola para ver los logs en vivo). Al
arrancar deja un log:

```
[print-agent] listening on :9120  (plataforma: win32)
[print-agent] log file → C:\tercos\print-agent.log
```

> Para que arranque solo al prender la PC: poné un acceso directo del .exe en
> `shell:startup`, o registralo como servicio (NSSM).

## 5. Configurar el ruteo en el POS

POS → **Configuración → Impresoras** → **Recargar**. Deberían aparecer las 2.
Asigná a cada una qué imprime y **Guardar**:

| Impresora | Marcar |
|---|---|
| La del cliente (80 mm) | ☑ Factura del cliente |
| La de cocina (58 mm) | ☑ Comanda de cocina (sin bebidas) — y/o Comanda completa |

La config se guarda **en esa PC** (localStorage). Cada terminal tiene la suya.

## 6. Probar

Hacé una venta y cobrá: sale la **comanda** al tocar *Cobrar* y la **factura** al
*Confirmar*. El cajón se abre si el pago fue en efectivo.

---

## Logs (para diagnosticar)

- **Agente (Windows):** `print-agent.log` junto al `.exe` — cada impresión deja
  línea con timestamp, impresora destino, bytes y ✓/✗. Abrilo y mandámelo si algo
  falla.
- **POS (navegador):** abrí DevTools (F12) → consola → escribí `__posLogs()` y
  Enter. Verás la secuencia de impresión paso a paso (también queda guardada
  aunque recargues). Los errores además se reportan al backend (`/client-logs`).

## Problemas típicos

| Síntoma | Causa probable | Solución |
|---|---|---|
| "No se pudo contactar la impresora local" | el agente no está corriendo, o el navegador bloqueó `localhost` | abrí `http://localhost:9120/health` en el navegador del mostrador; debe responder `{"ok":true}`. Si no, arrancá el .exe. |
| Imprime desde `localhost` pero NO desde el deploy de Vercel | **Private Network Access** (Chrome/Edge bloquean HTTPS→localhost) | ya resuelto: el agente devuelve `Access-Control-Allow-Private-Network: true`. Si persiste en una versión vieja de Chrome, habilitá `chrome://flags/#private-network-access-respect-preflight-results` o actualizá el navegador. |
| El agente responde 401 | `PRINT_AGENT_SECRET` está seteado en el `.env` | quitalo (el POS no envía el secret en este setup). |
| "No se detectaron impresoras" en el POS | el agente no corre, o `Get-Printer` no las lista | verificá que estén instaladas en Windows (`Get-Printer`). |
| Imprime en la impresora equivocada | nombres mal asignados | revisá Configuración → Impresoras; el nombre debe ser **idéntico** al de `Get-Printer`. |
| "No se pudo abrir la impresora 'X'" en el log | el nombre no coincide exacto | copialo tal cual de `Get-Printer | Select Name`. |
| Sale papel infinito / texto de prueba raro | la impresora no es ESC/POS o el driver agrega encabezados | instalala como **RAW / Generic Text**; el agente manda RAW puro. |
| El cajón no abre | el cajón va por la impresora de recibos (RJ-11) | el cajón se dispara con el pago en efectivo; verificá que la "Factura" esté asignada a la impresora que tiene el cajón conectado. |

## Seguridad

El agente escucha en el puerto local. Para este uso (1 PC, impresoras propias)
con CORS abierto alcanza. Si querés endurecerlo, se puede bindear a `127.0.0.1`
y/o exigir secret — pero entonces hay que pasarle el secret al POS (pendiente).
