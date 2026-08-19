# Deploy POS Tercos — checklist v2

> **Quién lo lee:** vos (dueño / dev) cuando arme la prod por primera
> vez. Doc self-contained — todo lo que el deploy necesita está acá.
>
> ⚠️ **Actualización 2026-07-21 (auditoría pre-QA):**
> - **Cutover POS→admin:** `apps/pos` **NO va a producción**. Toda la operación
>   de caja vive en `apps/admin` (ruta `/caja`). El rol **CAJERO se retiró**: el
>   operador de caja es **ADMIN_OPERATIVO** (ver §0.5). Se despliegan 4
>   frontends: admin (unificado), web, cocina, public-display.
> - **Delivery volvió** (`WEB_DELIVERY`): el cliente puede pedir a domicilio; el
>   cajero asigna el costo del envío (> 0) antes de cobrar. Gates de horario y
>   radio GPS configurables desde el admin (ver §0.6). (Ya NO hay Mapbox: el
>   radio se valida por distancia haversine.)
> - **WhatsApp por KAPSO** (Cloud API oficial de Meta), no OpenWA. Print-agent
>   en :9120.
>
> ⚠️ **turnero + KDS ELIMINADOS (§7.v10).** `apps/kds-flutter` borrada; NO hay
> turnero. `apps/public-display` es kiosko de **productos + publicidad + música**
> (sin turnos). COUNTER termina en PAGADO; el cajero marca los pedidos WEB como
> "listo" desde `admin/caja`.
>
> ✅ **App WEB de cocina** (`apps/cocina`, §7.v11) — 4º frontend, ver §2.2.
>
> **Pre-requisitos cumplidos** (ver `pendientes-externos-y-deploy.md`):
> - Cuenta Cloudflare R2 + bucket `pos-tercos-prod`.
> - Cuentas Railway + Vercel + Cloudflare DNS.
> - Cuenta **Kapso** (Cloud API de Meta) con chip +57 dedicado, número
>   registrado y templates aprobados — ver `kapso-setup.md`. (OpenWA es el
>   camino legacy, no usar en prod nueva.)
> - Hardware local: tablet/PC de caja (admin), tablet/TV para la pantalla del
>   local, Raspberry Pi o mini-PC para Print Agent, impresora Epson TM-T20III
>   + cajón monedero RJ-11.

---

## 0. Checklist BLOQUEANTE de inauguración (go / no-go)

> **No abrir el local a producción hasta tildar TODOS estos puntos.** Salen de
> las auditorías de prod-readiness (2026-06). Cada uno tiene su detalle en la
> sección referenciada.

### 0.1 Operacional (obligatorio el día 1)

- [ ] **Categorías de producto** — crear las categorías en admin `/categories`
      **ANTES** de cargar productos: `products.create` exige una categoría
      existente y la DB fría no trae ninguna (el seed no corre en prod). 🔴
- [ ] **Cold-start de subproductos** — antes de abrir, producir todas las tandas
      en admin `/subproducts`. Si no, todo producto preparado sale
      **"Agotado"** y el cobro lo rechaza con 409. Ver §6.bis. 🔴
- [ ] **Usuario dueño con password fuerte** — NO correr `prisma db seed` ni
      `seed-dueno.ts` en prod (ambos tienen guard anti-prod, pero igual: crean
      usuarios `dev12345`). Crear el dueño a mano. Ver §0.4. 🔴
- [ ] **Operador de caja = rol ADMIN_OPERATIVO** — el rol CAJERO se retiró (no
      entra a ninguna app). Crear los cajeros con rol **ADMIN_OPERATIVO**; el
      admin ya no ofrece CAJERO. Ver §0.5. 🔴
- [ ] **Gates web en el estado deseado** — horario, radio de cobertura, delivery
      on/off y kill-switch de pedidos web arrancan **apagados/abiertos** según la
      migración; confirmarlos en admin `/finanzas/estado` y `/web-hero/config`
      antes de abrir. Ver §0.6. 🟠
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

