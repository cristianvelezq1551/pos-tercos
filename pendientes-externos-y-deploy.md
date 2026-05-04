# POS Tercos — Pendientes externos y guía de despliegue

> **Documento autocontenido.** Diseñado para cargar como contexto en un chat IA nuevo (sin acceso al código del repo) y resolver dudas sobre cualquiera de los pasos externos: cuentas, despliegue, hardware, integración con Meta/Mapbox/Railway/Vercel/Cloudflare R2, etc.
>
> **Si sos una IA leyendo esto sin más contexto:**
> - El usuario es un emprendedor solo construyendo un POS para un restaurante de comida rápida en Bogotá, Colombia.
> - El sistema está casi completo (FASES 0-7 de 15 entregadas, 48 commits en main).
> - Lo que pide acá NO es código — son trámites, cuentas, decisiones de negocio, configuración de servicios externos.
> - Tu rol: ser claro, directo, paso-a-paso. No asumas conocimiento técnico avanzado del usuario sobre Meta/Cloudflare/Railway/etc — explicá UI navigation cuando aplique. Sí asumí que entiende devops básico (env vars, dominios, DNS).

---

## 1. Contexto del proyecto (3 líneas)

POS para restaurante de comida rápida en Colombia. 1 punto de venta físico, 1 cajero por turno. Stack: NestJS 11 + Prisma 6 + PostgreSQL 16 (backend), Next.js 15 + React 19 + Tailwind v4 (5 frontends), Turborepo + pnpm. Realtime con socket.io (KDS, POS web-orders) y SSE (pantalla pública). Auth JWT con cookies httpOnly. Adapter pattern para WhatsApp/IA/Storage/Print. Local-first, deploy futuro en Railway+Vercel+Cloudflare R2.

**Apps existentes (puerto · estado):**
- `apps/api` (3001) — backend NestJS · ✅ FASE 0-7
- `apps/admin` (3004) — gestión catálogo / inventario / facturas / auditoría · ✅ FASE 0-4
- `apps/pos` (3002) — venta en mostrador + drawer pedidos web · ✅ FASE 5+7.E
- `apps/kds` (3003) — comanda cocina con WS · ✅ FASE 6
- `apps/public-display` (3005) — pantalla pública con SSE · ✅ FASE 6
- `apps/web` (3000) — menú + checkout pickup/delivery · ✅ FASE 7
- `apps/repa` (3006) — repartidor (DIFERIDA, no se trabaja por ahora)
- `apps/print-agent` (9100) — ESC/POS local (FASE 15, no creado aún)

**Documentos canónicos del repo** (si la IA tiene acceso al filesystem):
- `CLAUDE.md` — estado vigente
- `pos-spec.v1.md` — alcance v1
- `architecture.md` — arquitectura técnica
- `implementation-plan.md` — plan por fases
- `kickoff-plan.md` — pendientes externos legacy (este doc lo supera)
- `fase4-ajustes-pendientes.md` — 18 ajustes FASE 4 P0/P1
- `fase5e-y-pendientes.md` — roadmap exhaustivo 5.E → 15

---

## 2. Decisión: app de domiciliario diferida

El usuario decidió **NO trabajar en `apps/repa` por ahora**. La FASE 10 (Repartidor + GPS + asignación) queda al final del backlog. Cuando se retome:
- El schema de `sales` ya soporta `repartidorId`, `assignedAt`, `pickedUpAt`, `departedAt`, `deliveredAt`, `failedAttempts` (modelados en FASE 5.A).
- Los hooks de WS gateway (`/ws/repartidor`) y endpoints (`POST /sales/:id/assign-driver`, `/start-route`, `/mark-delivered`, `GET /sales/my-deliveries` con `DriverAccess`) están planeados en `architecture.md` y `fase5e-y-pendientes.md` sec 3.5.
- Hardware (smartphones/tablets para repartidores, plan datos) se compra cuando arranque la fase.

---

## 3. Orden óptimo de fases pendientes

Criterio: cada fase **se apoya en la anterior** y **cierra un loop funcional** antes de continuar. Las externas pueden iniciarse en paralelo a la implementación — ver timing en sec 4.

| # | Fase | Por qué este orden | Dep. externa |
|---|---|---|---|
| 1 | **FASE 4 ajustes P0** (sweep) | Cierra gaps que ya rozaron en POS (Combos sin costo, directResale UI, validaciones invoice). Sin deps nuevas. | — |
| 2 | **FASE 11** Cierre de caja + Anti-fraude | El cajero abre turno (FASE 5) pero no lo cierra. Cierra el loop diario del POS. Habilita Z-report → entrada para FASE 13. | — |
| 3 | **FASE 8** Mapbox + validación 3km | Cierra el flujo `WEB_DELIVERY` que ya soportamos a medias. Sin esto, delivery web no valida zona. | Cuenta Mapbox |
| 4 | **FASE 12** Auto-pedido IA + Promociones avanzadas | Motor ya soporta PERCENT_OFF; expande a BOGO/FIXED_OFF/COMBO_OFF + auto-pedido IA. Aprovecha sweep de FASE 4 (combos). | — |
| 5 | **FASE 9** WhatsApp Mock + Dev Inbox | Notificaciones a clientes web/delivery. Mock primero, Meta WABA después. | Aprobación Meta WABA |
| 6 | **FASE 13** Reportes y Dashboard | Necesita sales (5), shift Z (11), promos (12), facturas (4). Es la fase que **consume todo**. | — |
| 7 | **FASE 14** Trabajadores RRHH ligero | Tangencial pero usa audit (3) y sales (5) para comisiones. | — |
| 8 | **FASE 15** PWA + offline + Print Agent + Hardening prod | Cierre final. PWA service worker, R2, Railway, Vercel, Print Agent ESC/POS. | R2 + Railway + Vercel + impresora |
| 9 | **FASE 10** Repartidor (diferida) | Al final del backlog. Cuando se retome, los hooks ya están en sales schema. | — |

---

## 4. Timeline de pendientes externos

```
HOY                           → A.1 + A.2 + A.3 (env vars + PIN admin + cron backup) ✅ HECHO
1 sem antes de FASE 8         → B.1 (Mapbox account)                                  ✅ HECHO
ANTES de FASE 9               → C.4 (logueo WhatsApp Web del comercio en POS) — 5 min
2-3 sem antes de FASE 15      → D.1 (Cloudflare R2)                                   ✅ HECHO
2-3 sem antes de FASE 15      → D.2 (Railway backend)                                 ⏸️ pausado
2-3 sem antes de FASE 15      → D.3 (Vercel frontends)                                ⏸️ pausado
2-3 sem antes de FASE 15      → D.4 (dominios + DNS)
2-3 sem antes de FASE 15      → D.5 (hardware: impresora, cajón, tablets)
```

