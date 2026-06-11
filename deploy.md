# Deploy POS Tercos — checklist v2

> **Quién lo lee:** vos (dueño / dev) cuando arme la prod por primera
> vez. Doc self-contained — todo lo que el deploy necesita está acá.
> Refleja la reorientación v2: sin delivery/Mapbox, KDS en Flutter,
> WhatsApp automático vía OpenWA, print-agent en :9120.
>
> **Pre-requisitos cumplidos** (ver `pendientes-externos-y-deploy.md`):
> - Cuenta Cloudflare R2 + bucket `pos-tercos-prod`.
> - Cuentas Railway + Vercel + Cloudflare DNS.
> - Gateway OpenWA self-hosted (VPS o máquina local) con número de
>   WhatsApp propio del negocio — ver `openwa-setup.md`.
> - Hardware local: tablet/PC POS, tablet Android para KDS (Flutter APK),
>   Raspberry Pi o mini-PC para Print Agent, impresora Epson TM-T20III
>   + cajón monedero RJ-11.

---

## 1. Backend en Railway

### 1.1 Crear servicios

```
- pos-tercos-api (Web Service, Dockerfile-less con pnpm)
- pos-tercos-db (PostgreSQL 16, plan Hobby al menos)
```

`pos-tercos-api` Build settings:
- Root directory: `apps/api`
- Build command: `pnpm install --frozen-lockfile && pnpm prisma generate && pnpm build`
- Start command: `pnpm prisma migrate deploy && pnpm start`

> El `migrate deploy` del start command aplica **todas** las migrations
> pendientes en orden. Ver §5 para el detalle de las que entran en un
> deploy cold (incluye toda la reorientación v2 + FIFO + nómina v2 +
> pagos + inventario de subproductos + conteos físicos).

### 1.2 Variables de entorno (api)

> El API valida al ARRANQUE (`apps/api/src/common/assert-env.ts`) que
> existan `DATABASE_URL`, `JWT_ACCESS_SECRET` y `JWT_REFRESH_SECRET`
> siempre, y `WEB_ORDER_TOKEN_SECRET` cuando `NODE_ENV=production`.
> Si falta alguna, el proceso muere al boot con mensaje claro.

**Runtime:**
- `NODE_ENV=production`
- `TZ=America/Bogota` — **obligatoria**: el reset diario de turnos y los
  crons (digest 21:30, purga idempotency 3 AM, gap-check 4 AM, scan de
  sugerencias horario) usan hora local del server.

**Database:**
- `DATABASE_URL=${{Postgres.DATABASE_URL}}` (Railway internal)

**Auth:**
- `JWT_ACCESS_SECRET` — random 64 bytes (`openssl rand -hex 64`)
- `JWT_REFRESH_SECRET` — random 64 bytes distinto
- `WEB_ORDER_TOKEN_SECRET` — random 64 bytes distinto (requerida en prod)

**LLM:**
- `ANTHROPIC_API_KEY=sk-ant-...` (primary — facturas IA, análisis de
  cierre, digest, sugerencias)
- `OPENAI_API_KEY=sk-...` (fallback, opcional)
- `LLM_PROVIDER=anthropic`

**Storage R2:**
- `STORAGE_PROVIDER=r2`
- `R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com`
- `R2_ACCESS_KEY_ID=...`
- `R2_SECRET_ACCESS_KEY=...`
- `R2_BUCKET=pos-tercos-prod`
- `R2_PUBLIC_URL_BASE=https://media.tercos.co` (opcional, custom domain CF)

**WhatsApp automático (OpenWA self-hosted — ver `openwa-setup.md`):**
- `OPENWA_URL=https://<gateway-openwa>` — URL del gateway
- `OPENWA_API_KEY=...` — API key del gateway
- `OPENWA_SESSION_ID=tercos` — ID de sesión
- `OWNER_WHATSAPP_PHONE=+57XXXXXXXXXX` — E.164; recibe el **digest
  diario 21:30** y las **alertas antifraude** (descuadre de caja, etc.)

> Sin las 3 vars `OPENWA_*` el backend instancia `MockWhatsAppAdapter`
> (loggea, no envía). En prod TIENEN que estar las 3 para que salgan
> las notificaciones al cliente y al dueño.