### 0.3 Deuda de escala (no bloquea el día 1)

- [x] **Replay FIFO acotado** — RESUELTO (§7.v13): snapshots mensuales del ledger
      (`ledger_snapshots`, cron día 2 4:30) → el replay procesa solo el mes
      corriente; memoria/tiempo dejan de crecer con la historia. ✅
- [x] **`GET /products/availability` con caché** — RESUELTO (§2.8): el endpoint
      público (polleado por anónimos) tiene caché TTL 15s; el interno (cajero)
      queda fresco. Antes hacía 3 groupBy full-table por hit. ✅
- [ ] **Retención** de `audit_log` (con purga: `audit_log_retention`) /
      `sale_status_log` (insert-only sin purga aún). 🟠

### 0.4 Crear el usuario dueño en prod (sin seed)

```bash
# Conectado al Postgres de Railway, con un hash bcrypt de la password real:
#   node -e "console.log(require('bcrypt').hashSync('TU_PASSWORD_FUERTE', 10))"
INSERT INTO users (id, email, full_name, role, password_hash, must_change_pwd, active, created_at, updated_at)
VALUES (gen_random_uuid(), 'dueno@tunegocio.co', 'Dueño', 'DUENO', '<hash-bcrypt>', false, true, now(), now());
```

Después, el dueño crea el resto de usuarios desde admin `/users`.

### 0.5 Cutover de roles POS→admin

`apps/pos` no va a prod: la caja vive en `admin.tercos.co/caja`, que solo admite
**ADMIN_OPERATIVO** y **DUENO**. El rol **CAJERO se retiró** de la operación (no
entra a ninguna app).

- La migración `reassign_cajero_to_operativo` reasigna cualquier usuario CAJERO
  existente → ADMIN_OPERATIVO (idempotente; corre sola en el `migrate deploy`).
- Al crear cajeros nuevos en `/users`, elegir rol **ADMIN_OPERATIVO** (el form ya
  no ofrece CAJERO; el default es ADMIN_OPERATIVO).
- El DUEÑO **no** opera la caja (decisión: separación de funciones). Si el único
  operativo falta, el dueño puede crear otro operativo o, en emergencia, cambiarse
  el rol — pero por diseño no cobra.

### 0.6 Gates de la web pública (confirmar el estado)

El cliente pide desde `tercos.co`. Antes de abrir, confirmar en admin
(`/finanzas/estado` + `/web-hero/config`):

- **Kill-switch de pedidos web** (`web_orders_enabled`) — si querés recibir
  pedidos web, encendido.
- **Horario** — si está activo, fuera de hora el checkout responde 503.
- **Radio de cobertura** (`ordersRespectRadius` + `orderRadiusKm` + coords del
  local) — solo aplica a **domicilios**; a quien viene a recoger no lo bloquea.
- **Delivery on/off** (`deliveryEnabled`) — si está apagado, la web solo ofrece
  "recoger". Un domicilio se cobra con el **envío asignado (> 0)** por el cajero;
  el WhatsApp con el total real sale al asignarlo (fee 0 = sin asignar, bloquea el
  cobro).

---

## 1. Backend en Railway

### 1.1 Crear servicios

```
- pos-tercos-api (Web Service, Dockerfile-less con pnpm)
- pos-tercos-db (PostgreSQL 16, plan Hobby al menos)
```

`api` Build settings — **patrón VERIFICADO en el QA real (2026-08-19)**; los dos
intentos "obvios" fallan y quedaron documentados para no repetirlos:
- **Root directory: `/` (la raíz del repo)** — ⚠️ NO `apps/api`: Railway recorta
  el contexto de build al root directory, y sin `pnpm-workspace.yaml` ni
  `packages/` Nixpacks detecta npm y `npm i` muere con el protocolo `workspace:*`.