**Eliminados del timeline (decisión 2026-05-04):**
- ~~3-4 sem antes de FASE 9 → C.1, C.2 (Meta verificación + WABA)~~ → wa.me no requiere Meta
- ~~1-2 sem antes de FASE 9 → C.3, C.4 (templates + webhook)~~ → wa.me no requiere templates ni webhook

---

## 5. Sección A — Configuración local (HOY)

### A.1 Validar `apps/api/.env`

Asegurate que tu archivo `.env` (en `apps/api/`) tenga estas variables. Las marcadas `<random>` deben ser strings aleatorias de 32+ chars (usar `openssl rand -hex 32`).

```bash
# Database (docker-compose.yml ya lo seedea)
DATABASE_URL=postgresql://pos:pos_dev@localhost:5432/pos_tercos_dev?schema=public

# JWT — secrets DIFERENTES entre access y refresh
JWT_ACCESS_SECRET=<random-32-bytes>
JWT_REFRESH_SECRET=<random-32-bytes-distinto>

# API listen
API_PORT=3001
API_HOST=0.0.0.0

# CORS — permite todos los frontends en dev
CORS_ORIGINS=http://localhost:3000,http://localhost:3002,http://localhost:3003,http://localhost:3004,http://localhost:3005,http://localhost:3006

# IA (FASE 4 — facturas)
ANTHROPIC_API_KEY=sk-ant-xxx                # ya tenés esto
ANTHROPIC_MODEL=claude-haiku-4-5
OPENAI_API_KEY=                              # opcional fallback
OPENAI_MODEL=gpt-4o-mini
LLM_PROVIDER=anthropic

# WEB ORDERS (FASE 7)
WEB_ORDER_TOKEN_SECRET=<random-32-bytes>     # firma HMAC del tracking token
PAYMENT_INSTRUCTIONS_NEQUI=300 1234567 (Nombre del local)
PAYMENT_INSTRUCTIONS_TRANSFER=Bancolombia ahorros 12345678 a nombre de Restaurante Tercos NIT 901xxx-x

# Restaurant geo (FASE 8)
RESTAURANT_LAT=4.6533                        # ajustar a coords reales del local
RESTAURANT_LNG=-74.0836
RESTAURANT_DELIVERY_RADIUS_KM=3

# Adapters
WHATSAPP_PROVIDER=mock                        # cambia a 'meta' en FASE 9 con WABA aprobada
STORAGE_PROVIDER=local                        # cambia a 'r2' en FASE 15 prod
STORAGE_LOCAL_PATH=./tmp/uploads

# Receipt branding (FASE 5.D)
RECEIPT_BUSINESS_NAME=Tercos Burgers
RECEIPT_BUSINESS_ADDRESS=Cra 11 # 23-45, Bogotá
RECEIPT_BUSINESS_NIT=901.xxx.xxx-x
RECEIPT_BUSINESS_PHONE=+57 300 1234567
```

Y el Web app necesita `apps/web/.env.local`:
```bash
API_INTERNAL_URL=http://localhost:3001
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_API_WS_URL=http://localhost:3001
NEXT_PUBLIC_PAYMENT_NEQUI=300 1234567 (Nombre del local)
NEXT_PUBLIC_PAYMENT_TRANSFER=Bancolombia ahorros 12345678
```

Cada otro frontend (admin, pos, kds, public-display) requiere su `apps/<app>/.env.local` con `JWT_ACCESS_SECRET` (mismo que API), `API_INTERNAL_URL`, y `NEXT_PUBLIC_API_WS_URL` (donde aplica).

### A.2 Setear PIN del Admin Operativo en dev

En el seed actual, **solo Dueño tiene PIN** (123456 en dev). Admin Operativo no. Para trabajar features que requieren PIN (anular venta, abrir cajón sin venta) sin necesidad de Dueño, setealo:

```bash
# Login como Admin Operativo
ADMIN=$(curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"email":"admin@dev.local","password":"dev12345"}' \
  http://localhost:3001/auth/login | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")

# Setear PIN
curl -X POST -H 'Content-Type: application/json' -H "Authorization: Bearer $ADMIN" \
  -d '{"pin":"654321"}' http://localhost:3001/approvals/pin
```

PIN del Dueño se cambia con el mismo endpoint logueado como Dueño.

---

## 6. Sección B — Mapbox (antes de FASE 8)

### B.1 Crear cuenta Mapbox

**Cuándo:** 1 semana antes de arrancar FASE 8 (Mapbox + 3km).

**Pasos:**
1. Andá a https://account.mapbox.com/auth/signup/.
2. Confirmar email.
3. Account → "Tokens" → "Create a token":
   - **Token público** (`pk.eyJ...`): default scopes (`styles:tiles`, `styles:read`, `fonts:read`, `datasets:read`, `vision:read`). Suficiente para frontend (autocomplete + maps).
   - **Token secret** (`sk.eyJ...`): scopes `geocoding:read`. Para llamadas server-to-Mapbox desde el backend (validación 3km no expone tokens al cliente).
4. **URL allowlist** en el token público: agregar tu dominio prod (`https://tercosburgers.co`) cuando lo tengas. En dev, dejarlo `*` o `http://localhost:*`.

**Variables a capturar:**
```bash
# apps/web/.env.local (cliente)
NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ1Ijo...

# apps/api/.env (server)
MAPBOX_SECRET_TOKEN=sk.eyJ1Ijo...
```

**Costo:**
- 100k requests/mes de geocoding **GRATIS**.
- Después: $0.50 / 1k requests (Geocoding) o $0.75 / 1k (Search).
- Para nuestra escala (1 local, ~50-200 pedidos/día) → free tier alcanza con creces.

**Gotchas:**
- Mapbox Search Box (UI autocomplete listo) requiere SDK `@mapbox/search-js-react`. Es JS bundle ~80KB — aceptable en Next.js.
- Token público SIEMPRE va en `NEXT_PUBLIC_*` (browser lo ve). Por eso el URL allowlist es importante.
- Geocoding directo (address → lat/lng) y reverse (lat/lng → address) usan endpoints distintos: `/geocoding/v5/mapbox.places/{query}.json`.

### B.2 Decisión Mapbox vs Google Places