**Negocio (mensajes WhatsApp + recibos):**
- `BUSINESS_NAME=Tercos`
- `BUSINESS_ADDRESS=Cra 43A # 11-12, Medellín` (recibo impreso)
- `BUSINESS_ADDRESS_SHORT=Cra 43A # 11-12` (mensaje "listo para retirar")

**Pagos (instrucciones que recibe el cliente web por WhatsApp):**
- `PAYMENT_INSTRUCTIONS_NEQUI=3001234567`
- `PAYMENT_INSTRUCTIONS_TRANSFER=Bancolombia ahorros 12345...`

**Print Agent:**
- `PRINTER_PROVIDER=escpos`
- `PRINT_AGENT_URL=http://<host-agent>:9120` (puerto default **9120** —
  el 9100 colisiona con Flutter DevTools; el agent no está expuesto a
  internet — ver §3.4)
- `PRINT_AGENT_SECRET=...` (matches el agent)

**Throttler / Throttling (default ya en código).**

### 1.3 Health check

`GET /health` debe responder 200. Railway lo usa como liveness.

---

## 2. Frontends en Vercel

**4 proyectos** Next.js, cada uno con su domain:
- `admin.tercos.co` → `apps/admin`
- `pos.tercos.co` → `apps/pos`
- `display.tercos.co` → `apps/public-display`
- `tercos.co` → `apps/web` (público)

> El KDS ya **NO** se despliega en Vercel: es `apps/kds-flutter`,
> app nativa Android. Ver §2.2.

Build settings (cada uno):
- Framework: Next.js
- Root directory: `apps/<name>`
- Build command: `cd ../.. && pnpm install --frozen-lockfile && pnpm -F @pos-tercos/<name> build`
- Output directory: `.next`

### 2.1 Variables de entorno

**Todos (server-side fetch + rewrites `/api/*`):**
- `API_INTERNAL_URL=https://api.tercos.co`

**Admin y POS (verify JWT en edge middleware):**
- `JWT_ACCESS_SECRET` — mismo valor que el API

**POS:**
- `NEXT_PUBLIC_API_WS_URL=wss://api.tercos.co` (socket.io `/ws/pos`)
- `NEXT_PUBLIC_PRINT_AGENT_URL=http://<host-agent>:9120` — el navegador
  del POS le habla **directo** al print-agent en la red del local
  (default `http://localhost:9120` si el agent corre en la misma PC
  del mostrador). Necesario para impresión offline.

**Web pública:**
- `NEXT_PUBLIC_BUSINESS_NAME=Tercos`
- `NEXT_PUBLIC_INSTAGRAM_URL=...` (opcional, footer)
- `NEXT_PUBLIC_TIKTOK_URL=...` (opcional, footer)

**Pantalla pública:**
- `NEXT_PUBLIC_API_URL=https://api.tercos.co` (el browser abre el
  `EventSource` SSE directo contra el API)

### 2.2 KDS Flutter (tablet Android)

No va en Vercel. Se compila APK y se instala directo en la tablet:

1. Editar `apps/kds-flutter/lib/app/core/config/app_config.dart`:
   - `API_BASE_URL=https://api.tercos.co`
   - `WS_URL=wss://api.tercos.co` (namespace `/ws/kds`)
   Las URLs quedan **compiladas en el build**.
2. `cd apps/kds-flutter && flutter build apk --release`
3. Instalar el APK en la tablet de cocina (sideload o MDM).
4. Login con el user `cocinero` de prod.

---

## 3. Print Agent en Raspberry Pi (o mini-PC del mostrador)

### 3.1 Hardware

- Raspberry Pi 4 (2GB RAM mínimo) o la misma PC del POS.
- Cable USB-A → USB-B (conecta el host a la Epson TM-T20III).
- Cable Ethernet o Wi-Fi del local.
- Cable RJ-11 entre cajón monedero y la impresora (NO al host).
- Fuente de poder Pi (5V/3A oficial) si es Pi.

### 3.2 Instalación