- **Config file: `apps/api/railway.json`** (setting "Railway Config File" del
  servicio). Ahí viven build/start command, `healthcheckPath: /healthz` y
  `numReplicas: 1` — versionados y revisables en PR.
- **Variable `NIXPACKS_INSTALL_CMD`** =
  `pnpm install --frozen-lockfile --filter @pos-tercos/api...` — ⚠️ sin el
  filtro, el install del workspace completo compila `usb` (el driver libusb del
  print-agent, que corre en la Raspberry, no en Railway) y la imagen no trae
  Python para node-gyp. El filtro instala api + types + domain y nada más.
- **Watch paths**: `apps/api/**`, `packages/**`, `pnpm-lock.yaml`,
  `pnpm-workspace.yaml` — un cambio de docs o de frontends no redespliega el API.
- Build command (en railway.json; cwd = raíz del repo):
  `pnpm -F @pos-tercos/types build && pnpm -F @pos-tercos/domain build && pnpm -F @pos-tercos/api exec prisma generate && pnpm -F @pos-tercos/api build`
- Start command: `pnpm -F @pos-tercos/api exec prisma migrate deploy && pnpm -F @pos-tercos/api start`

> ⚠️ **`numReplicas: 1` es invariante, NO autoscale.** El throttler, los rooms de
> WebSocket (`/ws/pos`) y los crons viven en memoria; con >1 réplica el rate-limit
> se evade, un pedido web no suena en todas las instancias y cada cron corre N
> veces. `InstanceGuardService` alerta al dueño por WhatsApp si detecta >1
> instancia sostenida — pero la config debe nacer en 1.

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
- `CORS_ORIGINS=https://admin.tercos.co,https://tercos.co,https://display.tercos.co,https://cocina.tercos.co`
  — **obligatoria en prod** (lista separada por comas de los orígenes de los 4
  frontends reales; sin ella el boot CRASHEA a propósito). Ya NO incluye
  `pos.tercos.co` salvo que lo aliasees a `admin.tercos.co/caja`.
- `TRUST_PROXY_HOPS` — nº de proxies delante del API (§2.9). **OBLIGATORIA en
  producción: el boot FALLA si está ausente o no es un entero ≥ 1**
  (`assert-env.ts` — es una decisión deliberada, no hay default silencioso).
  Con **Cloudflare proxied delante de Railway** hay DOS saltos → poner **`2`**
  (si no, el throttler agrupa a todos los clientes en la IP del edge de CF =
  auto-DoS del login). **Verificar `req.ip` real en QA** antes de fijarlo.

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
- `STORAGE_PROVIDER=r2` — **debe ser `r2` en prod**. El boot valida el valor
  (§2.4): un typo (`"R2 "`, `cloudflare`) mata el arranque en vez de degradar a
  `local` en silencio. Y `STORAGE_PROVIDER=local` en prod **crashea** (las fotos
  se perderían en el filesystem efímero de Railway en cada redeploy) salvo
  `ALLOW_LOCAL_STORAGE=1` explícito.
- `R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com`
- `R2_ACCESS_KEY_ID=...`
- `R2_SECRET_ACCESS_KEY=...`
- `R2_BUCKET=pos-tercos-prod`
- `R2_PUBLIC_URL_BASE=https://media.tercos.co` (opcional, custom domain CF)

**WhatsApp — ⚠️ DECISIÓN VIGENTE (2026-07-27, §7.v22 de CLAUDE.md): el aviso al
cliente es MANUAL por wa.me** (el cajero abre el chat desde su propio WhatsApp;
el sistema arma el mensaje). Kapso queda DORMIDO hasta que el dueño decida
encender el envío automático. Implicaciones para el deploy:

- **Para salir a prod SIN Kapso** (el caso actual): NO configurar `KAPSO_*` ni
  `WHATSAPP_REQUIRED` (ni `OPENWA_*`). El backend instancia el Mock, que declara
  `delivers:false` — no envía ni finge, y los botones de wa.me hacen el trabajo.
  Consecuencia a aceptar: las alertas automáticas al dueño (descuadres, 5xx,
  digest 21:30) NO llegan → **UptimeRobot (§8) pasa de recomendado a ÚNICA red
  de alertas.**
