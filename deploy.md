# Deploy POS Tercos — checklist v2

> **Quién lo lee:** vos (dueño / dev) cuando arme la prod por primera
> vez. Doc self-contained — todo lo que el deploy necesita está acá.
> Refleja la reorientación v2: sin delivery/Mapbox,
> WhatsApp automático vía OpenWA, print-agent en :9120.
>
> ⚠️ **Actualización 2026-06-27 (CLAUDE.md §7.v10): turnero + KDS ELIMINADOS.**
> La `apps/kds-flutter` se borró; NO hay turnero. La pantalla
> `apps/public-display` queda SOLO como kiosko de **productos + publicidad +
> música** (sin turnos). COUNTER termina en PAGADO; el cajero marca los pedidos
> WEB como "listo" desde el POS.
>
> ✅ **Actualización 2026-06-27 (CLAUDE.md §7.v11): la app WEB de cocina SÍ
> existe** (`apps/cocina`, construida el mismo día) — se despliega como 5º
> frontend en Vercel, ver §2.2.
>
> **Pre-requisitos cumplidos** (ver `pendientes-externos-y-deploy.md`):
> - Cuenta Cloudflare R2 + bucket `pos-tercos-prod`.
> - Cuentas Railway + Vercel + Cloudflare DNS.
> - Gateway OpenWA self-hosted (VPS o máquina local) con número de
>   WhatsApp propio del negocio — ver `openwa-setup.md`.
> - Hardware local: tablet/PC POS, tablet/TV para la pantalla del local,
>   Raspberry Pi o mini-PC para Print Agent, impresora Epson TM-T20III
>   + cajón monedero RJ-11.

---

## 0. Checklist BLOQUEANTE de inauguración (go / no-go)

> **No abrir el local a producción hasta tildar TODOS estos puntos.** Salen de
> las auditorías de prod-readiness (2026-06). Cada uno tiene su detalle en la
> sección referenciada.

### 0.1 Operacional (obligatorio el día 1)

- [ ] **Cold-start de subproductos** — antes de abrir, producir todas las tandas
      en admin `/subproducts`. Si no, todo producto preparado sale
      **"Agotado"** y el cobro lo rechaza con 409. Ver §6.bis. 🔴
- [ ] **Usuario dueño con password fuerte** — NO correr `prisma db seed` en prod
      (crea 5 usuarios con `dev12345`/`mustChangePwd:false`). Crear el dueño a
      mano con password fuerte. Ver §0.4. 🔴
- [ ] **Railway en 1 réplica fija** (sin autoscale) — hay estado in-memory
      (throttle, rooms WS de pedidos web `/ws/pos`) que asume single-instance. 🔴
- [ ] **Healthcheck de Railway = `/healthz`** (NO `/health`, que da 404). 🟠
- [ ] **`pg_dump` manual + simulacro de restore** justo antes del primer
      `migrate deploy` con datos reales (el backup automático es nocturno; no
      cubre el instante de la migración). Ver §7. 🟠
- [ ] **Secrets de GitHub del backup** configurados (`RAILWAY_DB_URL`, `R2_*`) +
      una corrida `workflow_dispatch` de prueba. Ver §7. 🟠
- [ ] **Proveedor de WhatsApp definido** — existe un adapter Kapso (Cloud API)
      con prioridad sobre OpenWA; setear las vars del que se use. Ver §1.2. 🟠

### 0.2 Endurecimiento pre-prod (recomendado fuerte)

- [x] **Bump de dependencias con CVE production-facing** — hecho:
      `pnpm audit --prod` limpio (verificado 2026-07-06). ✅
- [x] **print-agent endurecido** — hecho: sin `PRINT_AGENT_SECRET` escucha SOLO
      en 127.0.0.1 (inalcanzable desde la red); con secret, validación
      timing-safe. En prod (Pi accesible por red) **setear el secret es
      obligatorio** — es lo que frena a una web maliciosa abriendo el cajón
      desde el navegador del POS. ✅ (código) / 🟠 (operativo: setear la var)
- [x] **Timeouts de red** — hecho: impresora y cajón 5s (`AbortSignal.timeout`),
      R2 15s request / 5s conexión, WhatsApp con timeout propio. ✅
- [x] **Alerta on-failure del backup** — hecho: el workflow abre/comenta un
      GitHub Issue (label `backup-failure`) si falla → mail automático. Ojo:
      NO cubre "el cron nunca corrió" (repo inactivo >60 días lo pausa GitHub);
      para eso el dead-man's-switch de abajo. 🟠 parcial
- [ ] **UptimeRobot sobre `/healthz`** + (opcional) ping a healthchecks.io al
      final del backup como dead-man's-switch — el canal de alerta de 5xx viaja
      por WhatsApp (el servicio que más probablemente cae); un monitor externo
      independiente es la red de seguridad real. Ver §8. 🟠