```bash
# En el host (ej. Raspberry Pi OS Lite)
sudo apt update && sudo apt install -y nodejs pnpm git
git clone <repo> /opt/pos-tercos
cd /opt/pos-tercos
pnpm install --frozen-lockfile
pnpm -F @pos-tercos/print-agent build

# Permisos USB para acceder a la impresora sin sudo
sudo usermod -aG lp pi
sudo udevadm control --reload-rules
# Reboot necesario para que el grupo lp tome efecto.
```

### 3.3 Servicio systemd

Archivo `/etc/systemd/system/print-agent.service`:

```ini
[Unit]
Description=POS Tercos Print Agent
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/opt/pos-tercos/apps/print-agent
ExecStart=/usr/bin/node /opt/pos-tercos/apps/print-agent/dist/main.js
Restart=on-failure
Environment=PRINT_AGENT_PORT=9120
Environment=PRINT_AGENT_SECRET=<generar random hex 32>
Environment=PRINTER_DEVICE=/dev/usb/lp0

[Install]
WantedBy=multi-user.target
```

> Puerto default **9120** (el código usa `PRINT_AGENT_PORT ?? 9120`;
> NO usar 9100 — colisiona con Flutter DevTools en dev y conviene
> mantener el mismo puerto en todos lados).

Activar:
```bash
sudo systemctl daemon-reload
sudo systemctl enable print-agent
sudo systemctl start print-agent
sudo systemctl status print-agent
```

### 3.4 Conectividad

Dos clientes le pegan al agent:

1. **El navegador del POS** (camino principal, incluida la impresión
   offline): `NEXT_PUBLIC_PRINT_AGENT_URL` apunta al agent por la red
   del local (`http://localhost:9120` si corre en la misma PC del
   mostrador, o la IP LAN del host).
2. **El backend en Railway** (`PRINT_AGENT_URL`): el agent no es
   alcanzable desde internet, así que hay dos opciones:
   - **Cloudflare Tunnel** (recomendado): instalar `cloudflared` en el
     host y exponer `http://localhost:9120` como `printer.tercos.co`
     con acceso restringido al backend de Railway.
   - **VPN simple** (Tailscale): el host y Railway en la misma tailnet;
     `PRINT_AGENT_URL` apunta a la IP Tailscale (`http://<ip>:9120`).

---

## 4. DNS Cloudflare

```
A    api.tercos.co       → Railway IP (proxy on)
A    admin.tercos.co     → Vercel    (proxy on)
A    pos.tercos.co       → Vercel    (proxy on)
A    display.tercos.co   → Vercel    (proxy on)
A    tercos.co           → Vercel    (proxy on)
A    media.tercos.co     → R2 custom domain (CF Workers)
A    printer.tercos.co   → CF Tunnel al host del agent (si se usa esa opción)
```

> No existe `kds.tercos.co` — el KDS es app Flutter nativa en la tablet.

SSL: "Full (strict)" en CF. Vercel y Railway entregan certs válidos.

---

## 5. Migrations en producción

`prisma migrate deploy` corre **en el start command** del servicio
Railway (§1.1) y aplica todas las pendientes automáticamente en cada
deploy. Para correrlo a mano:

```bash
# Conectado al postgres de Railway
DATABASE_URL=$RAILWAY_DB pnpm -F @pos-tercos/api prisma migrate deploy
```

Desde la última edición de este doc (que listaba 4 pendientes de FASE
12/14) entraron **~20 migrations nuevas**, agrupadas por bloque:

- **Reorientación v2**: `remove_delivery_repartidor`,
  `whatsapp_messages`, `add_sale_item_notes`,
  `turn_numbering_and_call_queue`, `recipe_per_variant`
- **Cajero v2.1**: `product_sold_out`, `sale_void_reason`,
  `cash_movements_and_arqueo`
- **Costeo FIFO**: `fifo_unit_cost`
- **Nómina v2**: `employment_fields_drop_commissions`,
  `payroll_paytype`, `payroll_weekly_and_rest_days`,
  `payroll_payment_periods`, `payroll_payments`
- **Costos fijos y pagos**: `fixed_costs`, `invoice_payments`,
  `fixed_cost_payments`