- **Si/cuando se encienda Kapso**, ahí sí lo de abajo:

**WhatsApp automático — KAPSO (Cloud API oficial; derrotero en `kapso-setup.md`):**
- `KAPSO_API_KEY=...` — API key de producción de Kapso
- `KAPSO_PHONE_NUMBER_ID=...` — phone number id del número de producción
- `WHATSAPP_REQUIRED=true` — recomendado SOLO con Kapso configurado (§2.5): sin
  proveedor el boot CRASHEA en vez de arrancar en Mock. **Con la decisión manual
  vigente, ponerla en true SIN las llaves Kapso mata el arranque.**
- `WHATSAPP_TEMPLATES_ENABLED=true` — recién cuando los templates estén APROBADOS
  en Meta. Registrar **6 templates** (los 5 + el nuevo `delivery_en_camino` para
  el "va en camino" de domicilios — §2.6; sin él un domicilio "listo" recibiría el
  template de retiro en el local). Ver `kapso-setup.md`.
- `WHATSAPP_TEMPLATE_LANG=es` — o `es_CO` según el language code aprobado
- `OWNER_WHATSAPP_PHONE=+57XXXXXXXXXX` — E.164; recibe el **digest
  diario 21:30** y las **alertas antifraude** (descuadre de caja, etc.)

> El factory elige por prioridad `KAPSO_*` → `OPENWA_*` → Mock, y CRASHEA al
> boot si una config queda PARCIAL. Sin ninguna, instancia
> `MockWhatsAppAdapter` (declara `delivers:false`: no envía NI finge) — válido
> en prod bajo la decisión manual vigente. Las `OPENWA_*` son el camino LEGACY
> (riesgo de baneo, `openwa-setup.md`): no setearlas en prod nueva; si existen
> de antes, borrarlas al activar Kapso.

**Domicilios (solo si `deliveryEnabled` va a estar encendido):**
- `GOOGLE_MAPS_API_KEY=AIza...` — Places API (New), key restringida a esa API
  (Google Cloud Console). La llave NUNCA va al navegador (el autocompletado
  pasa por `/web/address/*` del backend). **Sin ella el sistema cae al
  `StubAddressAdapter`, que INVENTA direcciones** — el candado de radio queda
  decorativo. Si el día 1 no hay domicilios, se puede omitir con
  `deliveryEnabled` apagado.

**Anti-abuso web (opcional):**
- `WEB_ORDER_MAX_PER_IP_PER_DAY=25` — tope diario de pedidos web por IP
  (default 25; una var inválida cae al default). En memoria → atado al
  invariante `numReplicas:1`.

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

**`GET /healthz`** debe responder 200 (el controller es `@Controller('healthz')`).
Railway lo usa como liveness — configurar el **Healthcheck Path a `/healthz`**.
⚠️ `/health` (sin `z`) da **404** → Railway mataría el servicio en un loop de
reinicios. `/healthz` devuelve 200 y `503` si la DB está caída.

---

## 2. Frontends en Vercel

**4 proyectos** Next.js, cada uno con su domain:
- `admin.tercos.co` → `apps/admin` — **app unificada**: gestión (dueño) +
  operación de caja (ADMIN_OPERATIVO, ruta `/caja`). Es PWA offline en `/caja`.
- `display.tercos.co` → `apps/public-display` (kiosko productos+publicidad+música)
- `cocina.tercos.co` → `apps/cocina` (§2.2)
- `tercos.co` → `apps/web` (público)

> **`apps/pos` NO se despliega** (cutover POS→admin): la caja vive en
> `admin.tercos.co/caja`. Opcional: aliasear `pos.tercos.co` → `admin.tercos.co/caja`
> como acceso directo para el mostrador. El KDS Flutter tampoco: ya no existe.