Recomendación: **Mapbox**, por:
- Free tier más generoso (100k vs 5k requests/mes en Google).
- Tokens públicos seguros con URL allowlist.
- SDK liviano para Next.js.
- Plan canónico ya lo asume (`pos-spec.v1.md` mencionaba Google pero el roadmap se actualizó).

Si preferís Google Places por familiaridad: https://console.cloud.google.com → habilitar APIs Places + Geocoding → crear API key con restricciones por dominio. Costo: $200 USD de crédito gratis/mes (cubre ~28k autocomplete o 40k geocoding).

---

## 7. Sección C — WhatsApp wa.me semi-automático (DECISIÓN 2026-05-04)

> **CAMBIO DRÁSTICO vs plan original.** Meta WABA queda DESCARTADO. Razón: presupuesto del usuario ≤$10 USD/mes, WABA mínimo arranca en ~$30 USD/mes a régimen. Ver decisión completa en `CLAUDE.md` sec 4.10.

### C.1 Concepto

Los mensajes salen del **WhatsApp del comercio hacia el cliente**, disparados por el operador (cajero/cocinero) al hacer click en transiciones de status del pedido. NO hay backend WhatsApp, NO hay adapter Meta, NO hay templates aprobadas, NO hay tokens, NO hay mock dev inbox. Todo es:

1. **Helper puro** `@pos-tercos/domain/whatsapp/build-link.ts` que arma URLs `https://wa.me/<phone>?text=<encoded>`.
2. **Endpoint backend simple** `POST /sales/:id/whatsapp-clicked` que solo registra en audit log.
3. **3 puntos UI** que combinan transición de status + apertura WhatsApp en el mismo click.

**Costo total: $0/mes.** El comercio responde con su WhatsApp Business app/Web normal.

### C.2 Flujo nuevo de pedido web (acoplado al WhatsApp)

```
1. Cliente hace pedido en /checkout web
   └─> Sale creado en estado PENDIENTE_PAGO
   └─> Aparece en POS drawer marcado "Sin aceptar"
   └─> Cliente ve mensaje: "Te contactaremos por WhatsApp para confirmar tu pago"

2. Cajero presiona "Aceptar y contactar" en POS drawer
   └─> POS llama POST /sales/:id/whatsapp-clicked?stage=accepted (audit)
   └─> POS abre nueva pestaña: https://wa.me/<phone>?text=<pedir-comprobante>
   └─> WhatsApp Web ya logueado en el computador del POS intercepta y abre conversación

3. Cliente envía comprobante por WhatsApp (foto Nequi/transferencia)
   └─> Llega al WhatsApp del local (humano lo lee)

4. Cajero verifica el comprobante manualmente y presiona "Confirmar pago" en POS
   └─> Sale pasa a PAGADO (flujo actual sin cambios)
   └─> POS llama POST /sales/:id/whatsapp-clicked?stage=confirmed (audit)
   └─> POS abre nueva pestaña: https://wa.me/<phone>?text=<pedido-confirmado>
   └─> Cajero da tap "Enviar" → cliente recibe "tu pedido fue confirmado, está en cocina"

5. Cocinero presiona "Marcar listo" en KDS (solo para WEB_PICKUP/WEB_DELIVERY)
   └─> Sale pasa a LISTO_DESPACHO (flujo actual sin cambios)
   └─> KDS llama POST /sales/:id/whatsapp-clicked?stage=ready (audit)
   └─> KDS abre nueva pestaña: https://wa.me/<phone>?text=<pedido-listo>
   └─> Cocinero da tap "Enviar" → cliente recibe "tu pedido está listo para retirar"
```

**Reglas duras:**
- ❌ NO existe el botón "Avisar cliente" como acción separada — siempre acoplado al click de transición.
- ❌ Se ELIMINA el botón "Ya pagué" del cliente en `/checkout/success/[id]?token=`. El cliente NO confirma pago; el cajero lo hace tras recibir comprobante por WhatsApp.
- ❌ NO se exige aprobación Meta. NO se compra SIM nueva. NO se consigue número fijo. NO se sube cédula/RUT a Meta.
- ✅ El cajero usa **WhatsApp Web/Desktop logueado en el computador del POS**. El click `target="_blank"` abre `wa.me` y WhatsApp Web ya logueado intercepta.
- ✅ Tracking obligatorio en cada stage para reportes (FASE 13: "% de pedidos con WhatsApp enviado").

### C.3 Variables env nuevas (todas opcionales, una sola)

```bash
# apps/web/.env.local (FASE 9 implementación)
NEXT_PUBLIC_BUSINESS_ADDRESS_SHORT=Cra 43A # 11-12, El Poblado, Medellín
# Solo se usa para el mensaje "Te esperamos en X". Si no se setea, el mensaje
# omite la dirección.
```

**NO se necesita:**
- `WHATSAPP_PROVIDER` (NO va al sistema).
- `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_API_VERSION` — todas eliminadas.
- ngrok para webhook (no hay webhook).
- Templates aprobadas Meta.

### C.4 Setup operativo (lo único que tenés que hacer)

1. **WhatsApp Business app** en el celular del local con el número que vas a publicar a clientes. Activá la verificación en 2 pasos.
2. **WhatsApp Web logueado** en el navegador del computador del POS (`https://web.whatsapp.com`). Marcá "Mantener sesión iniciada".
3. **Mantener WhatsApp Web abierto** (pestaña fija) durante todo el horario de servicio.
4. **Probar:** abrí en otra pestaña `https://wa.me/573001234567?text=Hola%20prueba` con un número tuyo → tiene que abrir conversación con mensaje pre-llenado.

**Eso es todo.** No hay trámites con Meta, no hay verificación de negocio, no hay templates.

### C.5 Costo

| Item | Costo |
|---|---|
| Cuenta Meta Business | n/a (no se usa) |
| Trámite WABA | n/a (no se usa) |
| Conversaciones Meta | $0 (no aplica) |
| WhatsApp Web del local | $0 |
| **Total operativo** | **$0/mes** |

vs. WABA original: ~$470k COP/mes a régimen → **ahorro 100%**.

### C.6 Limitaciones (transparencia)

- **El cajero/cocinero tiene que estar atento.** Si olvida hacer click, el cliente no recibe mensaje. Mitigación: badge UX persistente "Sin aceptar" en rojo + tracking que detecta cajeros con bajo % de envíos.
- **No hay confirmación programática de delivery.** No sabés si el mensaje llegó al cliente — solo sabés que se hizo click en el link.
- **Latencia operacional:** mensaje sale en segundos a minutos (depende del operador), vs. instantáneo de WABA.
- **Si el celular del local pierde sesión** de WhatsApp Web, el flujo se rompe hasta que alguien vuelva a escanear el QR.