- **Inventario de producción**: `subproduct_inventory`,
  `subproduct_inventory_use` (ver cold start §6.bis)
- **Conteo físico**: `stock_counts`

> No hace falta enumerarlas en cada deploy: `migrate deploy` es
> idempotente y aplica solo las que falten, en orden.

---

## 6. Smoke test post-deploy

1. `GET https://api.tercos.co/health` → `{ ok: true }`.
2. `GET https://api.tercos.co/web/menu` → JSON con productos públicos.
3. Login en `admin.tercos.co` con un user real (cambiar contraseñas de
   seed antes).
4. **Venta COUNTER**: abrir caja en `pos.tercos.co` (efectivo de
   apertura) → vender un producto → cobrar CASH → la venta recibe
   **turno** (#1 de la caja) y el recibo sale por el print-agent
   (papel + cajón abre).
5. **KDS**: la orden aparece en la tablet Flutter → "Iniciar" →
   "Marcar listo" → entra a la cola "Por llamar" del POS (campana).
6. **Turnero**: llamar el turno desde el POS → `display.tercos.co`
   muestra el número con flash + campana. Marcar entregado.
7. **Pedido web**: hacer pedido en `tercos.co` → el cliente recibe
   **automáticamente** las instrucciones de pago por WhatsApp (OpenWA;
   verificar fila `sent` en `whatsapp_messages`) → el pedido aparece en
   el modal de pedidos web del POS.
8. **Confirmar pago** del pedido web en el POS → WhatsApp "pago
   recibido" automático → orden entra al KDS → "Marcar listo" →
   WhatsApp "listo para retirar" automático → el tracking en
   `tercos.co/checkout/success/[id]?token=` refleja cada estado.
9. **Conteo físico**: en admin `/inventory/counts` crear un conteo de
   un insumo → verificar que el ajuste compensatorio aparece en
   `/inventory/movements`.
10. **Digest del dueño**: `POST https://api.tercos.co/reports/admin/send-daily-digest`
    (Dueño) → llega el resumen al `OWNER_WHATSAPP_PHONE`. (El cron
    automático corre 21:30 hora Bogotá — requiere `TZ=America/Bogota`.)

---

## 6.bis Cold start de subproductos (CRÍTICO — paso obligatorio si el sistema usa inventario de producción)

> Aplica desde el deploy del módulo "inventario de producción" (sec 7.v4 del CLAUDE.md). Si tu instancia no usa subproductos en recetas, podés saltar esta sección.

**Por qué:** los subproductos arrancan en stock 0. Cualquier producto preparado que dependa de un subproducto aparecerá como "Sin {subproducto}" en `/products/availability` hasta que se registre al menos una producción.

**Antes de abrir el local el día del deploy:**

1. Login en admin (Dueño o Admin Operativo).
2. Entrar a `/subproducts`.
3. Para cada subproducto con stock en cocina hoy:
   - Click "Producir" (icon-only verde en la fila o botón grande en `/subproducts/[id]`).
   - Ingresar la cantidad en cocina (en la unidad del subproducto: piezas, gramos, etc).
   - El backend valida que hay stock de insumos suficiente. Si rechaza, conseguir más insumos o reducir la cantidad.
4. Alternativa: el cocinero registra las tandas desde la **ProductionScreen del KDS Flutter** en la tablet.
5. Verificar que cada subproducto producido aparezca con stock > 0 en `/inventory`.
6. Abrir `pos.tercos.co` → productos preparados deberían estar disponibles.

**Si se omite este paso:** el cajero verá todos los productos preparados como "Agotado" y no podrá vender hasta producir.

---

## 7. Backup Postgres

Cron diario en Railway o externo (recomendado: GitHub Actions con
secret `RAILWAY_DB_URL`):

```yaml
# .github/workflows/backup.yml
name: Postgres backup
on:
  schedule: [{ cron: '0 7 * * *' }] # 2 AM Colombia
jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: |
          pg_dump $DATABASE_URL | gzip > backup-$(date +%F).sql.gz
          # Subir a R2 con `rclone` o S3 CLI
        env:
          DATABASE_URL: ${{ secrets.RAILWAY_DB_URL }}
```