### 0.3 Deuda de escala (no bloquea el día 1; resolver antes de ~6 meses)

- [ ] **Replay FIFO + índice `paidAt`** — los reportes (`/finanzas`, dashboard)
      hacen replay de TODA la tabla `inventory_movements` en cada request, con un
      bug O(n²) en el agrupado de producciones, sobre el mismo event loop que
      cobra. A ~1 año de datos congela el POS al abrir finanzas. Plan: snapshot
      FIFO con fecha de corte + `@@index([paidAt])` + pre-agrupar tandas.
- [ ] **Retención** de `audit_log` / `sale_status_log` (insert-only sin purga).

### 0.4 Crear el usuario dueño en prod (sin seed)

```bash
# Conectado al Postgres de Railway, con un hash bcrypt de la password real:
#   node -e "console.log(require('bcrypt').hashSync('TU_PASSWORD_FUERTE', 10))"
INSERT INTO users (id, email, full_name, role, password_hash, must_change_pwd, active, created_at, updated_at)
VALUES (gen_random_uuid(), 'dueno@tunegocio.co', 'Dueño', 'DUENO', '<hash-bcrypt>', false, true, now(), now());
```

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
> existan `DATABASE_URL` y `JWT_ACCESS_SECRET` siempre, y en producción
> además `WEB_ORDER_TOKEN_SECRET`, `CORS_ORIGINS` y `STORAGE_PROVIDER`.
> Si falta alguna, el proceso muere al boot con mensaje claro. Además
> WARNea al boot si faltan `OWNER_WHATSAPP_PHONE`, `PRINTER_PROVIDER`,
> `TZ` o `KAPSO_*` (features que morirían en silencio).
> (`JWT_REFRESH_SECRET` NO se valida: los refresh tokens son opacos
> SHA-256, no JWT — igual conviene setearla si algún módulo la usa a futuro.)

**Runtime:**
- `NODE_ENV=production`
- `TZ=America/Bogota` — **obligatoria**: los crons (digest 21:30, purga
  idempotency 3 AM, gap-check 4 AM, scan de sugerencias horario, sweep de
  ventas stale) usan hora local del server.
- `CORS_ORIGINS=https://pos.tercos.co,https://admin.tercos.co,https://tercos.co,https://tv.tercos.co,https://cocina.tercos.co`
  — **obligatoria en prod** (lista separada por comas de los orígenes de los
  frontends; sin ella el boot CRASHEA a propósito).

**Database:**
- `DATABASE_URL=${{Postgres.DATABASE_URL}}` (Railway internal)
  - **Fijar el pool de conexiones**: agregar `?connection_limit=15` (o `&` si
    ya hay query). El default de Prisma (num_cpu×2+1) queda en ~3-5 en un plan
    chico → un burst de cobros concurrentes agota el pool y devuelve "Unable to
    start a transaction". El cobro ya espera hasta 10s por un slot (`maxWait` en
    `SALE_TX_OPTS`), pero el pool necesita holgura. Verificar que no supere el
    `max_connections` del Postgres de Railway.

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

**WhatsApp automático — KAPSO (Cloud API oficial; derrotero en `kapso-setup.md`):**
- `KAPSO_API_KEY=...` — API key de producción de Kapso
- `KAPSO_PHONE_NUMBER_ID=...` — phone number id del número de producción
- `WHATSAPP_TEMPLATES_ENABLED=true` — recién cuando los 5 templates estén APROBADOS en Meta
- `WHATSAPP_TEMPLATE_LANG=es` — o `es_CO` según el language code aprobado
- `OWNER_WHATSAPP_PHONE=+57XXXXXXXXXX` — E.164; recibe el **digest
  diario 21:30** y las **alertas antifraude** (descuadre de caja, etc.)

> El factory elige por prioridad `KAPSO_*` → `OPENWA_*` → Mock, y CRASHEA al
> boot si una config queda PARCIAL. Sin ninguna, instancia
> `MockWhatsAppAdapter` (loggea, no envía) — en prod tienen que estar las
> `KAPSO_*`. Las `OPENWA_*` son el camino LEGACY (riesgo de baneo,
> `openwa-setup.md`): no setearlas en prod nueva; si existen de antes,
> borrarlas al activar Kapso.

**Negocio (mensajes WhatsApp + recibos):**
- `BUSINESS_NAME=Tercos`
- `BUSINESS_ADDRESS=Cra 43A # 11-12, Medellín` (recibo impreso)
- `BUSINESS_ADDRESS_SHORT=Cra 43A # 11-12` (mensaje "listo para retirar")
- `BUSINESS_NIT=901.234.567-8` — **sin ella el recibo imprime un NIT
  placeholder falso** (`900.000.000-0`)