Aceptables para 1 local con presupuesto chico. Si volumen >100 pedidos web/día y los trade-offs duelen, considerar migrar a Twilio WhatsApp en una FASE futura (estimación $30 USD/mes para ese volumen).

---

## 7.bis [DEPRECADO 2026-05-04] Meta WhatsApp Business Platform — NO USAR

> **Esta sección queda como referencia histórica.** Si en el futuro el volumen justifica WABA y el presupuesto crece, retomá esta guía. Por ahora, el sistema usa wa.me semi-automático (sec 7).

### C.1.dep Verificación del negocio en Meta Business Manager

**Cuándo:** 3-4 semanas antes de FASE 9. **El trámite es el más lento de todo el deploy.**

**Pasos:**
1. https://business.facebook.com → "Crear cuenta de empresa".
2. Datos requeridos:
   - Razón social del negocio.
   - NIT (formato 901.xxx.xxx-x).
   - Dirección física verificable.
   - Teléfono fijo del local (no celular).
   - Email corporativo (no Gmail personal — preferible `@tudominio.co`).
3. Verificación documental — Meta pide (subir como PDF):
   - **Documento de identidad** del propietario legal (cédula colombiana ambas caras).
   - **RUT actualizado** de la empresa (no más de 3 meses).
   - **Comprobante de domicilio del negocio** — factura de servicio público (luz/agua/gas) <3 meses, a nombre del negocio o cesión firmada del propietario del inmueble.
4. **Tiempo de aprobación:** 5-15 días hábiles. Hacés el trámite y esperás email.

**Gotchas:**
- Si el RUT no coincide al pelo con el nombre de la cuenta de Business Manager → rechazo. Verificá tipeo exacto.
- Meta a veces pide videollamada de verificación (5 min, mostrás cédula a cámara). No hay forma de saltarlo.

### C.2 Aplicar a WhatsApp Business Platform (WABA)

**Cuándo:** después de C.1 aprobado.

**Pasos:**
1. En Business Manager → "WhatsApp Manager" → "Comenzar".
2. **Asignar número de teléfono dedicado:**
   - El número NO puede estar registrado en WhatsApp normal o WhatsApp Business app actualmente.
   - Opciones:
     - (a) Comprar SIM nueva con un número exclusivo para esto.
     - (b) Sacar tu número actual de WhatsApp app (Configuración → Cuenta → Eliminar mi cuenta), esperar 5 min, registrarlo en WABA.
   - Meta envía OTP por SMS o llamada para activar.
3. **Crear App en Meta for Developers:**
   - https://developers.facebook.com/apps → "Create App" → tipo "Business" → asignarla a tu Business Manager.
   - Add Product → "WhatsApp" → "Set up".
   - "API Setup" muestra:
     - `Phone Number ID` (capturar)
     - `WhatsApp Business Account ID` (capturar)
     - **Token temporal de 24h** — sirve para test rápido pero NO para prod.
4. **Generar token permanente:**
   - Business Manager → "System Users" → "Add" → tipo "Admin".
   - Asignar el System User a la App de WhatsApp con permisos `whatsapp_business_management` + `whatsapp_business_messaging`.
   - System User → "Generate New Token" → seleccionar la app → permisos `whatsapp_business_management` + `whatsapp_business_messaging` → "Never expires".
   - **GUARDÁ ESTE TOKEN EN PASSWORD MANAGER. No se puede recuperar después.**

**Variables a capturar:**
```bash
# apps/api/.env (cuando arranque FASE 9)
WHATSAPP_PROVIDER=meta
WHATSAPP_PHONE_NUMBER_ID=12345678901234567
WHATSAPP_BUSINESS_ACCOUNT_ID=10987654321098765
WHATSAPP_ACCESS_TOKEN=EAAxx...                # token permanente
WHATSAPP_VERIFY_TOKEN=<inventarlo: 32 chars>  # para webhook handshake
WHATSAPP_API_VERSION=v21.0                    # latest stable cuando setees
```

### C.3 Plantillas de mensaje (Message Templates)

**Cuándo:** apenas tengas WABA aprobado. Cada template tarda 24-48h en aprobarse.

Meta exige plantillas pre-aprobadas para mensajes salientes (excepto dentro de la ventana 24h post-respuesta del usuario). Para nuestro caso, todos los mensajes son TRANSACTIONAL (no marketing) — categoría más laxa.

**Plantillas que usa el sistema:**
1. **`pedido_confirmado`** — categoría TRANSACTIONAL, idioma `es_CO`:
   ```
   Hola {{1}}, tu pedido #{{2}} por {{3}} fue confirmado en Tercos. ¡A cocina! 🍔
   ```
   Variables: `{{1}}=customerName`, `{{2}}=receiptNumber`, `{{3}}=total`.

2. **`pedido_listo`** — TRANSACTIONAL:
   ```
   Tu pedido #{{1}} está listo para retirar. Te esperamos en Tercos {{2}}.
   ```
   `{{1}}=receiptNumber`, `{{2}}=address`.

3. **`pedido_15min_recordatorio`** — TRANSACTIONAL (cron `fifteen-min-warning` ya existe en backend):
   ```
   Recordatorio: tu pedido #{{1}} está listo en Tercos hace 15 minutos. Pasá a retirarlo cuanto antes 🙏
   ```

**Pasos para crearlas:**
1. WhatsApp Manager → "Message Templates" → "Create Template".
2. Categoría: Transactional → Other Transactional.
3. Idioma: Spanish (Colombia) `es_CO`.
4. Header: ninguno (más fácil aprobar).
5. Body: pegar template con `{{1}}`, `{{2}}`, etc. **Ejemplos rellenos en el campo "Sample"** son obligatorios para que apruebe.
6. Footer (opcional): "Tercos Burgers · No respondas a este mensaje" (informa al cliente).
7. Buttons (opcional): "Quick Reply: Ya retiré" para pedido_listo.
8. Submit. Esperar email de aprobación.

**Gotchas:**
- Templates con tono marketing ("¡PROMO! Solo hoy 50% off") siempre se rechazan en categoría TRANSACTIONAL — Meta los manda a MARKETING que es más cara y restringida.
- No usar emojis en exceso (1-2 max) — algunos países rechazan templates muy "marketing-ish".
- Si Meta rechaza, te dicen razón → corregís y resubmit (mismo nombre permitido).