Build settings (cada uno):
- Framework: Next.js
- Root directory: `apps/<name>`
- Build command: `cd ../.. && pnpm install --frozen-lockfile && pnpm -F @pos-tercos/<name> build`
- Output directory: `.next`

### 2.1 Variables de entorno

**Todos (server-side fetch + rewrites `/api/*`):**
- `API_INTERNAL_URL=https://api.tercos.co`

**Admin, cocina (verify JWT en edge middleware):**
- `JWT_ACCESS_SECRET` — mismo valor que el API

**Admin (la caja vive acá — §2.9 auditoría: SIN estas dos, el socket de pedidos
web y la impresión apuntan a `localhost` y la comanda falla EN LA VENTA):**
- `NEXT_PUBLIC_API_WS_URL=wss://api.tercos.co` (socket.io `/ws/pos`)
- `NEXT_PUBLIC_PRINT_AGENT_URL=http://<host-agent>:9120` — el navegador
  de la caja le habla **directo** al print-agent en la red del local
  (default `http://localhost:9120` si el agent corre en la misma PC
  del mostrador). Necesario para impresión (comanda + recibo + cajón).

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
> WEB de cocina existe y es el 4º frontend en Vercel (admin, web, cocina,
> public-display — `apps/pos` NO se despliega desde el cutover).

- Proyecto Vercel `tercos-cocina` (mismo patrón que admin), dominio
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
A    admin.tercos.co     → Vercel    (proxy on)   ← incluye la caja (/caja)
A    display.tercos.co   → Vercel    (proxy on)
A    cocina.tercos.co    → Vercel    (proxy on)
A    tercos.co           → Vercel    (proxy on)
A    media.tercos.co     → R2 custom domain (CF Workers)
A    printer.tercos.co   → CF Tunnel al host del agent (si se usa esa opción)
```

> `apps/cocina` SÍ existe (`cocina.tercos.co`, §7.v11). `apps/pos` NO se
> despliega (cutover POS→admin); si querés un acceso directo al mostrador,
> aliaseá `pos.tercos.co` → `admin.tercos.co/caja` (opcional).
> ⚠️ Con **proxy on** en Cloudflare, revisar `TRUST_PROXY_HOPS=2` (§1.2/§2.9).

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

Un deploy **cold** (DB nueva) aplica las **~82 migrations** en orden. No hace
falta enumerarlas — `migrate deploy` es idempotente y aplica solo las que
falten. Bloques nuevos desde la v2 (los más recientes primero):

- **Delivery (§Fase 0-1)**: `web_delivery_enum`, `web_delivery_fields`,
  `delivery_toggle`, `delivery_fee`, `order_radius`, `web_business_config`
- **Cutover roles**: `reassign_cajero_to_operativo` (UPDATE idempotente:
  CAJERO→ADMIN_OPERATIVO — no queda ningún CAJERO operando)
- **Medios de pago dinámicos**: `dynamic_payment_methods` ⚠️ ver aviso abajo
- **Catálogo**: `product_categories` (backfill), `product_emoji`,
  `product_force_available`, `blocks_availability`, `promotion_channel`
- **Cuentas abiertas + descuentos**: `open_tabs_and_manual_discounts`,
  `money_invariants_and_indexes`
- **FIFO snapshot + offline + hardening**: `ledger_snapshots`,
  `shift_offline_open`, `app_instances`, `audit_log_retention`
- Más los bloques v2 previos (reorientación v2, cajero v2.1, FIFO, nómina v2,
  costos fijos/pagos, inventario de producción, conteo físico).

> ⚠️ **`dynamic_payment_methods` sobre una DB CON DATOS** (QA ya poblada, no cold)
> hace `ALTER COLUMN ... TYPE TEXT` en `sales`/`sale_payments`/`cash_movements` +
> `DROP TYPE "PaymentMethod"` = reescritura de tabla con **lock ACCESS EXCLUSIVE**.
> En DB fría es trivial; sobre datos, aplicarla en **ventana muerta** y con
> `pg_dump` manual previo. Las migraciones con `ADD VALUE` en enum
> (`web_delivery_enum`, `subproduct_inventory`) están correctamente aisladas.

---

## 6. Smoke test post-deploy

1. `GET https://api.tercos.co/healthz` → 200 (`503` si la DB está caída).
2. `GET https://api.tercos.co/web/menu` → JSON con productos públicos.
3. Login en `admin.tercos.co` con el usuario dueño real (creado a mano en §0.4;
   **el seed NO corre en prod** — tiene guard anti-prod). El operador de caja
   entra con rol **ADMIN_OPERATIVO** (el rol CAJERO se retiró en el cutover
   POS→admin; ver §0.5).
