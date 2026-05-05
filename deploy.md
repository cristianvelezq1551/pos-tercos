# Deploy POS Tercos — checklist v1

> **Quién lo lee:** vos (dueño / dev) cuando arme la prod por primera
> vez. Doc self-contained — todo lo que el deploy necesita está acá.
>
> **Pre-requisitos cumplidos** (ver `pendientes-externos-y-deploy.md`):
> - Cuenta Cloudflare R2 + bucket `pos-tercos-prod`.
> - Token Mapbox público.
> - Cuentas Railway + Vercel + Cloudflare DNS.
> - Hardware local: tablet POS, tablet KDS, Raspberry Pi para Print
>   Agent, impresora Epson TM-T20III + cajón monedero RJ-11.

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

> El `migrate deploy` aplica las 4 migrations pendientes que quedaron sin
> ejecutar en sesiones de FASE 12 y FASE 14:
> - `20260504203249_fase12b_promotion_types_extended`
> - `20260504210021_fase12c_purchase_suggestions`
> - `20260504220000_fase14b_workers`
> - `20260504220500_fase14d_payment_reconciliations`

### 1.2 Variables de entorno (api)

**Database:**
- `DATABASE_URL=${{Postgres.DATABASE_URL}}` (Railway internal)

**Auth:**
- `JWT_ACCESS_SECRET` — random 64 bytes (`openssl rand -hex 64`)
- `JWT_REFRESH_SECRET` — random 64 bytes distinto
- `WEB_ORDER_TOKEN_SECRET` — random 64 bytes distinto

**LLM:**
- `ANTHROPIC_API_KEY=sk-ant-...` (primary)
- `OPENAI_API_KEY=sk-...` (fallback, opcional)
- `LLM_PROVIDER=anthropic`

**Storage R2 (FASE 15.B):**
- `STORAGE_PROVIDER=r2`
- `R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com`
- `R2_ACCESS_KEY_ID=...`
- `R2_SECRET_ACCESS_KEY=...`
- `R2_BUCKET=pos-tercos-prod`
- `R2_PUBLIC_URL_BASE=https://media.tercos.co` (opcional, custom domain CF)

**Mapbox (FASE 8):**
- `MAPBOX_TOKEN=pk.eyJ...`
- `RESTAURANT_LAT=...`
- `RESTAURANT_LNG=...`
- `RESTAURANT_DELIVERY_RADIUS_KM=3`

**WhatsApp (FASE 9 + 15.A):**
- `BUSINESS_NAME=Tercos`
- `OWNER_WHATSAPP_PHONE=+57XXXXXXXXXX` (E.164, recibe alertas de descuadre)

**Print Agent (FASE 15.C):**
- `PRINTER_PROVIDER=escpos`
- `PRINT_AGENT_URL=http://192.168.1.50:9100` (IP local de la Pi en
  la red del local; no expuesto a Railway directamente — ver §3)
- `PRINT_AGENT_SECRET=...` (matches el agent)

**Pagos (instructions display):**
- `PAYMENT_INSTRUCTIONS_NEQUI=3001234567`
- `PAYMENT_INSTRUCTIONS_TRANSFER=Bancolombia ahorros 12345...`

**Throttler / Throttling (default ya en código).**

### 1.3 Health check

`GET /health` debe responder 200. Railway lo usa como liveness.

---

## 2. Frontends en Vercel

5 proyectos, cada uno con su domain:
- `admin.tercos.co` → `apps/admin`
- `pos.tercos.co` → `apps/pos`
- `kds.tercos.co` → `apps/kds`
- `display.tercos.co` → `apps/public-display`
- `tercos.co` → `apps/web` (público)

Build settings (cada uno):
- Framework: Next.js
- Root directory: `apps/<name>`
- Build command: `cd ../.. && pnpm install --frozen-lockfile && pnpm -F @pos-tercos/<name> build`
- Output directory: `.next`

### 2.1 Variables de entorno

**Todos los frontends que llaman API:**
- `API_INTERNAL_URL=https://api.tercos.co` (server-side fetch)