### C.4 Webhook (recibir mensajes del cliente)

**Cuándo:** cuando arranque FASE 9 (después de templates aprobados). En dev el webhook lo manejamos con `ngrok`. En prod va al deploy de Railway (FASE 15).

**Pasos en dev:**
1. Instalar `ngrok` (https://ngrok.com/download) o usar localtunnel.
2. Levantar el backend local: `pnpm -F @pos-tercos/api dev`.
3. En otra terminal: `ngrok http 3001` → te da URL tipo `https://abc123.ngrok-free.app`.
4. En Meta App → WhatsApp → Configuration → Webhook → "Edit":
   - Callback URL: `https://abc123.ngrok-free.app/whatsapp/webhook`
   - Verify Token: el `WHATSAPP_VERIFY_TOKEN` que pusiste en `.env`.
   - Subscribe to fields: `messages` (recibir respuestas), `message_template_status_update` (saber cuándo te aprueban templates).
5. Meta hace GET inmediato a tu webhook para verificar el token. Si tu backend responde 200 con el `hub.challenge` echoed, queda activo.

**Pasos en prod (FASE 15):**
- Mismo flow pero la URL es tu dominio Railway: `https://api.tercosburgers.co/whatsapp/webhook`.
- ngrok desaparece.

### C.5 Mientras Meta aprueba — desarrollo con MOCK

FASE 9 arranca con `WHATSAPP_PROVIDER=mock`. El mock adapter:
- Logea cada "envío" a `apps/api/tmp/whatsapp/{timestamp}-{templateName}.json`.
- Hay un dashboard en `apps/admin/(authenticated)/whatsapp` (Dev Inbox) que lista los archivos.
- NO consume créditos reales. NO necesita credenciales.
- La migración a real es cambiar `WHATSAPP_PROVIDER=mock|meta` en env y reiniciar.

---

## 8. Sección D — Despliegue producción (antes de FASE 15)

### D.1 Cloudflare R2 (storage)

**Para qué:** imágenes de facturas (FASE 4), recibos archivados (FASE 5.D), backups.

**Pasos:**
1. https://dash.cloudflare.com/sign-up — crear cuenta (gratis).
2. Verificar email.
3. Dashboard → "R2" (sidebar izq) → habilitar (pide tarjeta de crédito pero $0 hasta superar free tier).
4. "Create bucket":
   - Name: `pos-tercos-prod`
   - Region: `Western North America` (ENAM/WNAM, más cerca de Bogotá que EEUR/APAC).
   - Storage class: Standard.
5. "Manage R2 API Tokens" → "Create API token":
   - Permissions: "Object Read & Write".
   - Specify bucket: `pos-tercos-prod`.
   - TTL: "Forever".
   - Crear → te da `Access Key ID` + `Secret Access Key` (mostrados UNA VEZ).
6. Configurar acceso público de objects (opcional — solo si servís imágenes directo desde R2 al browser):
   - Bucket → Settings → Public access → "Allow Access" → genera URL pública `https://pub-<hash>.r2.dev`.
   - Mejor: conectar custom domain `cdn.tercosburgers.co` (Bucket → Settings → Custom Domains).

**Variables a capturar:**
```bash
# apps/api/.env (FASE 15 deploy)
STORAGE_PROVIDER=r2
R2_ACCOUNT_ID=<32-char hex>                  # dashboard → R2 → "Account ID" arriba a la derecha
R2_ACCESS_KEY_ID=<key id del token>
R2_SECRET_ACCESS_KEY=<secret del token>
R2_BUCKET_NAME=pos-tercos-prod
R2_PUBLIC_URL=https://cdn.tercosburgers.co  # o https://pub-xxx.r2.dev
R2_REGION=auto                                # R2 ignora region pero AWS SDK lo exige
```

**CORS (si servís imágenes desde admin frontend):**
- Bucket → Settings → CORS Policy → add:
  ```json
  [{
    "AllowedOrigins": ["https://admin.tercosburgers.co"],
    "AllowedMethods": ["GET"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }]
  ```

**Costo:**
- 10 GB storage free.
- $0.015 / GB / mes después.
- **Egress GRATIS** (esto es la matada vs S3 que cobra $0.09/GB).
- Operations: 1M Class A free + 10M Class B free / mes.

**Gotchas:**
- R2 implementa S3 API → se usa con AWS SDK v3 normal (`@aws-sdk/client-s3`). El backend del proyecto ya tiene la interfaz `StorageProvider` lista — solo se cambia el adapter.
- El "Account ID" en R2 NO es el de Cloudflare general — es el específico de R2. Está arriba a la derecha del dashboard de R2.

### D.2 Railway (backend NestJS)

**Para qué:** correr `apps/api` + Postgres + workers/crons.

**Pasos:**
1. https://railway.app/login → "Login with GitHub".
2. "New Project" → "Deploy from GitHub repo" → seleccionar el repo (debe ser tuyo y dar permisos).
3. Railway detecta el monorepo. Configurar el servicio:
   - Service name: `api-tercos`.
   - Settings → Source → **Root Directory**: `apps/api` (CRÍTICO porque es monorepo).
   - Build → **Build Command**: `cd ../.. && pnpm install --frozen-lockfile && pnpm -F @pos-tercos/api build`.
   - Build → **Start Command**: `cd ../.. && pnpm -F @pos-tercos/api start:prod` (o `node dist/main.js` desde el cwd de la app).
   - Watch Paths: `apps/api/**`, `packages/types/**`, `packages/domain/**`.
4. Add → "Database" → "Add PostgreSQL" → genera variable `DATABASE_URL` automáticamente y la inyecta al servicio.
5. Variables: copiar todas las del `apps/api/.env` excepto `DATABASE_URL` (Railway la setea sola). Reemplazar:
   - `API_HOST=0.0.0.0`
   - `CORS_ORIGINS` apuntando a tus dominios prod (ver D.4).
   - `WEB_ORDER_TOKEN_SECRET`, `JWT_*_SECRET` con valores nuevos generados (NO reutilizar los de dev).
   - `STORAGE_PROVIDER=r2` + las R2_* (ver D.1).
   - `WHATSAPP_*` (ver C).
6. "Generate Domain": Settings → Networking → "Generate Domain" → te da `api-tercos-production.up.railway.app`.
7. Conectar custom domain (opcional, ver D.4): `api.tercosburgers.co`.
8. Migrations en deploy:
   - Build hook: agregar `pnpm -F @pos-tercos/api prisma migrate deploy` en build command, ANTES de build.
   - Final: `cd ../.. && pnpm install --frozen-lockfile && pnpm -F @pos-tercos/api prisma migrate deploy && pnpm -F @pos-tercos/api build`.

**Costo:**
- $5/mes "Hobby" plan (incluye $5 de uso → cubre 1 servicio chico).
- Postgres aparte: $5-10/mes (según tamaño).
- "Pro" plan $20/mes/dev recomendado para prod (más recursos garantizados).

**Gotchas:**
- Railway usa Nixpacks por default — para monorepos pnpm a veces falla detectar workspaces. Si rompe, agregar archivo `railway.json` en root con buildpack explícito.
- WebSockets: Railway soporta WS nativo, no requiere config extra. socket.io funciona out of the box.
- Prisma binary targets: en `apps/api/prisma/schema.prisma` debe tener `binaryTargets = ["native", "rhel-openssl-3.0.x"]` para Linux x64 de Railway.
- Postgres de Railway sale con `?sslmode=require` en la URL — Prisma lo respeta.
- Dominio custom requiere agregar CNAME en Cloudflare (ver D.4).

### D.3 Vercel (frontends Next.js)

**Para qué:** hostear `apps/web`, `apps/admin`, `apps/pos`, `apps/kds`, `apps/public-display`. Cada uno como proyecto Vercel separado, todos del mismo repo.

**Pasos por cada app:**
1. https://vercel.com/signup con GitHub.
2. "Add New" → "Project" → Import el repo.
3. Configure project:
   - Framework Preset: Next.js (auto-detectado).
   - Root Directory: `apps/<nombre>` (ej. `apps/web`).
   - Build Command: `cd ../.. && pnpm install --frozen-lockfile && pnpm -F @pos-tercos/types build && pnpm -F @pos-tercos/domain build && pnpm -F @pos-tercos/<nombre> build`.
   - Output Directory: `.next`.
   - Install Command: `pnpm install --frozen-lockfile` (a nivel root del repo).
4. Environment Variables (varía por app — ver tabla abajo).
5. Deploy. Vercel te da `<proyecto>.vercel.app`.

**Variables por app:**

| App | Variable | Valor (prod) |
|---|---|---|
| **TODAS las apps con auth** | `JWT_ACCESS_SECRET` | mismo que API en Railway |
| **TODAS** | `API_INTERNAL_URL` | `https://api.tercosburgers.co` |
| **TODAS las que usan WS** | `NEXT_PUBLIC_API_WS_URL` | `https://api.tercosburgers.co` |
| `apps/web` | `NEXT_PUBLIC_API_URL` | `https://api.tercosburgers.co` |
| `apps/web` | `NEXT_PUBLIC_MAPBOX_TOKEN` | token público (FASE 8) |
| `apps/web` | `NEXT_PUBLIC_PAYMENT_NEQUI` | `300 1234567 (Tercos)` |
| `apps/web` | `NEXT_PUBLIC_PAYMENT_TRANSFER` | `Bancolombia ahorros 12345...` |
| `apps/public-display` | `NEXT_PUBLIC_API_URL` | `https://api.tercosburgers.co` |

**Conectar dominios** (ver D.4):
- `tercosburgers.co` → web
- `admin.tercosburgers.co` → admin
- `pos.tercosburgers.co` → pos
- `cocina.tercosburgers.co` → kds
- `pantalla.tercosburgers.co` → public-display

**Costo:**
- Hobby plan **GRATIS** para personal (1 dev, sin equipo). Suficiente para empezar.
- 100 GB bandwidth/mes free.
- Pro $20/mes/miembro si necesitás analytics, password protection, custom roles.

**Gotchas:**
- Vercel tiene timeout 10s en serverless functions (Hobby) o 60s (Pro). El backend NO se hostea acá — solo SSR/Server Components, que ya son rápidos.
- Edge runtime para middlewares: el `middleware.ts` de cada app usa `jose` (Edge-compatible) — funciona OK.
- WebSockets NO funcionan desde Vercel — por eso el WS apunta al API en Railway directo (cross-origin con token en handshake.auth — ya implementado).

### D.4 Dominios + DNS

**Para qué:** URLs custom en lugar de `*.vercel.app` y `*.railway.app`.

**Pasos:**
1. Comprar dominio. Recomendaciones:
   - Namecheap (https://www.namecheap.com) — `.co` ~$30/año, soporte rápido.
   - Cloudflare Registrar (https://dash.cloudflare.com → Domain Registration) — at-cost (sin markup), $9.15/año `.com`. **Recomendada porque ya vas a usar Cloudflare DNS.**
   - GoDaddy — más caro, evitar.
2. Una vez comprado, **mover DNS a Cloudflare** (gratis, mejor performance):
   - En Cloudflare → "Add a Site" → ingresar dominio.
   - Cloudflare scanea DNS records existentes.
   - Plan: Free.
   - Cloudflare te da 2 nameservers (ej. `aria.ns.cloudflare.com`, `ben.ns.cloudflare.com`).
   - En el registrar, cambiar nameservers del dominio a los de Cloudflare.
   - Esperar propagación (1-24h, usualmente <30min).
3. Agregar DNS records en Cloudflare → DNS:
   - **API (Railway):**
     - Type: CNAME, Name: `api`, Target: `<your-app>.up.railway.app`, Proxy: OFF (gris) — Railway maneja SSL.
     - En Railway → Settings → Networking → "Custom Domain" → ingresar `api.tercosburgers.co` → Railway te muestra qué CNAME apuntar.
   - **Web (Vercel):**
     - Type: A, Name: `@` (apex), Target: `76.76.21.21` (Vercel IP).
     - Type: CNAME, Name: `www`, Target: `cname.vercel-dns.com`.
     - En Vercel proyecto web → Settings → Domains → "Add" `tercosburgers.co` y `www.tercosburgers.co`.
   - **Subdominios (Vercel):**
     - Type: CNAME, Name: `admin`, Target: `cname.vercel-dns.com`. (idem para pos, cocina, pantalla).
     - En cada Vercel project → Domains → Add el subdominio.
4. **SSL:** automático en Cloudflare + Vercel + Railway. No hacer nada.
5. **Cloudflare Proxy ON o OFF:** para Vercel y Railway dejarlo OFF (gris). Cloudflare proxy puede romper WebSockets/SSE.

**Costos:**
- Dominio: $10-30/año según TLD.
- DNS Cloudflare: GRATIS.

### D.5 Hardware

**Cuándo:** comprarlo 2-3 sem antes de inaugurar. Tener el hardware permite testear FASE 5.D y 15 con dispositivos reales.

| Item | Modelo recomendado | Precio aprox COP | Para qué |
|---|---|---|---|
| Impresora térmica USB | Epson TM-T20III | $400.000 | Recibos 80mm. Compatible ESC/POS. |
| Cajón monedero RJ11 | Genérico (compatible Epson) | $200.000 | Conecta a la TM-T20III por puerto RJ11. Apertura por comando ESC/POS. |
| Tablet Android KDS | Cualquiera 10"+, 4GB RAM, Android 10+ | $600.000 | Modo kiosko Chrome → http://kds.tercosburgers.co/ |
| Tablet/TV pantalla pública | Igual o TV Smart con Android | $600.000 - $1.500.000 | Modo kiosko Chrome → http://pantalla.tercosburgers.co/ |
| Lector códigos USB (opcional) | Honeywell Voyager 1450g | $300.000 | Para combos con códigos físicos (FASE 15+). |
| Mini PC (Print Agent) | Raspberry Pi 4 4GB + microSD 32GB | $400.000 | Corre `apps/print-agent` en :9100. Conecta USB a impresora. |
| UPS pequeño | APC Back-UPS 600VA | $250.000 | Aguanta apagones (10-15 min) — POS no se cae mid-venta. |

**Consideraciones:**
- La impresora **NO se conecta directo al browser**. Browsers no pueden hablar USB directo en producción confiable. Por eso `apps/print-agent` corre en una mini-PC dentro del local, conectada por USB a la impresora, exponiendo `POST :9100/print` que el POS llama por LAN.
- Mientras tanto (dev), el POS usa `window.open(blob)` con el HTML del recibo y la impresora compartida del SO (Mac/Windows).
- Las tablets KDS y pantalla pública se ponen en **modo kiosko**:
  - Chrome → `chrome://settings/content/notifications` → bloquear notificaciones.
  - Lanzar Chrome con flags `--kiosk --disable-features=TranslateUI`.
  - Para Android: Fully Kiosk Browser (app de pago, ~$10) o lanzador kiosko nativo de Android Enterprise.

### D.6 Print Agent local (FASE 15)

**Pasos para deploy en mini-PC (Raspberry Pi):**
1. Flashear Raspberry Pi OS Lite con Raspberry Pi Imager.
2. SSH al Pi: `ssh pi@<ip-local>`.
3. Instalar Node 20: `curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -` + `sudo apt install nodejs`.
4. Clonar el repo (subset apps/print-agent): `git clone <url> /opt/tercos`.
5. `cd /opt/tercos && pnpm install`.
6. Conectar la Epson TM-T20III por USB. `lsusb` → debe aparecer `Seiko Epson Corp.`.
7. Instalar `escpos-usb` o usar `node-thermal-printer`. Configurar `apps/print-agent/.env` con vendor/product IDs.
8. Crear systemd service `/etc/systemd/system/print-agent.service`:
   ```ini
   [Unit]
   Description=POS Tercos Print Agent
   After=network.target
   [Service]
   ExecStart=/usr/bin/pnpm -F @pos-tercos/print-agent start
   WorkingDirectory=/opt/tercos
   Restart=always
   User=pi
   [Install]
   WantedBy=multi-user.target
   ```
9. `sudo systemctl enable --now print-agent`.
10. Asignar IP fija al Pi en el router del local (ej. `192.168.1.50`).
11. En POS prod, env var: `PRINTER_AGENT_URL=http://192.168.1.50:9100`.

---

## 9. Sección E — Pendientes externos misceláneos

### E.1 Onboarding contador / DIAN (factura electrónica)

**Aplica si:** el negocio supera el umbral DIAN o quiere emitir factura electrónica desde el inicio.

**Decisión:** v1 NO emite factura electrónica DIAN — solo recibos de venta. Si querés agregarlo:
- Proveedores recomendados Colombia: **Alegra** (https://alegra.com), **Siigo**, **Facturatech**.
- Integración via API REST (todos exponen API).
- Costo: $30-80 USD/mes según volumen.
- Implementación: nueva fase (post-15) o intercalada en FASE 14.

### E.2 Proveedor de pagos online (opcional)

**Aplica si:** querés cobrar online desde la web (ahora es Nequi/transfer manual con verificación del cajero).

**Opciones Colombia:**
- **Wompi** (Bancolombia) — más popular, integración fácil. Comisión ~2.99% + IVA.
- **Mercado Pago** — comisión ~2.49% + IVA.
- **ePayco** — local, comisión variable.

**Implementación:** agregar adapter `PaymentGateway` en `@pos-tercos/domain`, endpoint `POST /web/orders/:id/checkout-session`, redirect a la pasarela, webhook `/payments/webhook`. Esto es FASE 12 o adicional.

### E.3 OpenAI (fallback IA facturas)

**Para qué:** si Anthropic falla o se cae, el sistema cae a OpenAI automáticamente.

**Pasos:**
1. https://platform.openai.com → Sign up.
2. Settings → Billing → agregar tarjeta + cargar $5 USD inicial.
3. API keys → Create new secret key → guardar.
4. En `apps/api/.env`:
   ```
   OPENAI_API_KEY=sk-proj-...
   OPENAI_MODEL=gpt-4o-mini
   ```

**Costo:** $0.15/M input + $0.60/M output tokens (gpt-4o-mini). Para nuestras facturas (~5k tokens/factura) = $0.001/factura.

---

## 10. Glossary de variables de entorno

| Variable | Donde | FASE | Descripción |
|---|---|---|---|
| `DATABASE_URL` | API | 0 | Postgres connection string. |
| `JWT_ACCESS_SECRET` | API + frontends con middleware | 1 | Firma JWT 15min. Mismo en API y frontends (para verify en Edge). |
| `JWT_REFRESH_SECRET` | API | 1 | Firma JWT refresh 7d. SOLO API. |
| `ANTHROPIC_API_KEY` | API | 4 | Claude vision para extraer facturas. |
| `ANTHROPIC_MODEL` | API | 4 | `claude-haiku-4-5`. |
| `OPENAI_API_KEY` | API | 4 | Fallback. |
| `LLM_PROVIDER` | API | 4 | `anthropic` o `openai`. |
| `WEB_ORDER_TOKEN_SECRET` | API | 7 | Firma HMAC del tracking token de pedidos web. |
| `PAYMENT_INSTRUCTIONS_NEQUI` | API | 7 | Texto Nequi (ej. "300 1234567"). |
| `PAYMENT_INSTRUCTIONS_TRANSFER` | API | 7 | Texto transfer. |
| `NEXT_PUBLIC_PAYMENT_NEQUI` | apps/web | 7 | Espejo client-side. |
| `NEXT_PUBLIC_PAYMENT_TRANSFER` | apps/web | 7 | Espejo client-side. |
| `RESTAURANT_LAT/LNG/RADIUS_KM` | API | 8 | Geo del local + radio delivery. |
| `MAPBOX_SECRET_TOKEN` | API | 8 | `sk.eyJ...` server-side geocoding. |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | apps/web | 8 | `pk.eyJ...` autocomplete + maps. |
| ~~`WHATSAPP_PROVIDER`~~ | — | ~~9~~ | **Eliminado** — wa.me no usa adapter backend |
| ~~`WHATSAPP_PHONE_NUMBER_ID`~~ | — | ~~9~~ | **Eliminado** — no hay Meta WABA |
| ~~`WHATSAPP_BUSINESS_ACCOUNT_ID`~~ | — | ~~9~~ | **Eliminado** |
| ~~`WHATSAPP_ACCESS_TOKEN`~~ | — | ~~9~~ | **Eliminado** |
| ~~`WHATSAPP_VERIFY_TOKEN`~~ | — | ~~9~~ | **Eliminado** — no hay webhook |
| ~~`WHATSAPP_API_VERSION`~~ | — | ~~9~~ | **Eliminado** |
| `NEXT_PUBLIC_BUSINESS_ADDRESS_SHORT` | apps/web | 9 | Texto corto del local para mensaje "Te esperamos en X" en wa.me link |
| `STORAGE_PROVIDER` | API | 4/15 | `local` (dev) o `r2` (prod). |
| `STORAGE_LOCAL_PATH` | API | 4 | `./tmp/uploads` en dev. |
| `R2_ACCOUNT_ID` | API | 15 | de Cloudflare R2 dashboard. |
| `R2_ACCESS_KEY_ID` | API | 15 | API token. |
| `R2_SECRET_ACCESS_KEY` | API | 15 | API token secret. |
| `R2_BUCKET_NAME` | API | 15 | `pos-tercos-prod`. |
| `R2_PUBLIC_URL` | API | 15 | `https://cdn.tercosburgers.co` o `https://pub-xxx.r2.dev`. |
| `RECEIPT_BUSINESS_*` | API | 5.D | Branding del recibo (NAME, ADDRESS, NIT, PHONE). |
| `API_INTERNAL_URL` | frontends | 1 | URL del API para SSR fetch. |
| `NEXT_PUBLIC_API_URL` | apps/public-display, apps/web | 6+ | URL del API para EventSource (SSE). |
| `NEXT_PUBLIC_API_WS_URL` | apps/kds, apps/pos, apps/web | 6+ | URL del API para socket.io. |
| `CORS_ORIGINS` | API | 0 | CSV de orígenes permitidos. |
| `PRINTER_AGENT_URL` | API o POS | 15 | URL del print-agent local en LAN. |

---

## 11. Checklist de pre-launch

Antes de inaugurar el local con clientes reales:

- [x] FASES 0-7, 11 + FASE 4 ajustes implementadas. Pendientes: 8, 9 (wa.me), 12, 13, 14, 15 (en ese orden).
- [x] FASE 4 ajustes P0 cerrados (combos, directResale UI, validaciones invoice).
- [x] Cuenta Mapbox creada + token público funcionando (probado con Medellín).
- [x] ~~WABA aprobada + templates~~ → **N/A.** Reemplazado por wa.me semi-automático (sec 7). Único requisito: WhatsApp Web logueado en computador del POS.
- [x] R2 bucket `pos-tercos-prod` creado + Account API Token con permisos Object R/W + credenciales en password manager.
- [ ] Railway: API + Postgres deployed, dominio custom apuntando. **Eliminar primero los 5 servicios de prueba creados** (kds, pos, admin, api, public-display) — solo va `api`.
- [ ] Vercel: 5 frontends deployed (web, admin, pos, kds, public-display) como proyectos separados, dominios custom apuntando.
- [ ] Cloudflare: DNS configurado, SSL activo en todo.
- [ ] Hardware comprado: impresora, cajón, 2 tablets, mini-PC, UPS.
- [ ] Print Agent corriendo en mini-PC del local.
- [ ] Recibos imprimen con branding del negocio.
- [ ] Test e2e en prod: cobrar venta CASH → recibo imprime → cajón abre → KDS recibe → pantalla muestra.
- [ ] Test e2e web: cliente pide pickup → POS ve pedido "Sin aceptar" → cajero **"Aceptar y contactar"** abre WhatsApp → cliente envía comprobante por WhatsApp → cajero verifica → "Confirmar pago" abre WhatsApp "confirmado" → cocina prepara → "Marcar listo" abre WhatsApp "listo".
- [ ] Backup automático de Postgres habilitado en Railway Pro (Hobby NO incluye) — verificar o setear cron a R2.
- [ ] Plan de fallback offline: docs para cajero (qué hacer si se cae internet).
- [ ] Cuenta de monitoreo: UptimeRobot (free) ping cada 5min al endpoint health del API.
- [ ] Sentry o similar para error tracking (opcional).

---

## 12. Cómo usar este documento en otro chat IA

1. Crear chat nuevo con la IA de tu elección (Claude, ChatGPT, Gemini).
2. Pegar el contenido completo de este `.md` como primer mensaje, prefijado con:
   > "Soy emprendedor solo construyendo POS Tercos. Este es el contexto del proyecto y los pendientes externos. Resolveme dudas sobre cualquiera de los pasos."
3. Hacer preguntas específicas, ej:
   - "¿Cómo verifico mi negocio en Meta Business Manager si no tengo factura de servicio público a nombre del local?"
   - "Mi token de Mapbox no funciona desde el frontend, ¿qué chequear?"
   - "Railway me está fallando el build, error de pnpm workspaces — ¿qué configuro?"
   - "¿Cuál tablet Android me recomendás para la pantalla pública con buen brillo y precio?"

La IA tendrá suficiente contexto para responder sin necesidad de leer el código del repo.

---

**Última actualización:** este documento corresponde al estado del repo al cierre de **FASE 7** (48 commits en main). Cuando avances en las fases pendientes, actualizá:
- Sec 3 (orden) — marcar fases cerradas con ✅.
- Sec 4 (timeline) — actualizar "antes de FASE X" según vayas progresando.
- Sec 11 (checklist pre-launch) — tachar items completados.