4. **Venta COUNTER**: abrir caja en `admin.tercos.co/caja` (efectivo de
   apertura) → vender un producto → cobrar CASH → la venta queda en
   **PAGADO** (estado terminal de mostrador) y el recibo sale por el
   print-agent (papel + cajón abre) con el **# de recibo**.
5. **Pantalla del local**: `display.tercos.co` muestra el carrusel de
   productos + publicidad + música (sin turnos).
6. **Pedido web**: hacer pedido en `tercos.co` → al confirmar, al CLIENTE se le
   abre su WhatsApp con el pedido ya escrito (modelo MANUAL §7.v22) → el pedido
   aparece en el modal de pedidos web de `admin.tercos.co/caja`. **Si es
   domicilio**, el cajero primero **asigna el costo del envío** (obligatorio,
   > 0) antes de cobrar; al asignarlo se abre wa.me con el total real ya
   escrito. *(Solo con Kapso encendido: verificar además la fila `sent` en
   `whatsapp_messages`; en modo manual las filas quedan `manual`.)*
7. **Confirmar pago** del pedido web en la caja → botón de WhatsApp "avisar que
   el pago entró" abre wa.me con el texto → **"Marcar listo"** → botón "avisar
   que está listo / va en camino" ídem → el tracking en
   `tercos.co/checkout/success/[id]?token=` muestra "¡Pago confirmado!"
   (la web no promete más avance — §7.v25).
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
4. Alternativa: el cocinero registra las tandas desde `cocina.tercos.co/produccion`.
5. Verificar que cada subproducto producido aparezca con stock > 0 en `/inventory`.
6. Abrir `admin.tercos.co/caja` → los productos preparados deberían estar disponibles.

**Si se omite este paso:** el cajero verá todos los productos preparados como "Agotado" y no podrá vender hasta producir.

---

## 7. Backup Postgres

**IMPLEMENTADO** en `.github/workflows/db-backup.yml` (cron **cada 6 horas** +
corrida manual con `workflow_dispatch`). Cada corrida hace `pg_dump -Fc`,
**verifica el dump** (`pg_restore --list`, mínimo 10 tablas con datos), sube a R2
(`backups/pos-tercos-YYYY-MM-DD-HHMM.dump`), aplica retención de 30 días, abre un
Issue si falla y pinguea el dead-man's-switch.

**Secrets: van en un ENVIRONMENT de GitHub, NO a nivel repo** (un secret a nivel
repo es exfiltrable desde cualquier rama con un workflow modificado). Los 3 pasos
manuales exactos están en la cabecera del propio `db-backup.yml`:

1. Repo → Settings → Environments → crear **`production-backup`**.
2. Deployment branches → **solo `main`**.
3. Cargar los 6 secrets DENTRO del environment: `RAILWAY_DB_URL` (URL pública
   del Postgres prod), `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
   `R2_SECRET_ACCESS_KEY` (token scoped SOLO al bucket de backups),
   `R2_BACKUP_BUCKET`, `HEALTHCHECKS_URL` (ping de healthchecks.io).

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