**POS y KDS:**
- `JWT_ACCESS_SECRET` — mismo valor que el API (para verify edge middleware)
- `NEXT_PUBLIC_API_WS_URL=wss://api.tercos.co` (socket.io)
- `NEXT_PUBLIC_BUSINESS_NAME=Tercos`
- `NEXT_PUBLIC_BUSINESS_ADDRESS_SHORT=Cra 43A # 11-12, Medellín`

**Web pública:**
- `NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ...` (mismo token que el backend si es público)

---

## 3. Print Agent en Raspberry Pi

### 3.1 Hardware

- Raspberry Pi 4 (2GB RAM mínimo).
- Cable USB-A → USB-B (conecta Pi a Epson TM-T20III).
- Cable Ethernet o Wi-Fi del local.
- Cable RJ-11 entre cajón monedero y la impresora (NO al Pi).
- Fuente de poder Pi (5V/3A oficial).

### 3.2 Instalación

```bash
# En el Pi (Raspberry Pi OS Lite)
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
Environment=PRINT_AGENT_PORT=9100
Environment=PRINT_AGENT_SECRET=<generar random hex 32>
Environment=PRINTER_DEVICE=/dev/usb/lp0

[Install]
WantedBy=multi-user.target
```

Activar:
```bash
sudo systemctl daemon-reload
sudo systemctl enable print-agent
sudo systemctl start print-agent
sudo systemctl status print-agent
```

### 3.4 Conectividad

El Pi debe ser alcanzable desde Railway por su IP en la red del local.
Opciones:
1. **Cloudflare Tunnel** (recomendado): instalar `cloudflared` en la Pi
   y exponer `http://localhost:9100` como `printer.tercos.co` con
   acceso restringido al backend de Railway.
2. **VPN simple** (Tailscale): el Pi y el server Railway en la misma
   tailnet. `PRINT_AGENT_URL` apunta a la IP Tailscale de la Pi.

---

## 4. DNS Cloudflare

```
A    api.tercos.co       → Railway IP (proxy on)
A    admin.tercos.co     → Vercel    (proxy on)
A    pos.tercos.co       → Vercel    (proxy on)
A    kds.tercos.co       → Vercel    (proxy on)
A    display.tercos.co   → Vercel    (proxy on)
A    tercos.co           → Vercel    (proxy on)
A    media.tercos.co     → R2 custom domain (CF Workers)
A    printer.tercos.co   → CF Tunnel a Pi (si se usa opción 1)
```

SSL: "Full (strict)" en CF. Vercel y Railway entregan certs válidos.

---

## 5. Migrations en producción

```bash
# Conectado al postgres de Railway
DATABASE_URL=$RAILWAY_DB pnpm -F @pos-tercos/api prisma migrate deploy
```

Migrations pendientes que se aplican:
1. `20260504203249_fase12b_promotion_types_extended` — promociones BOGO/FIXED/COMBO
2. `20260504210021_fase12c_purchase_suggestions` — sugerencias IA
3. `20260504220000_fase14b_workers` — RRHH (asistencia + comisiones)
4. `20260504220500_fase14d_payment_reconciliations` — histórico reconciliations

> Las primeras 8-10 migrations ya están en deploys anteriores; estas 4
> son nuevas desde la última vez que se aplicó migrate.

---

## 6. Smoke test post-deploy

1. `GET https://api.tercos.co/health` → `{ ok: true }`.
2. `GET https://api.tercos.co/web/menu` → JSON con productos públicos.
3. Login en `admin.tercos.co` con un user real (cambiar contraseña antes).
4. Crear una venta COUNTER en `pos.tercos.co` → ver recibo en KDS.
5. Marcar listo en KDS → verificar que aparece en `display.tercos.co`.
6. Hacer pedido en `tercos.co` → verificar que aparece en POS drawer
   con badge "Aceptar y contactar".
7. Click "Aceptar y contactar" → wa.me se abre en tab nueva con
   mensaje pre-llenado.
8. Si hay Pi: imprimir un recibo → ver papel salir + cajón abrir.

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