- `BUSINESS_PHONE=+57...` (pie del recibo, opcional)

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
- `NEXT_PUBLIC_SITE_URL=https://tercos.co` — **sin ella robots/sitemap/OG
  apuntan a localhost** (SEO roto en silencio)
- `NEXT_PUBLIC_INSTAGRAM_URL=...` (opcional, footer)
- `NEXT_PUBLIC_TIKTOK_URL=...` (opcional, footer)

**Pantalla del local (public-display):**
- `API_INTERNAL_URL=https://api.tercos.co` (el rewrite `/api/*` proxia el
  contenido del B-roll: `/api/display/broll`, imágenes y música). NO usa SSE
  ni turnos — solo muestra productos + publicidad + música.

### 2.2 App de cocina (`apps/cocina`) — VIVA (§7.v11, construida 2026-06-27)

> Este apartado decía "eliminada" — eso era el KDS Flutter (§7.v10). La app
> WEB de cocina existe y se despliega como 5º frontend en Vercel.

- Proyecto Vercel `tercos-cocina` (mismo patrón que admin/pos), dominio
  `cocina.tercos.co`.
- Env vars: `API_INTERNAL_URL=https://api.tercos.co` +
  `JWT_ACCESS_SECRET` (mismo valor que el API — middleware Edge).
- Cookies `cocina_*` aisladas; roles COCINERO/ADMIN_OPERATIVO/DUENO.
- Recordar incluir su origen en `CORS_ORIGINS` del API.

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

> No existe `kds.tercos.co` — no hay app de cocina (eliminada en §7.v10).

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
   apertura) → vender un producto → cobrar CASH → la venta queda en
   **PAGADO** (estado terminal de mostrador) y el recibo sale por el
   print-agent (papel + cajón abre) con el **# de recibo**.
5. **Pantalla del local**: `display.tercos.co` muestra el carrusel de
   productos + publicidad + música (sin turnos).
6. **Pedido web**: hacer pedido en `tercos.co` → el cliente recibe
   **automáticamente** las instrucciones de pago por WhatsApp (OpenWA;
   verificar fila `sent` en `whatsapp_messages`) → el pedido aparece en
   el modal de pedidos web del POS.
7. **Confirmar pago** del pedido web en el POS → WhatsApp "pago
   recibido" automático → **"Marcar listo para retirar"** en el modal →
   WhatsApp "listo para retirar" automático → el tracking en
   `tercos.co/checkout/success/[id]?token=` refleja cada estado
   (termina en LISTO_DESPACHO).
8. **Conteo físico**: en admin `/inventory/counts` crear un conteo de
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

**IMPLEMENTADO** en `.github/workflows/db-backup.yml` (cron 2 AM Colombia + corrida
manual con `workflow_dispatch`). Cada corrida hace `pg_dump -Fc`, **verifica el
dump** (`pg_restore --list`, mínimo 10 tablas con datos), sube a R2
(`backups/pos-tercos-YYYY-MM-DD-HHMM.dump`) y aplica retención de 30 días.

Secrets a configurar en GitHub (Settings → Secrets → Actions):
`RAILWAY_DB_URL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
`R2_BACKUP_BUCKET`.

**Restore (simulacro obligatorio antes de inaugurar, y luego 1 vez al mes):**

```bash
# 1. Bajar el último backup desde R2
aws s3 cp s3://pos-tercos-prod/backups/pos-tercos-<fecha>.dump . \
  --endpoint-url https://<ACCOUNT_ID>.r2.cloudflarestorage.com

# 2. Restaurar en una DB de prueba (NUNCA sobre producción directo)
createdb pos_tercos_restore_drill
pg_restore --no-owner --no-privileges -d pos_tercos_restore_drill pos-tercos-<fecha>.dump

# 3. Verificar: conteos de las tablas críticas
psql pos_tercos_restore_drill -c "SELECT count(*) FROM sales; SELECT count(*) FROM inventory_movements;"
```

## 8. Monitoreo y alertas

- **Uptime**: registrar `https://api.tercos.co/healthz` en un monitor externo
  (UptimeRobot / Better Stack, plan gratis, intervalo 1-5 min, alerta a WhatsApp
  o email del dueño). El endpoint es público y verifica la DB.
- **Errores del backend**: los 5xx inesperados disparan alerta WhatsApp al dueño
  vía `OwnerNotificationService` (throttled — ver `ServerErrorAlertFilter`).
- **Errores del POS**: el cliente reporta a `POST /client-logs` (quedan en los
  logs de Railway con prefijo `[client]`); además cada mostrador guarda su ring
  buffer local (`window.__posLogs()` en DevTools).
