# POS Tercos — Guía para Claude Code

> **Documento canónico de estado.** Cualquier nuevo contexto/chat debe leer este archivo primero. Refleja todo lo construido y todas las decisiones arquitectónicas que NO se pueden violar.

---

## 0. Contexto del proyecto

POS para restaurante de comida rápida en Colombia. 1 punto de venta, 1 cajero por turno. Solo + Claude Code, target 14–18 semanas, 15 fases local-first.

**Documentos fuente** (leer en este orden si arrancás cold):

1. `CLAUDE.md` (este archivo) — estado vigente, decisiones, módulos vivos. **Único doc canónico de arquitectura del POS.**
2. `pos-spec.v1.md` — alcance v1 cerrado (qué entra, qué no)
3. `ARCHITECTURE.md` — arquitectura REAL del monorepo POS (reescrito 2026-06-10). La plantilla Flutter vieja vive en `apps/kds-flutter/ARCHITECTURE-flutter-template.md`.
4. `implementation-plan.md` — fases de implementación local-first (15 fases; algunas obsoletas por reorientación v2)
5. `kickoff-plan.md` — pendientes externos (hardware, contador, etc.)
6. `testing-guide.md` — checklist e2e ~50 tests sec 1-11 (FASES 0-3)
7. `CHECKLIST-QA-DESPLIEGUE.md` — checklist de QA manual módulo por módulo antes de desplegar (supersede `qa-guiado.md`)
8. `openwa-setup.md` — guía para levantar el gateway OpenWA self-hosted
9. `probar-backend-sin-apps.md` — flujo para testear el backend (venta web + WhatsApp) sin abrir las apps

---

## 1. Stack

- **Backend:** NestJS 11 + Prisma 6 + PostgreSQL 16 (Railway en prod, Docker en dev)
- **Frontends:** Next.js 15 App Router + React 19 + Tailwind v4 (Vercel en prod)
- **Monorepo:** Turborepo + pnpm workspaces
- **Auth:** JWT (access **24h** en cookie+Bearer + refresh 7d httpOnly cookie con rotación). KDS refresca en `auth.error` del WS; POS y admin con `SessionKeeper` (refresh cada 6h + al volver el foco) **+ refresh automático en el middleware** (si el access venció pero el refresh vive, renueva en la misma request — el usuario no ve login mientras el refresh de 7d sea válido).
  - **Aislamiento admin/pos (2026-06-11):** cookies por app (`admin_*`/`pos_*`) + el guard del API exige la cookie de la app que declara `X-Client-App` (sin fallback cruzado) + el middleware de cada app sanea las cookies ajenas antes de proxiar `/api`. ⚠️ Gotcha Next 15.5: el matcher regex `'/((?!...).*)'` NO matchea `/api` — por eso hay una entrada explícita `'/api/:path*'` en ambos middleware. NO quitarla.
  - **DB de tests separada:** los e2e corren contra `pos_tercos_test` (creada+migrada por `test/global-setup.ts`; `setup-env.ts` fuerza `DATABASE_URL`). NUNCA tocan la DB de dev (antes `cleanDb` truncaba usuarios/catálogo de dev y "desaparecían" las sesiones).
- **Realtime:** WebSocket (KDS Flutter via `socket_io_client`, POS via socket.io-client) + SSE (pantalla pública)
- **IA:** Anthropic Claude Haiku 4.5 (primario) + OpenAI GPT-4o-mini (fallback) — vision para facturas
- **WhatsApp:** OpenWA (gateway self-hosted, `whatsapp-web.js`) — envío automático desde backend. Ver sec 4.10. Dev: `MockWhatsAppAdapter` (sin config OpenWA).
- **Storage:** Cloudflare R2 en prod (`R2StorageAdapter`), filesystem local en dev (`./tmp/uploads/...`)
- **Impresora térmica:** Epson TM-T20III via Print Agent local (`apps/print-agent`, ESC/POS bytes), cajón monedero RJ-11
- **PWA:** Solo POS instalable (manifest + SW offline-first). KDS es app Flutter nativa (APK en tablet Android).

---

## 2. Apps y packages

### Apps

| App | Path | Rol | Estado |
|---|---|---|---|
| API | `apps/api` | NestJS backend | FASE 0-9 + 11 + 12 + 13 + 14 + 15 backend ✅ + WS-1/2/3/4 v2 ✅ |
| Admin | `apps/admin` | Next.js — gestión catálogo / inventario / facturas / auditoría / turnos / reportes (ventas/productos/operación) / promos / sugerencias IA / RRHH | FASE 0-4 + 11 + 12 + 13 + 14 UI ✅ |
| ~~POS Cajero~~ | ~~`apps/pos`~~ | **ELIMINADA en el cutover 2026-07-21** (`feat/unify-pos-admin`): la caja vive en `apps/admin` bajo `/caja/*` (features `caja-shifts`, `caja-cortesias`, `catalog`, `sales`, `offline`, `printing`; PWA + SW propios; rol de operación = ADMIN_OPERATIVO — CAJERO retirado). §7.bis abajo es historial. | Cutover ✅ |
| Pantalla del local | `apps/public-display` | Next.js — kiosko de **productos + publicidad + música** (B-roll, sin auth, **sin turnos**) | §7.v10 |
| Cocina | `apps/cocina` | Next.js (responsive, puerto 3006, cookies `cocina_*`) — biblia + producción + inventario de cocina (merma + conteo ciego) + incidencias + checklist | §7.v11 ✅ |
| Web Pública | `apps/web` | Next.js — menú + checkout WEB_PICKUP + status tracking | FASE 7.C-D UI ✅ |
| Print Agent | `apps/print-agent` | Node service local — ESC/POS + cajón monedero | FASE 15.C ✅ |

> **Eliminados en reorientación v2:** `apps/kds` (Next.js KDS), `apps/repa` (repartidor).
> **Eliminados en §7.v10 (2026-06-27):** `apps/kds-flutter` (KDS Flutter) + turnero. La app de cocina futura será **web** (a construir); su backend de producción/biblia/inventario sigue vivo.

### Packages compartidos

| Package | Path | Contenido | SOLO entra | NUNCA entra |
|---|---|---|---|---|
| Types | `packages/types` | Schemas Zod + tipos inferidos + enums | Zod, tipos, enums | Lógica, IO, deps pesadas |
| Domain | `packages/domain` | Funciones puras: `expandRecipe`, fuzzy `bestMatch`, prompts LLM, interfaces de adapters, builders WhatsApp | Lógica pura | IO, HTTP, DB, side-effects |
| UI | `packages/ui` | Componentes visuales (Button, Dialog, LoginForm, Input, Label) | Componentes puros | Lógica de negocio, fetch, estado global |
| Brand | `packages/brand` | Identidad visual compartida entre apps (assets, componentes de marca, data) | Componentes de marca, assets estáticos | Lógica de negocio |

**Build pipeline:**
- `types/` y `domain/` compilan a `dist/` CJS (`pnpm -F @pos-tercos/types build`).
- `ui/` y `brand/` se quedan como source y se transpilan vía `transpilePackages` en cada `next.config.ts`.
- Turbo con `dependsOn: ["^build"]` garantiza orden.
- `packages/config` fue eliminado (estaba vacío).

---

## 3. Reglas de código (OBLIGATORIAS)

> **Enforcement automático (2026-08-14):** las reglas de tamaño y boundaries ya
> NO dependen de memoria — son errores de ESLint: `max-lines` (200 líneas de
> código por `.tsx`), `max-lines-per-function` (50, en `apps/api` +
> `packages/domain`) y `no-restricted-imports` (a un feature ajeno se entra por
> su `index.ts` o `server.ts`, nunca por internos). La deuda EXISTENTE quedó
> congelada en baselines dentro de `eslint.config.mjs` — esa lista solo puede
> achicarse; si tu archivo nuevo la necesita, parte el archivo. Además, el
> nightly `.github/workflows/nightly-checks.yml` corre las leyes matemáticas
> del ledger con 20.000 historias aleatorias (así se encontró el bug de la
> reversa post-corte del snapshot).

### Generales

- **TypeScript strict** en todo el monorepo.
- **Zod** = single source of truth de validación. Backend infiere tipos desde Zod.
- **Prisma** ORM. Una migration por feature, revisable.
- **Idempotency keys** en POST que crean recursos críticos (ventas, movements, confirmaciones).
- **Audit log inmutable** (insert-only via trigger DB) para acciones sensibles.
- **Comentarios mínimos**. Solo "por qué" no evidente, nunca "qué" hace el código.
- **Adapter pattern** OBLIGATORIO para WhatsApp, IA, pagos, billing, storage.

### Backend (`apps/api`) — un módulo por dominio

```
apps/api/src/<dominio>/
├── <dominio>.module.ts
├── <dominio>.controller.ts    # SOLO routing. NUNCA lógica.
├── <dominio>.service.ts       # Toda la lógica. Inyecta otros services.
├── dto/                       # DTOs Zod desde @pos-tercos/types
└── <dominio>.service.spec.ts
```

**Dominios vivos hoy:** `auth`, `users`, `prisma`, `health`, `ingredients`, `subproducts`, `products`, `recipes`, `inventory`, `audit`, `suppliers`, `invoices`, `sales`, `kds`, `shifts`, `promotions`, `web-orders`, `web-menu`, `public-display`, `reports`, `purchase-suggestions`, `workers`, `notifications`, `adapters/llm`, `adapters/storage`, `adapters/printer`, `adapters/cash-drawer`, `adapters/whatsapp`, `common`. (WhatsApp se envía automáticamente desde `NotificationService` via `WhatsAppProvider` + `OpenWaWhatsAppAdapter`/`MockWhatsAppAdapter`. El endpoint `POST /sales/:id/whatsapp-clicked` fue **eliminado** en v2.)

**Dominios eliminados en v2:** `adapters/maps` (Mapbox/geocoding). **No existen más.** `delivery` nunca se creó y está descartado.

**Reglas backend:**
- ❌ NUNCA `PrismaService` en controller. Solo en service.
- ❌ NUNCA lógica de negocio en controller.
- ❌ NUNCA acceder a entidades de otro dominio directamente con Prisma — pedirle al `<X>Service` inyectado. **Excepción documentada:** los servicios **agregadores de reportes/finanzas** (`reports/*`, `treasury`) leen tablas de varios dominios en una sola pasada (P&G, COGS FIFO cronológico, reconciliación, dashboard). Son read-only y por naturaleza cross-entidad; envolver cada lectura en su `<X>Service` agregaría N llamadas sin valor. Estos módulos PUEDEN usar Prisma cross-dominio para LECTURA; las ESCRITURAS siguen yendo por el service dueño.
- ❌ NUNCA mezclar adapters externos con lógica de dominio (van en `apps/api/src/adapters/<provider>/` detrás de interfaces de `@pos-tercos/domain`).
- ✅ SIEMPRE validar input con Zod en controller (pipe propio).
- ✅ SIEMPRE retornar DTOs explícitos, nunca entidades Prisma crudas.
- ✅ SIEMPRE registrar acciones sensibles vía `AuditService.log(...)` desde el service.
- ✅ Tests en `.spec.ts` happy + edge cases.
- ✅ **Fechas (convención 2026-07-09, `common/local-dates.ts`)**: columnas timestamp (`paidAt`, …) se comparan contra ventanas en hora LOCAL (`getBusinessMonthWindow`/`parseDateRange`); columnas fecha-solo (`@db.Date`/`parseYmd` = medianoche UTC: `hireDate`, `workDate`, `periodStart` nómina, `startedAt` costos fijos, `activeFrom/To` promos, `anchorDate`) se comparan contra `utcDateOfLocalDay(...)`. Serializar un instante local a YYYY-MM-DD SIEMPRE con `ymdLocal` — NUNCA `toISOString().slice(0,10)` (en Bogotá corre el fin de mes al día 1 del mes siguiente). Fecha elegida por el usuario vs timestamps → `localMidnightOfYmd`. **La OPERACIÓN de la caja usa día de NEGOCIO (corte 4 am, `startOfBusinessDay` en domain — ver §7.v14); la atribución contable de ventas sigue en día calendario.**

### Frontend (`apps/<next>`) — feature-based

```
apps/<app>/src/
├── app/                # Pages thin. Composición de features. SIN lógica.
├── features/<feature>/
│   ├── components/
│   ├── hooks/
│   ├── api/            # fetch wrappers tipados (Zod parse)
│   ├── server.ts       # helpers SSR (cookies + serverFetchJson)
│   └── index.ts        # barrel
└── lib/                # utilidades transversales (api-server, auth-config)
```

**Reglas frontend:**
- ❌ NUNCA `fetch()` directo en componente — siempre por `features/<x>/api/`.
- ❌ NUNCA `'use client'` sin necesidad real. Server Components por defecto.
- ❌ NUNCA importar de `app/<route>/...` desde otro lugar.
- ❌ NUNCA importar de un feature ajeno sin pasar por su `index.ts`.
- ✅ SIEMPRE componentes <200 líneas. Si crece, partir.
- ✅ SIEMPRE importar tipos de `@pos-tercos/types` cuando hay contrato compartido.

### Textos que ve el usuario (copy)

- **Español neutro, con TUTEO. Nunca voseo.** "Vuelve a intentar", no "Volvé";
  "no tienes permiso", no "no tenés". La app está escrita así (150 usos contra
  2 al momento de fijar la regla) y mezclar las dos formas se nota. La regla ya
  estaba, pero enterrada dentro de un prompt del LLM
  (`packages/domain/src/llm/prompt.ts`) — por eso se coló voseo más de una vez.
- **Un mensaje de error le dice a la persona QUÉ pasó y QUÉ hacer.** Nada de
  nombres de excepción, códigos, rutas de la API ni UUIDs. Si el texto solo lo
  entiende quien programó, está mal.
- Los mensajes que van a **logs y a metadata de auditoría** son la excepción:
  ahí sí queremos el error crudo, completo y en el idioma que venga.
- La red de seguridad es `mensajeDeError` (`packages/ui/src/lib/error-message.ts`):
  deja pasar los mensajes del negocio y reemplaza los técnicos. Los helpers
  `getErrorMessage` de cada app delegan ahí — no escribir uno nuevo.

### Naming

- Filenames: `kebab-case` (`sales.service.ts`, `expand-recipe.ts`).
- Components React: `PascalCase` archivo y export (`SalesPanel.tsx`).
- Functions/vars: `camelCase`. Constantes top-level: `SCREAMING_SNAKE`.
- Zod schemas: sufijo `Schema`. Tipos inferidos: sin sufijo.
- Servicios NestJS: sufijo `Service`. Controllers: sufijo `Controller`.

### Forbidden globalmente

- ❌ Funciones >50 líneas. Refactor obligatorio.
- ❌ `utils.ts` basurero — utils con nombre específico al dominio.
- ❌ Importaciones cíclicas entre packages.
- ❌ "God modules" (+5 controllers o +10 services).
- ❌ Estado global compartido entre features (Zustand store gigante).
- ❌ `any` sin justificación documentada.
- ❌ Magic numbers — constantes con nombre.

### ⚠️ NUNCA correr `pnpm build` con `pnpm dev` levantado

`next build` y `next dev` escriben en el MISMO `.next`. Compilar producción con
el dev corriendo deja ese directorio mezclado y la app empieza a fallar con
`Loading chunk app/(...)/page failed` — el chunk cliente no existe— aunque el
código esté perfecto. Cuesta media hora entender que el problema no era la app.

Desde 2026-07-25 hay un guard: `pnpm build` corre `scripts/assert-no-dev-server.mjs`
y falla si alguno de los puertos de dev (3000/3004/3005/3006) está escuchando.
Escape para CI o casos deliberados: `ALLOW_BUILD_WITH_DEV=1 pnpm build`.

Si ya te pasó: pará el dev, `rm -rf apps/<app>/.next` y volvé a levantar.

### Validar antes de cada commit

```bash
pnpm lint         # eslint clean
pnpm typecheck    # tsc clean (12/12 packages)
pnpm test         # cuando haya tests
```

---

## 4. Decisiones arquitectónicas críticas (NO violar sin discutir)

### 4.1 Stockables polimórficos (FASE 4 refactor)

`InventoryMovement`, `InvoiceItem` y `SupplierProduct` apuntan a **INGREDIENT o PRODUCT** vía:
- `entity_type` enum `StockableType { INGREDIENT, PRODUCT }`
- `ingredient_id` xor `product_id` (CHECK constraint: exactamente uno NOT NULL coherente con entity_type)

Razón: insumos y productos `directResale=true` (ej. botellas de gaseosa, snacks) consumen el mismo lifecycle de stock. Forzar todo como `Ingredient` rompía coherencia ("Coca Cola 600ml" no es un ingrediente).

**API y UI lo exponen unificado** vía `StockableSchema` (mismo shape, distinguidos por `type`) en `packages/types/src/inventory.ts`.

### 4.2 Costo vs precio de venta (FASE 4 fix)

- `Product.basePrice` = precio de **VENTA** al cliente. Lo define el dueño.
- `Product.lastUnitCost` (+ `lastUnitCostDate`) = costo histórico **auto-actualizado** al confirmar facturas. Está en `unit_purchase` (ej. $/caja).
- `SupplierProduct.lastUnitPrice` = último precio que ese proveedor cobró por ese item.
- En `InvoiceItemRow` (admin), el `unitPrice` de la factura **NUNCA prefilea** `basePrice`. Banner amber explícito + cálculo de margen en vivo cuando el dueño escribe `basePrice`.

### 4.3 Recetas — árbol polimórfico

`recipe_edges` con XOR `parent_product_id` xor `parent_subproduct_id` y XOR `child_ingredient_id` xor `child_subproduct_id`. Permite:
- Producto → ingredientes y/o subproductos
- Subproducto → ingredientes y/o subproductos (anidación)

**`expandRecipe`** en `@pos-tercos/domain`:
- Pura, sin IO.
- Detección de ciclos (`RecipeCycleError`) + `MAX_DEPTH = 32`.
- Aplica `quantityNeta / (1 - mermaPct) / yield` recursivamente.
- Retorna `Map<ingredientId, totalQuantityInUnitRecipe>`.

### 4.4 Insert-only enforcement (FASE 3)

`inventory_movements` y `audit_log` tienen trigger Postgres `reject_update_delete()` que bloquea UPDATE/DELETE con error `Table % is insert-only`. Además `inventory_movements` tiene CHECK `delta != 0`.

Todo cambio retroactivo se hace por **movement compensatorio**, nunca editando.

### 4.5 LLM strategy (FASE 4)

```
@pos-tercos/domain/llm/llm-provider.ts    # interface LLMProvider + ExtractedInvoice tipo
apps/api/src/adapters/llm/
├── anthropic.adapter.ts                  # claude-haiku-4-5 vision
├── openai.adapter.ts                     # gpt-4o-mini vision
├── llm.service.ts                        # strategy primary+fallback (LLM_PROVIDER env)
└── llm.module.ts                         # @Global()
```

- `ExtractedInvoiceSchema` requiere `items: []` y `warnings: []` siempre (los adapters rellenan defaults antes del Zod parse).
- Adapter strip de code-fences (` ```json `) antes de parsear.
- `LLM_PROVIDER=anthropic|openai` controla preferencia. Si falla, intenta el otro.

### 4.6 MIME magic-byte detection (FASE 4 fix)

`apps/api/src/common/image-mime.ts → detectImageMime(buffer)` lee primeros 12 bytes para detectar PNG/JPEG/GIF/WebP. **NUNCA** se confía en `file.mimetype` del header — usuarios suben `.jpg` que en realidad son PNG y Anthropic rechaza el `media_type` incorrecto.

### 4.7 Fuzzy matching (FASE 4)

`@pos-tercos/domain/matching/similarity.ts`:
- `similarity(a, b)` — Jaccard de tokens + boost 0.85 por substring.
- `bestMatch(query, candidates, getName, threshold=0.4)` — devuelve `{candidate, score}` o null.

Usado en `InvoiceConfirmModal` para sugerir el `Stockable` correcto a cada `InvoiceItem` extraído por la IA.

### 4.8 Storage adapter

`StorageProvider` interface en `@pos-tercos/domain`:
- `LocalFilesystemStorageAdapter` en dev → `./tmp/uploads/invoices/{uuid}.{ext}`
- En prod se reemplaza por `R2StorageAdapter` (FASE 15.B).

Inyectado vía token `STORAGE_PROVIDER` en `StorageModule.@Global()`.

### 4.9 Build pipeline

- Cambios en `packages/types` o `packages/domain` requieren `pnpm -F <pkg> build` (o el `^build` lo gatilla turbo).
- `apps/api` levanta en puerto `3001`. `apps/admin` en `3004`. Ambos vía `pnpm dev`.
- En `next.config.ts` rewrites: `/api/* → http://localhost:3001/*` para que el admin cliente pegue cookies httpOnly.

### 4.10 WhatsApp automático vía OpenWA (decisión 2026-05-22, reorientación v2)

> **ACTUALIZACIÓN 2026-07-05 — KAPSO (Cloud API oficial de Meta) reemplaza a OpenWA; código COMPLETO (Fases A+B).** El envío va por Kapso (Meta Business Partner, su API espeja la Cloud API) para eliminar el riesgo de baneo de OpenWA. Mismo puerto `WhatsAppProvider` (+ `sendTemplate?` opcional): factory por prioridad `KAPSO_*` → `OPENWA_*` → mock, con **fail-fast al boot si la config queda parcial**. Templates business-initiated en `packages/domain/src/whatsapp/templates.ts` (5: los 4 stages del cliente + `alerta_negocio` del dueño; `sanitizeTemplateParam` aplana saltos de línea que Meta rechaza en variables) — se activan con `WHATSAPP_TEMPLATES_ENABLED=true` + `WHATSAPP_TEMPLATE_LANG` (apagado = texto libre → sandbox/dev/OpenWA intactos). **Para el go-live solo falta lo operativo** (chip +57 dedicado, registrar número y 5 templates, env vars) — derrotero en `kapso-setup.md`. Lo de abajo (stages, idempotencia por flags `notified_*`, tabla `whatsapp_messages`) sigue vigente sin cambios.
>
> **ATENCIÓN — Esta sección reemplaza completamente la decisión anterior de wa.me (2026-05-04).** El flujo wa.me manual (FASE 9 en `main`) fue descartado y reemplazado por envío automático desde el backend.

**Arquitectura actual (commit `e739ef2`):**

```
@pos-tercos/domain/whatsapp/
├── whatsapp-provider.ts      # interface WhatsAppProvider { sendText(phone, text) }
├── notification-messages.ts  # buildNotificationMessage(stage, snapshot, opts)
└── index.ts

apps/api/src/adapters/whatsapp/
├── openwa.adapter.ts          # OpenWaWhatsAppAdapter — HTTP a OpenWA self-hosted
├── mock.adapter.ts            # MockWhatsAppAdapter — loggea, no envía (dev sin OPENWA_*)
└── whatsapp.module.ts         # @Global(), factory lazy: OPENWA_* presentes → real, si no → mock

apps/api/src/notifications/
├── notification.service.ts    # NotificationService — idempotente, fire-and-forget
└── notification.module.ts     # importa WhatsAppModule, PrismaModule
```

**Flujo automático (3 notificaciones, solo WEB_PICKUP):**

| Stage | `notified_*` flag en Sale | Trigger | Mensaje |
|---|---|---|---|
| `payment_instructions` | `notified_payment_instructions` | `WebOrdersService.create` (al crear el pedido web) | Instrucciones de pago Nequi/transfer + "enviá comprobante" |
| `payment_received` | `notified_payment_received` | `SalesService.confirmPayment` | "Pago verificado, ya en preparación" |
| `pickup_ready` | `notified_ready_for_pickup` | `SalesService.markWebReady` (`POST /sales/:id/mark-ready`, cajero "Marcar listo") | "Listo para retirar" + dirección |
| `canceled` | `notified_canceled` | `SalesService.cancelWebOrder` (cajero rechaza) | "Tu pedido fue cancelado" |

**Reglas duras:**
- ✅ **Idempotente por flags**: si el flag `notified_*` ya está en `true` para ese stage, `NotificationService.notify` no envía de nuevo (previene doble-envío en reintentos).
- ✅ **Fire-and-forget**: un fallo de WhatsApp NUNCA revierte la transición de negocio. El caller usa `void this.notifications.notify(...)`.
- ✅ **Solo WEB_PICKUP**: COUNTER no tiene notificaciones. El servicio revisa `sale.type !== 'WEB_PICKUP'` y retorna sin enviar.
- ✅ **Persiste en `whatsapp_messages`**: cada envío (exitoso o fallido) queda registrado en la tabla con `status: 'sent' | 'failed'`.
- ✅ **MockAdapter en dev**: sin las 3 vars `OPENWA_URL`, `OPENWA_API_KEY`, `OPENWA_SESSION_ID`, el módulo instancia `MockWhatsAppAdapter` que loggea el mensaje sin enviarlo. Dev funciona sin OpenWA.
- ❌ **`POST /sales/:id/whatsapp-clicked` ELIMINADO** — era del flujo wa.me manual y ya no existe.
- ❌ **`POST /sales/:id/accept` ELIMINADO** (2026-05-22) — el paso de "aceptar para enviar instrucciones" se eliminó. Las instrucciones de pago ahora salen automáticamente al **crear** el pedido (`WebOrdersService.create`). El cajero solo tiene una acción: **confirmar el pago** cuando valida el comprobante (`POST /sales/:id/confirm-payment`).
- ❌ **wa.me deep links en el frontend ELIMINADOS** — POS y web ya no abren pestañas de WhatsApp.
- ❌ **No existe `WEB_DELIVERY`** — el campo de dirección y los mensajes de delivery fueron eliminados junto con el módulo Mapbox.

**Variables de entorno (OpenWA):**
- `OPENWA_URL` — URL del gateway OpenWA self-hosted (ej. `http://localhost:3000`)
- `OPENWA_API_KEY` — API key del gateway
- `OPENWA_SESSION_ID` — ID de sesión (ej. `tercos`)
- `BUSINESS_NAME` — Nombre del negocio en los mensajes (server-side, no `NEXT_PUBLIC_`)
- `BUSINESS_ADDRESS_SHORT` — Dirección corta en mensaje de "listo para retirar"
- `PAYMENT_INSTRUCTIONS_NEQUI` / `PAYMENT_INSTRUCTIONS_TRANSFER` — Textos que van en el mensaje de instrucciones de pago

**Setup OpenWA:** ver `openwa-setup.md` en raíz. **Cómo probar flujo completo:** ver `probar-backend-sin-apps.md`.

---

## 5. Schema DB (44 modelos + 19 enums + 1 sequence)

> **Conteo real a 2026-06-26 (auditoría): 44 models / 19 enums.** La lista numerada de abajo quedó en la v2 (30/12) y NO refleja las tablas agregadas después: `stock_counts`, `sale_payments`, `payment_method_settings`, `display_slides`, `display_tracks`, `fixed_costs` + `fixed_cost_payments`, el módulo de nómina (`payroll_days` / `payroll_adjustments` / `payroll_payments`, que reemplazaron `worker_attendance` / `worker_commissions`), y la capa financiera reciente (tesorería, cortesías, payables, web-hero). Columnas nuevas no listadas: `products.preparation_steps` + `subproducts.preparation_steps` (biblia), `sales`/`shifts` varios (tips, arqueo digital). Enums: `PaymentMethod` ganó `CARD`; `PayType` reemplazó `WorkerCommissionType`. ✅ El rol `ADMIN_FINANCIERO` que se citaba como deuda YA NO se referencia en código (0 ocurrencias); el enum `UserRole` es coherente.
>
> Actualizado en reorientación v2 (2026-05-22). Eliminados: `RepartidorAvailability`, `WEB_DELIVERY` de `SaleType`, 5 estados de delivery de `SaleStatus`. Agregada: tabla `whatsapp_messages`.
>
> **Cajero v2.1 (2026-05-23) — ver §7.v3.** Nuevas: tabla `cash_movements`, enum `CashMovementType`. Columnas nuevas: `products.sold_out`, `sales.void_reason`, `shifts.cash_count_breakdown`. Migraciones `20260522190000_product_sold_out`, `20260523120000_sale_void_reason`, `20260523150000_cash_movements_and_arqueo`.

### Enums Prisma
- `UserRole` — CAJERO, COCINERO, ADMIN_OPERATIVO, DUENO, TRABAJADOR (sin REPARTIDOR)
- `InventoryMovementType` — PURCHASE, SALE, MANUAL_ADJUSTMENT, WASTE, INITIAL
- `StockableType` — INGREDIENT, PRODUCT
- `InvoiceStatus` — PENDING_REVIEW, CONFIRMED, REJECTED
- `SaleType` — COUNTER, WEB_PICKUP (sin WEB_DELIVERY)
- `SaleStatus` — PENDIENTE_PAGO, PAGADO, EN_PREPARACION, LISTO_DESPACHO, ENTREGADO, CANCELADO_NO_PAGO, CANCELADO_SIN_REEMBOLSO, VOID (sin ASIGNADO, EN_RUTA, INTENTO_FALLIDO, DEVUELTO, EN_DISPUTA)
- `PaymentMethod` — CASH, NEQUI, DAVIPLATA, QR_BANCOLOMBIA, TRANSFER
- `CashMovementType` — IN, OUT (movimientos de efectivo del turno, v2.1)
- `ShiftStatus` — OPEN, CLOSED, RECONCILED
- `PromotionType` — PERCENT_OFF, BOGO, FIXED_OFF, COMBO_OFF (4 tipos implementados)
- `PurchaseSuggestionStatus` — PENDING, EVALUATED, ACCEPTED, REJECTED, STALE
- `WorkerCommissionType` — PERCENT_OF_SHIFT, FIXED_PER_SALE

### Sequences
- `receipt_seq` — monotónica. **Nota:** el schema actual usa `@default(autoincrement())` en `sales.receipt_number` (Prisma drift con `nextval`). Saltos detectables vía cron.

### Tablas
1. `users` — sin campo `repartidor_*`. Solo `role` enum sin REPARTIDOR.
2. `refresh_tokens`
3. `products` — con `direct_resale`, `unit_purchase`, `unit_stock`, `conversion_factor`, `threshold_min`, `last_unit_cost`, `last_unit_cost_date`, `is_combo`, `combo_price`
4. `product_sizes`
5. `product_modifiers`
6. `combo_components`
7. `subproducts` — `yield`, `unit`
8. `ingredients` — `unit_purchase`, `unit_recipe`, `conversion_factor`, `threshold_min`
9. `recipe_edges` — polimórfico parent/child
10. `inventory_movements` — polimórfico (entity_type + ingredient_id xor product_id), insert-only
11. `audit_log` — insert-only
12. `suppliers`
13. `supplier_products` — polimórfico, last_unit_price + currency + last_seen
14. `invoices` — supplier_name, invoice_number, total, iva, status, image_url, ai_model_used, raw_extraction (JSON), uploaded_by, confirmed_by
15. `invoice_items` — polimórfico, description_raw + matched entity
16. `sales` — receipt_number (autoincrement), type (COUNTER|WEB_PICKUP), status, `turn_number` (**nullable** — se asigna al pagar; secuencia diaria única compartida, ver turnos v2), `ready_at` (cocina marca LISTO_DESPACHO; ordena la cola del cajero), `called_at` (cajero llama el turno a pantalla), customer_name, customer_phone, customer_nit, totals, payment, cashier, shift, idempotency_key UNIQUE. Flags idempotencia WhatsApp: `notified_payment_instructions`, `notified_payment_received`, `notified_ready_for_pickup`, `notified_canceled`. Sin campos de delivery.
17. `sale_items` — product_id (no polimórfico), size_id NULL, modifiers_json snapshot, applied_promotion_id, line_subtotal/discount/total con CHECK
18. `sale_status_log` — insert-only via trigger; trazabilidad de cambios de status
19. `shifts` — apertura + cierre completos
20. `promotions` — `type` enum + `discount_pct` (NULL para FIXED/BOGO) + `discount_fixed` + `bogo_buy_qty` + `bogo_get_qty` + 4 CHECK constraints per-type defensivos
21. `promotion_products` — N:M, PRIMARY KEY composite
22. `idempotency_keys` — cache de respuestas para POSTs idempotentes, TTL 7d
23. `approval_pins` — PIN hash por usuario; trigger valida que role IN (ADMIN_OPERATIVO, DUENO)
24. `purchase_suggestions` — polimórfico (entity_type + ingredient_id xor product_id), snapshot stock/threshold/qty/cost, `llm_rationale` + `llm_model` + `llm_evaluated_at`, status + resolved_by/at/note
25. `worker_attendance` — userId + checkIn + checkOut nullable + hoursWorked Decimal calculado, CHECK checkOut > checkIn
26. `worker_commissions` — userId + type enum + percent / fixedAmount + appliedAt, histórico inmutable. CHECK per-type
27. `payment_reconciliations` — snapshot del módulo FASE 11.E con counts + reportJson completo + importedById
28. `whatsapp_messages` — auditoría de envíos OpenWA: saleId, stage, toPhone, body, status (`sent`|`failed`), providerMessageId, error, createdAt
29. `_prisma_migrations`

---

## 6. API surface vigente

### Auth (FASE 1)
- `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`

### Catálogo (FASE 2)
- `GET/POST/PATCH/DELETE /ingredients`
- `GET/POST/PATCH/DELETE /subproducts`
- `GET/POST/PATCH/DELETE /products`
- `GET/PUT /products/:id/recipe`
- `GET/PUT /subproducts/:id/recipe`
- `GET /products/:id/expanded-cost`

### Inventario + audit (FASE 3)
- `GET /inventory/stock` — devuelve `Stockable[]` (insumos + productos direct-resale)
- `GET /inventory/stock/:type/:id`
- `GET /inventory/movements` — filtros `entity_type`, `ingredient_id`, `product_id`, `type`
- `POST /inventory/movements` — admin/dueño, polimórfico
- `GET /audit` — solo Dueño

### Suppliers + invoices (FASE 4)
- `GET/POST/PATCH/DELETE /suppliers`
- `POST /invoices/upload-photo` (Multer, mime check, 10MB) → llama LLM → guarda draft `PENDING_REVIEW`
- `POST /invoices/from-clone` — admin: clona invoice CONFIRMED como draft PENDING_REVIEW (mismos supplier + items, sin total/iva). Audit log con `stage=cloned + sourceInvoiceId`.
- `GET /invoices/:id/raw-extraction` — devuelve `ExtractedInvoice` cruda (o sintética para clones) usada por `/invoices/[id]/edit`.
- `POST /invoices/:id/confirm` — atómico: replace items + crear `inventory_movements PURCHASE` polimórficos + upsert `supplier_products` + actualizar `Product.lastUnitCost`
- `POST /invoices/:id/reject`
- `GET /invoices`, `GET /invoices/:id`

### Pendiente FASE 4
_(ninguno — FASE 4 cerrada)_

### KDS + Pantalla Pública (FASE 6)
- `GET /kds/orders [cocinero]` — cola PAGADO + EN_PREPARACION ordenado por paidAt asc
- `POST /kds/orders/:id/start [cocinero]` — PAGADO → EN_PREPARACION
- `POST /kds/orders/:id/ready [cocinero]` — EN_PREPARACION → LISTO_DESPACHO
- `WS /ws/kds` (socket.io, namespace `/ws/kds`, room `kitchen.queue`) — auth handshake (auth.token | Authorization: Bearer | cookie pos_access). Eventos: `order.created`, `order.status.changed` con payload `KdsEvent { event, sale, emittedAt }`
- `GET /public-display/state` — `@Public()`, snapshot `{ currentTurn, callSeq, asOf }` del turnero (turnos v2, ver más abajo). `currentTurn` nullable; `callSeq` monotónico para re-flash.
- `GET /public-display/stream` — `@Public()`, SSE con NestJS `@Sse()`. Reconnect automático nativo del browser (`EventSource`)
- `GET /public-display/ready-to-call [cajero]` — cola "listos por llamar" (LISTO_DESPACHO del día, COUNTER+WEB_PICKUP, FIFO por `ready_at`).
- `POST /public-display/call/:saleId [cajero]` — llama/re-llama ese turno a la pantalla (set `called_at` + `currentTurn`).
- `POST /public-display/call-manual [cajero]` — body `{turn}` — llamado de número arbitrario (corrección de desfase).
- `POST /public-display/deliver/:saleId [cajero]` — marca ENTREGADO → sale de la cola.
- `POST /public-display/turn/reset [cajero]` — limpia la pantalla.

> **Turnos v2 (2026-05-22) — supersede §FASE 6.B.** El turnero ya NO usa `current/next` ni un contador manual `+1`. Modelo actual: el `turn_number` se asigna **al pagar** (`confirmPayment`), como **secuencia diaria única compartida** COUNTER+WEB_PICKUP (nullable hasta el pago; los web abandonados no gastan número). El recibo imprime "TU TURNO: N". La pantalla pública muestra **un solo número** con avance **manual** del cajero, alimentado por la **cola de listos** (la cocina marca LISTO_DESPACHO → `ready_at` + `notify`). El cajero llama desde el POS (`features/turn` → `TurnAction`). Flash+campana se disparan por `callSeq` (re-llamar el mismo número también avisa). Migración `20260522170000_turn_numbering_and_call_queue` (turn_number nullable + `ready_at` + `called_at`). **Nota deploy:** el reset diario usa hora local del server → setear `TZ=America/Bogota` en Railway.

### Web pública pedidos (FASE 7 — solo WEB_PICKUP)
- `GET /web/menu` — `@Public()`, Throttle 60/60s. `PublicMenuResponse {products, categories, asOf}`. Subset SAFE del producto (sin `lastUnitCost`/`thresholdMin`/`directResale`)
- `POST /web/orders` — `@Public()`, Throttle 30/60s. `CreateWebOrder {type WEB_PICKUP, items, customerName, customerPhone (E.164 +57XXXXXXXXXX), notes?}`. Header `Idempotency-Key` opcional. Retorna `{order, token, tokenExpiresAt, paymentInstructions}`. Reusa `SalesService.create`. **Dispara `notifications.notify(id, 'payment_instructions')` automáticamente** (el cliente recibe las instrucciones de pago apenas crea el pedido). No acepta `WEB_DELIVERY` ni `deliveryAddress` (eliminados en v2).
- `GET /web/orders/:id?token=` — `@Public()`, Throttle 120/60s. `PublicWebOrder` (subset sin paymentMethod/cashier/shift/idempotencyKey). Token HMAC SHA256, TTL 24h.
- `WS /ws/pos` (socket.io, namespace `/ws/pos`, room `pos.web-orders`) — auth tri-modal idéntica a `/ws/kds`. Role gate `CashierAccess`. Eventos: `web-order.created`, `web-order.cancelled`.
- Confirmación de pago: `POST /sales/:id/confirm-payment` — acción del cajero cuando valida el comprobante. `SalesService.confirmPayment` es **TOCTOU-safe** (update condicionado por status dentro de la tx → no doble-cobro), re-valida monto exacto + doble verificación para pagos digitales, **asocia el turno+cajero** a las ventas WEB_PICKUP (entran al cierre de caja), notifica `payment_received` y manda a cocina.
- `POST /sales/:id/cancel` — `CashierAccess()`. El cajero rechaza un pedido web `PENDIENTE_PAGO` que nunca se pagó → `CANCELADO_NO_PAGO` + `notifications.notify(id, 'canceled')`. No revierte stock (nunca se descontó).
- **Eliminado:** `POST /sales/:id/accept` — el paso de "aceptar para enviar instrucciones" se quitó (las instrucciones salen al crear el pedido).
- **Eliminado:** `POST /web/orders/:id/mark-paid` — deprecated, no se llama desde ninguna UI.

### RRHH (FASE 14.B)
- `GET /workers/users` — Admin/Dueño. Lista candidatos a registrar.
- `GET /workers/attendance[?user_id=&from=&to=&only_open=true&limit=]` — Admin/Dueño.
- `POST /workers/:userId/check-in` body `{at?, notes?}` — Admin/Dueño. Rechaza si ya hay turno abierto.
- `POST /workers/attendance/:id/check-out` body `{at?, notes?}` — Admin/Dueño. Calcula `hoursWorked`.
- `GET /workers/commissions[?user_id=]` — Admin/Dueño.
- `POST /workers/:userId/commission` body `CreateCommission` — Admin/Dueño. Histórico inmutable: cada cambio crea fila nueva.
- `GET /workers/payroll-period?from=&to=` — Admin/Dueño. Agrupa por user con totalHours + activeCommission + estimatedCommission.

### Persistencia reconciliación (FASE 14.D)
- `POST /reports/payment-reconciliation/import?source=&save=true` — Dueño-only. `save=true` persiste el reporte.
- `GET /reports/payment-reconciliation/history[?source=&limit=]` — Dueño-only.
- `GET /reports/payment-reconciliation/history/:id` — Dueño-only. Detalle con rows.

### Reportes y Dashboard (FASE 13)
- `GET /reports/dashboard` — Admin/Dueño. Resumen del día (revenue + WoW% + counts en vivo).
- `GET /reports/sales-summary?from=&to=&granularity=daily|hourly` — Admin/Dueño. Serie temporal + breakdowns por type/method.
- `GET /reports/top-products?from=&to=&limit=` — Admin/Dueño. Ranking con costo/margen estimados.
- `GET /reports/hour-heatmap?from=&to=` — Admin/Dueño. Matriz dow×hour (default 30d).
- `GET /reports/whatsapp-metrics?from=&to=` — Admin/Dueño. Cobertura por stage desde audit `WHATSAPP_LINK_OPENED`.
- `GET /reports/suggestions-metrics?from=&to=` — Admin/Dueño. Counts por status + acceptedEstTotal.
- Default range: 7 días. Heatmap 30. parseDateRange acepta YYYY-MM-DD.

### WhatsApp automático (v2 — reemplaza FASE 9 wa.me)
- **NO existe** `POST /sales/:id/whatsapp-clicked` — eliminado en v2.
- Las 3 notificaciones se disparan automáticamente desde el backend (ver sec 4.10). Métricas de cobertura quedan en tabla `whatsapp_messages` (`status='sent'`), no en `audit_log`.
- `GET /reports/whatsapp-metrics` ✅ ya lee de `whatsapp_messages` (la "deuda menor" de leer del audit `WHATSAPP_LINK_OPENED` está cerrada — ver `sales-reports.service.ts`).

### Promociones (FASE 5.C + 12.B + canal 2026-07-09)
- **Canal por promo** (`promotions.channel`, enum `PromotionChannel BOTH|POS|WEB`, default BOTH — migración `20260709120000_promotion_channel`): el dueño define dónde aplica cada promo (caja, web o ambos) desde el form del admin ("Dónde aplica", editable como campo meta). `loadActiveAt(at, channel)` filtra server-side (COUNTER→POS, WEB_PICKUP→WEB; también en `editItems`). El POS lista con `?channel=POS`. `GET /web/menu` expone `promotions[]` (subset SAFE `PublicMenuPromotion`, solo WEB/BOTH) y la web muestra badge + precio tachado en el menú y descuento en carrito/checkout client-side con el mismo motor de domain (`getPromoBadge`/`applyPromotion`; feature `apps/web/src/features/promotions/` hidratada por `PromotionsHydrator`). El total autoritativo sigue siendo del backend al crear el pedido. E2E `promotion-channels` (6 casos).
- `GET /promotions[?only_active=true&channel=POS|WEB]` — Cajero+ leen para tachados POS; Admin/Dueño escriben.
- `GET /promotions/:id` — Cajero+
- `POST /promotions` — Admin/Dueño. Body `CreatePromotion` validado por `superRefine` per-type (PERCENT_OFF, FIXED_OFF, BOGO, COMBO_OFF). CHECK constraints DB defensivos (`chk_promo_pct/fixed/bogo/combo`).
- `PATCH /promotions/:id` — Admin/Dueño. Solo permite cambiar campos meta (name, days, time, dates, isActive, productIds, channel). Campos per-tipo son inmutables.
- `DELETE /promotions/:id` — Admin/Dueño. Soft delete (isActive=false).

### Sugerencias de compra (FASE 12.C-12.D)
- `GET /purchase-suggestions[?status=&limit=]` — Admin/Dueño. `status` acepta CSV (`PENDING,EVALUATED`).
- `GET /purchase-suggestions/:id` — Admin/Dueño.
- `POST /purchase-suggestions/:id/accept` — Admin/Dueño. Body `{note?: string}`. Solo desde PENDING/EVALUATED.
- `POST /purchase-suggestions/:id/reject` — Admin/Dueño. Body `{note?: string}`.
- `POST /purchase-suggestions/:id/evaluate` — Dueño-only. LLM (Anthropic Haiku 4.5 primary, OpenAI fallback) escribe `llmRationale` + `llmModel`. Cuesta ~$0.0001/eval.
- `POST /purchase-suggestions/admin/scan` — Dueño-only. Trigger manual del scan horario.
- `POST /purchase-suggestions/admin/evaluate-all-pending` — Dueño-only. Batch sobre PENDING.
- `GET /purchase-suggestions/:id/suppliers` — Admin/Dueño. Proveedores que ya vendieron ese item (el más reciente marcado `isLast`).
- `POST /purchase-suggestions/:id/supplier-order/preview` — Admin/Dueño. Body `SendToSupplier {supplierId, quantity?, note?}` → `SupplierOrderLink {url, messagePlain, phone, …}`. **Read-only**: arma el texto del pedido y el link `wa.me`, no cambia nada.
- `POST /purchase-suggestions/:id/supplier-order` — Admin/Dueño. Mismo body; marca la sugerencia ACCEPTED + audit `PURCHASE_SUGGESTION_SENT_SUPPLIER` (`metadata.channel='wa_link'` + el mensaje). **Reemplaza a `POST /:id/send-to-supplier`** (eliminado, ver §7.v19).
- Cron `EVERY_HOUR`: detecta low-stock + crea PENDING + marca STALE las que se repusieron.

### Cierre de caja + Anti-fraude (FASE 11)
- `POST /shifts/:id/close [cajero]` — body `{countedCash, notes?}`. Calcula `expectedCash = openingCash + sum(sales CASH PAGADOS+)` y `difference = counted - expected`. Audit `SHIFT_CLOSED` siempre; `SHIFT_DISCREPANCY_DETECTED` adicional si `|diff| >= $5.000`. Solo el cajero dueño del turno puede cerrarlo.
- `POST /approvals/pin [admin/dueño]` (FASE 11.C: cambió de OnlyDueno a AdminAccess) — cada user con rol cambia su propio PIN. Body `{pin: 6 dígitos}`.
- `GET /reports/anomalies [dueño]` — `CashierAnomalies[]` con baseline (avg+σ) y flags por shift más reciente cuando métrica > avg + 2σ. Métricas trackeadas: `|difference|`, `voidCount`, `noSaleCount`. Necesita ≥5 shifts de baseline; menos → `baseline=null`.
- `POST /reports/payment-reconciliation/import?source=NEQUI_CSV|BANCOLOMBIA_CSV [dueño]` multipart `file` — parser CSV minimalista (cols `fecha,monto,referencia`) + greedy match contra sales digitales por monto + fecha ±24h. Devuelve `ReconciliationReport {summary, rows}` con flags `matched|unmatched_csv|unmatched_sale`. Stateless por ahora (persistencia diferida a FASE 14).

---

## 7. Admin UI vigente

### Rutas

```
/login                                   # FASE 1
/unauthorized
/                                        # dashboard + 4 stat cards
/ingredients                             # lista + new + [id]
/subproducts                             # lista + new + [id]
/products                                # lista + new + [id]
/products/[id]/recipe                    # editor de receta + expanded-cost
/subproducts/[id]/recipe
/inventory                               # tabla unificada Stockable[]
/inventory/[type]/[id]/adjust            # MANUAL_ADJUSTMENT / WASTE / INITIAL
/inventory/movements                     # tabla con filtros
/invoices                                # lista
/invoices/new                            # uploader + IA extract + InvoiceConfirmModal
/invoices/[id]                           # detalle (botón "Continuar" si PENDING / "Clonar" si CONFIRMED)
/invoices/[id]/edit                      # reabre modal sobre draft existente (resume + clone targets)
/suppliers                               # lista + new + [id]
/promotions                              # lista + new + [id] (FASE 12.B)
/purchase-suggestions                    # lista + tabs filtro + scan + evaluar (FASE 12.E)
/purchase-suggestions/[id]               # detalle con rationale IA + accept/reject
/reports/sales                           # serie + breakdowns (FASE 13.C)
/reports/products                        # top productos con margen (FASE 13.D)
/reports/operations                      # WhatsApp + IA + heatmap (FASE 13.E)
/reports/anomalies                       # 2σ histórico personal (FASE 11.D)
/reports/reconciliation                  # CSV match + histórico (FASE 11.E + 14.D)
/reports/reconciliation/history/[id]     # detalle de report guardado (FASE 14.D)
/workers/attendance                      # asistencia trabajadores (FASE 14.C)
/workers/commissions                     # config comisiones (FASE 14.C)
/workers/payroll                         # payroll del período (FASE 14.C)
/audit                                   # solo Dueño
```

### Componentes shell (canónico)

```
apps/admin/src/
├── app/
│   ├── (authenticated)/layout.tsx       # AdminShell wrapper
│   ├── login/page.tsx
│   └── unauthorized/page.tsx
├── components/{AdminShell,AdminSidebar,AdminTopbar}.tsx
├── features/auth/                       # FASE 1
├── features/ingredients/
├── features/subproducts/
├── features/products/
├── features/recipes/
├── features/inventory/
├── features/audit/
├── features/suppliers/                  # CRUD UI completo
├── features/invoices/
│   └── components/
│       ├── InvoiceUploader.tsx          # dropzone + fetch stockables
│       ├── InvoiceConfirmModal.tsx      # editor pre-confirm; selección pre-resuelta cuando invoice.items existe, fuzzy match si no
│       ├── InvoiceItemRow.tsx           # row polimórfica con "+ Crear nuevo"
│       ├── EditDraftScreen.tsx          # client wrapper para /invoices/[id]/edit
│       └── CloneInvoiceButton.tsx       # POST /invoices/from-clone → redirect a /edit
├── lib/api-server.ts                    # serverFetchJson + ApiError
├── lib/auth-config.ts                   # ADMIN_ALLOWED_ROLES
└── middleware.ts                        # jose JWT verify (Edge runtime)
```

### Design system aplicado

- **Tema oscuro permanente** ("grafito azulado", tokens v6 en `packages/ui/src/styles/tokens.css`; `color-scheme: dark`). Sidebar fijo 240px en desktop; en <1024px se abre como `Drawer` izquierdo desde la hamburguesa del topbar (`AdminShell`/`AdminTopbar`).
- Primary: **rojo** `#E5293E` (= destructive) / Warning/Stock crítico: amber `#FBBF24` / Success: verde `#4ADE80` / Neutros: escala `ink-*` grafito azulado. (El `/styleguide` aún tiene labels de hex de la paleta clara vieja — deuda menor; la fuente de verdad es `tokens.css`.)
- Tablas: borders sutiles (`border-border`), hover row, no zebra, `tabular-nums` en columnas numéricas.
- Empty states explícitos con CTA.
- Badges polimórficos: 🌾 Insumo (emerald) / 📦 Producto (blue).

---

## 7.bis POS UI vigente (FASE 5.E)

### Rutas

```
/login                                   # FASE 5.E.1
/unauthorized
/                                        # FASE 5.E.3+ — gate shift → catálogo + carrito + cobro
/shift/open                              # FASE 5.E.2 — apertura turno (gate inverso si ya hay OPEN)
```

### Estructura

```
apps/pos/src/
├── app/
│   ├── (authenticated)/
│   │   ├── layout.tsx                   # PosTopbar + main; fetch user + shift en paralelo
│   │   ├── page.tsx                     # gate shift → CatalogGrid + CartPanel split lg:[1fr_360px]
│   │   └── shift/open/page.tsx          # gate inverso + OpenShiftForm
│   ├── login/page.tsx
│   └── unauthorized/page.tsx
├── components/PosTopbar.tsx              # APP_LABEL + badge "● Turno abierto" + VoidSaleAction + role/email + LogoutButton
├── features/auth/                        # replicado de admin (POS_ALLOWED_ROLES = [CAJERO, ADMIN_OPERATIVO, DUENO])
├── features/shifts/
│   ├── api/{getCurrent,open}.ts
│   ├── server.ts                         # getCurrentShiftServer (SSR)
│   └── components/OpenShiftForm.tsx
├── features/catalog/
│   ├── api/list.ts                       # GET /products?only_active=true
│   ├── server.ts                         # SSR
│   ├── lib/format.ts                     # COP Intl
│   └── components/{CatalogGrid,ProductPickerModal}.tsx
├── features/sales/
│   ├── api/{create,confirm-payment,print,open-drawer,list,void,list-promotions}.ts
│   ├── store/cart-store.ts               # Zustand (items + lastSale + actions)
│   ├── lib/{cart-types,totals,open-receipt-window}.ts
│   └── components/{CartPanel,CheckoutModal,LastSaleBanner,VoidModal,VoidSaleAction}.tsx
├── features/web-orders/                  # FASE 7.E
│   ├── api/{list,get-sale}.ts            # GET /sales (filtros) + GET /sales/:id
│   ├── server.ts                         # getPendingWebOrdersServer (SSR initial)
│   ├── lib/project.ts                    # saleToPublicWebOrder
│   ├── hooks/useWebOrdersSocket.ts       # socket.io-client → /ws/pos con auth.token
│   └── components/{WebOrdersAction (topbar wrapper), WebOrdersDrawer, ConfirmWebPaymentModal}.tsx
├── lib/{api-server,auth-config}.ts       # serverFetchJson + POS_ALLOWED_ROLES
└── middleware.ts                         # jose JWT verify + role gate (Edge runtime)
```

### Decisiones de UX aplicadas

- Layout fullscreen split `lg:[1fr_360px]` (catálogo izquierda, carrito derecha) — no sidebar (a diferencia de admin).
- Botón `Cobrar` siempre visible en footer del carrito; deshabilitado cuando `items.length === 0`.
- Idempotency-Key (`crypto.randomUUID()`) generado al abrir `CheckoutModal` — vive una vida del modal; reintentos transparentes.
- Promos: refresh cada 60s mientras el carrito esté montado (auto-reflejan cambios desde admin sin reload).
- Recibo HTML: `window.open(blob)` + `window.print()` automático en `load`. El POS NO mantiene el HTML — lo abre y se va.
- `LastSaleBanner` no tiene autodismiss (cajero decide cuándo limpiarlo); badge `Anulada #N` en topbar SÍ tiene autodismiss 5s.

---

## 7.ter KDS — Flutter (reorientación v2, WS-3)

> **`apps/kds` (Next.js) fue eliminado.** El KDS ahora es una app Flutter nativa (`apps/kds-flutter`) para tablet Android en la cocina.

### Stack Flutter

- Flutter + Dart (sin null-safety issues, SDK 3.x)
- **Arquitectura:** Clean Architecture (core / domain / data / presentation)
- **State:** Riverpod (providers)
- **Models:** Freezed + json_serializable (código generado en `*.freezed.dart`, `*.g.dart`)
- **HTTP:** Dio (`DioHttpProvider`)
- **WS:** `socket_io_client` (conecta directo al backend `/ws/kds`)
- **Router:** GoRouter
- **Temas:** `AppTheme` centralizado (dark, accent rojo)

### Estructura

```
apps/kds-flutter/lib/
├── main.dart
└── app/
    ├── core/
    │   ├── config/app_config.dart          # vars de entorno (API URL, WS URL)
    │   ├── constants/endpoints.dart        # rutas de API
    │   ├── di/providers.dart               # providers Riverpod globales
    │   ├── network/
    │   │   ├── dio_http_provider.dart      # cliente HTTP
    │   │   ├── kds_socket.dart             # socket.io-client /ws/kds
    │   │   └── failure.dart + either.dart  # manejo de errores
    │   ├── router/app_router.dart          # GoRouter (login → board)
    │   └── theme/app_theme.dart
    ├── domain/
    │   ├── models/kds/
    │   │   ├── kitchen_order_model.dart + .freezed.dart + .g.dart
    │   │   └── kitchen_order_item_model.dart + .freezed.dart + .g.dart
    │   └── repositories/{auth,kds}_repository.dart
    ├── data/
    │   ├── sources/{auth,kds}_api_provider.dart
    │   ├── repositories_impl/{auth,kds}_repository_impl.dart
    │   └── use_cases/{login,get_kitchen_orders,start_order,ready_order}_use_case.dart
    └── presentation/
        ├── auth/login_screen.dart
        └── kds/{board_screen.dart, board_controller.dart}
```

### Pantallas

- **LoginScreen** — email + password, llama `POST /auth/login`, guarda token en memoria.
- **BoardScreen** — grid de órdenes vivas (PAGADO + EN_PREPARACION). Recarga inicial vía REST (`GET /kds/orders`) y actualizaciones en tiempo real por WebSocket `/ws/kds`. Cards con cronómetro, botón "Iniciar" y "Marcar listo".

### Decisiones de arquitectura Flutter

- Auth WS: el token JWT se pasa en `handshake.auth.token` (no en cookie — la app no es browser). Se obtiene de `loginScreen` y lo maneja `KdsSocket`.
- `BoardController` es un `Notifier` (Riverpod); el socket emite eventos que el controller procesa para actualizar la lista sin refetch completo.
- Freezed para modelos: inmutables, con `copyWith`, JSON serialization autogenerada.
- **No hay middleware de auth** (es nativo, no browser). El router solo verifica si el token está presente para decidir entre login y board.
- Al hacer "Marcar listo", el backend (`KdsService.ready`) envía `notifications.notify(saleId, 'pickup_ready')` automáticamente (no hay acción en el Flutter para WhatsApp).

---

## 7.5 Web Pública UI vigente (FASE 7.C-D)

### Rutas

```
/                                        # SIN auth, menú + carrito
/checkout                                # form 1-página pickup (solo WEB_PICKUP)
/checkout/success/[id]?token=            # tracking + instrucciones de pago
```

### Estructura

```
apps/web/src/
├── app/
│   ├── globals.css                       # light theme
│   ├── layout.tsx
│   ├── page.tsx                          # SSR getMenuServer + WebTopbar + CatalogGrid
│   ├── checkout/page.tsx                 # CheckoutForm (client)
│   └── checkout/success/[id]/page.tsx    # SSR getWebOrderServer + OrderStatusView
├── components/WebTopbar.tsx              # logo + CartButton + CartDrawer
├── features/catalog/
│   ├── server.ts                         # getMenuServer (publicFetch /web/menu, fallback EMPTY)
│   └── components/{CatalogGrid, ProductCard, ProductPickerModal}.tsx
├── features/cart/
│   ├── store/cart-store.ts               # Zustand + persist (localStorage 'pos-tercos-web-cart')
│   ├── lib/cart-types.ts
│   └── components/{CartButton, CartDrawer}.tsx
├── features/checkout/
│   ├── api/{create-order, get-order}.ts  # mark-paid.ts ELIMINADO
│   ├── server.ts                         # getWebOrderServer + buildPaymentInstructions
│   └── components/{CheckoutForm, OrderStatusView, OrderStatusPoller (hook), PaymentInstructionsView}.tsx
└── lib/{api-server, format}.ts           # publicFetch + COP Intl
```

### Decisiones de UX aplicadas

- Sin auth, sin login. El cliente es anónimo.
- Carrito en localStorage (`pos-tercos-web-cart`), survive a navigation/reload. Hydration flag para evitar SSR mismatch.
- Checkout solo WEB_PICKUP (no delivery). Toggle pickup/delivery **eliminado** en v2.
- Phone input con prefijo `+57` locked + 10 dígitos (E.164 estricto, alineado con backend).
- Idempotency-Key uuid v4 generado al submit del checkout.
- Token HMAC siempre en URL `?token=`, NO en localStorage. Cliente puede compartir/recuperar URL.
- Status poller cada 5s (NO SSE) — rate-limit holgado (120/60s) y evita conexiones colgadas en pestañas inactivas. Detiene en estados terminales (ENTREGADO, CANCELADO_*, VOID).
- `paymentInstructions` se reconstruye server-side en el web app — sobrevive a reload, devices distintos, share del URL.
- Banner status tonal: amber pending / blue cooking / emerald ready / gray done / red failed.
- **"Ya pagué" REMOVIDO** (FASE 14.A + v2). Banner blue explica que el local contactará por WhatsApp con instrucciones.

---

## 7.quater Pantalla Pública UI vigente (FASE 6.D)

### Rutas

```
/                                        # SIN auth (público), full-screen kiosko
```

### Estructura

```
apps/public-display/src/
├── app/
│   ├── globals.css                       # cursor:none, hide scrollbars
│   ├── layout.tsx                        # viewport maximumScale=1, userScalable=false
│   └── page.tsx                          # dynamic='force-dynamic' + SSR fetch initial
└── features/display/
    ├── server.ts                         # getInitialDisplayState (sin auth, fallback EMPTY_STATE = {currentTurn:null, callSeq:0})
    ├── hooks/useDisplayStream.ts         # EventSource → dedupe por callSeq + reconnect nativo
    └── components/                       # Display + Carousel (B-roll) + TurnBadgeCircular + WhiteFlashOverlay + useTurnChime
```

### Decisiones de UX aplicadas (turnos v2 + rediseño kiosko)

- **Modo kiosko**: `cursor: none`, `overflow: hidden`, viewport sin user-scalable. Chrome/Edge kiosko en tablet Android.
- **EventSource > socket.io**: SSE uno-a-muchos read-only, reconnect nativo del browser.
- **Un solo número grande** (`TurnBadgeCircular`) — el turno que el cajero llama. "—" cuando no hay turno llamado.
- **Disparo por `callSeq`** (no por el valor): flash blanco + campana + pausa del carrusel se disparan en cada llamado, incluido re-llamar el mismo número.
- B-roll (`Carousel`) ocupa el viewport; se pausa 5s al llamar un turno.
- Indicador "Reconectando…" discreto cuando la conexión SSE no está sana.

---

## 7.v2 Reorientación v2 — resumen de cambios (2026-05-22)

Esta sección documenta los cambios estructurales introducidos en la rama `refactor/v2-reorientacion` sobre la base de `main` (FASES 0-15 completas). Una sesión nueva que lea este doc NO debe trabajar con los supuestos de `main`.

### Commits v2 (sobre main)

```
e96ffd6 feat(kds-flutter): WebSocket /ws/kds en vivo (socket_io_client)
99cb6a1 feat(kds-flutter): WS-3 KDS en Flutter (Clean Architecture) + elimina KDS Next
08eca88 docs: guía para probar el backend (flujo venta web + WhatsApp) sin abrir las apps
e739ef2 feat(whatsapp)!: WS-2 envío automático vía OpenWA (reemplaza wa.me)
6ee44ae refactor(admin,pos): WS-4 calidad — abrir cajón + barrels + partir componentes gigantes
385635d feat(delivery)!: elimina delivery/repartidor — solo COUNTER + WEB_PICKUP
f1324ea chore: higiene de base — lint funcional + limpieza de código muerto
aea24b8 feat(public-display): completa rediseño turnero kiosko + limpieza
4b58ac5 feat(public-display): rediseño completo + watchdog kiosko + chime de turno + B-roll
```

### Cambios críticos

| Área | Antes (main) | Ahora (v2) |
|---|---|---|
| Delivery | WEB_DELIVERY, Mapbox, 3km, `apps/repa` | **ELIMINADO**. Solo COUNTER + WEB_PICKUP |
| WhatsApp | wa.me manual (click en frontend) | OpenWA automático desde backend (sec 4.10) |
| KDS | `apps/kds` Next.js PWA | `apps/kds-flutter` Flutter nativo (tablet Android) |
| `ARCHITECTURE.md` | Plantilla Flutter (hasta 2026-06-10) | Arquitectura real del monorepo; plantilla movida a apps/kds-flutter/ |
| `packages/brand` | No existía | Nuevo — identidad visual compartida |
| `packages/config` | Existía (vacío) | **Eliminado** |
| Lint | `ignoreDuringBuilds: true` en varios frontends | Funcional. `eslint-plugin-react-hooks` registrado |
| Enums eliminados | `RepartidorAvailability`, `WEB_DELIVERY`, `ASIGNADO`, `EN_RUTA`, `INTENTO_FALLIDO`, `DEVUELTO`, `EN_DISPUTA`, `REPARTIDOR` | Removidos del schema y tipos |
| Tabla nueva | — | `whatsapp_messages` (auditoría OpenWA) |
| Endpoint eliminado | `POST /sales/:id/whatsapp-clicked` | No existe |
| Instrucciones de pago | click del cajero (wa.me) | automáticas al crear el pedido (`WebOrdersService.create`) |

### Lo que NO cambió

- Todo el backend (excepto: se agrega `notifications` + `adapters/whatsapp`, se elimina `adapters/maps`).
- `apps/admin` — sin cambios de fondo.
- `apps/pos` — pedidos web en un **modal** (`WebOrdersModal`); la única acción del cajero es "Confirmar pago" (las instrucciones de pago las recibe el cliente solo al crear el pedido).
- `apps/web` — mínimos cambios (removido toggle delivery y `mark-paid`).
- `apps/public-display` — rediseño visual (turnero), sin cambios de backend.
- FASES 0-15 del historial `main` — siguen siendo válidas como referencia del trabajo previo.

---

## 7.v3 Cajero v2.1 — caja, anulación, turnos, bitácora, IA, KDS (2026-05-23)

Cambios sobre `refactor/v2-reorientacion`. **Superseden** los supuestos de §5/§6 sobre caja-por-cajero y turno diario. Verificado: typecheck 12/12, e2e 37/37, lint limpio, `flutter analyze` limpio.

### Caja (turno)
- **Caja ÚNICA por negocio** (no por cajero): `open()` rechaza si hay CUALQUIER caja OPEN (dueño o cajero). `getCurrent`/`getActiveTodayShift`/`getCurrentStatus` devuelven la caja abierta global. La cierra quien la abrió o un admin (`close(...,isAdmin)`). Una por día calendario; admin la reabre con `reopen`.
- **Caja del día anterior sin cerrar (stale)**: si quedó OPEN de un día previo, se bloquean ventas/movimientos (409) hasta cerrarla. POS: `StaleShiftGate` + `GET /shifts/current-status` (`{shift, stalePreviousDay}`). El cierre solo es por "Cerrar turno" (con efectivo contado), nunca por logout. Se registra `closedAt` (tracking de eficiencia; el admin ve duración).
- **Movimientos de efectivo** (tabla `cash_movements`, enum `CashMovementType IN|OUT`): entradas/salidas del cajón aparte de ventas. `expectedCash = apertura + ventas efectivo + entradas − salidas`. Endpoints `POST/GET /shifts/:id/cash-movements`. POS: sección en CajaModal.
- **Arqueo por denominación** + **conteo ciego**: `CloseShift.breakdown` (líneas {denomination, count}) → `shifts.cash_count_breakdown`. POS `DenominationCounter` calcula el contado; "conteo ciego" oculta el esperado hasta revelar.

### Numeración de turnos
- `turnNumber` **resetea por caja** (cada caja nueva empieza en #1). `confirmPayment` cuenta los turnos ya asignados en ESE shift + 1.
- **Consistente en todas las apps**: POS (historial/banner/anular), web, recibo y KDS muestran el **turno** (con recibo como referencia contable). `receiptNumber` = id de caja/contable.

### Anulación
- **Solo pedidos `PAGADO` no iniciados** (backend rechaza EN_PREPARACION/LISTO). Columna `sales.void_reason` → se muestra en historial. Revierte stock y NO afecta caja (close + Z-report ya excluyen VOID). VoidModal lista solo PAGADO.
- **Cajero NO inicia pedidos** (solo el KDS): quitado "Iniciar" del cajero (historial + WebOrdersModal); el cajero solo marca "Listo". Quitado "Cambiar PIN" del topbar.

### POS layout
- `OpsSidebar`: Turnos + Historial apilados siempre visibles (≥lg) + campana `playReadyChime` al entrar un pedido nuevo a "Por llamar". Catálogo con grilla `auto-fill`, cards de altura uniforme, "Agotado" overlay; carrito ancho fluido.

### Disponibilidad / stock en vivo
- `GET /products/availability` (`@Public`) + `POST /products/:id/sold-out`. Reventa directa se invalida en stock 0; **preparados se invalidan si falta stock de un insumo** (`expandRecipe` sobre grafo global, `RecipesService.loadFullGraph`); combos por componentes. Campo `products.sold_out` ("86" manual). UI cajero (toggle + motivo "Sin Pan") y web ("Agotado").

### Bitácora admin
- `/bitacora` (Dueño): vista legible filtrable (Caja/Anulaciones/Cajón/Aprobaciones/Sesiones/Cocina) sobre `audit_log`. `GET /audit?action=` acepta CSV. `/audit` queda como "Auditoría completa".
- Nueva acción `KDS_ORDER_DELAYED` (log al marcar listo si la prep > 10 min). Login/logout de cocina vía `AUTH_LOGIN/LOGOUT`.

### IA (Anthropic Haiku primario + OpenAI fallback, on-demand)
- `LLMProvider.complete(system, user)` genérico + prompts puros en `@pos-tercos/domain`.
- `GET /shifts/:id/close-analysis` — explica el descuadre de una caja cerrada. `GET /reports/daily-ai-summary?date=` — resumen diario para el dueño. Admin: botón en detalle de caja + tarjeta en dashboard.

### KDS (Flutter)
- Modelo `KitchenOrderModel.turnNumber`; la card muestra **TURNO N** + badge de urgencia ("SIN INICIAR"/"DEMORADO").
- Re-alerta: PAGADO >3 min "no iniciado" y **EN_PREPARACION >10 min "aún no se ha finalizado"** (campana + voz TTS), re-recuerda cada 2 min.

---

## 7.v4 Inventario de producción (subproductos como stockables) — 2026-05-28

Cambio arquitectónico mayor: los subproductos pasan de ser "agrupadores de receta" a **stockables** con su propio inventario. Vender un producto preparado descuenta de sus **subproductos directos + insumos directos** (un nivel), NO se expande recursivo hasta los insumos profundos.

### Modelo

- `StockableType` extendida con `SUBPRODUCT`. `InventoryMovementType` gana `PRODUCTION`.
- `inventory_movements.subproduct_id` (xor con ingredient_id/product_id, CHECK polimórfico actualizado).
- `subproducts.threshold_min` para alertas "Falta producir".
- Tabla `inventory_movements` registra producciones: +N al subproducto y -X por cada insumo/sub-subproducto. Todos encadenados por `source_type='production'` y un `source_id` UUID común (la "tanda").
- Migrations: `20260528000000_subproduct_inventory` (ADD VALUE en enums) + `20260528010000_subproduct_inventory_use` (columna + CHECK + threshold). Partidas por límite de Postgres con enum-en-tx.

### Reglas duras

- ✅ **Producir N unidades** consume `N/yield × receta` (insumos + sub-subproductos). Vía `ProductionService.produce()`.
- ✅ **Validación de stock atómica**: chequeo y escritura van DENTRO de la transacción bajo SERIALIZABLE isolation, con reintento automático en conflict (40001) hasta 3 veces. Bloquea producciones concurrentes que dejarían stock negativo.
- ✅ **Venta valida stock antes de descontar**: `SalesService.confirmPayment` llama `assertStockSufficient` dentro de la tx — si faltara stock por desincronización del sold-out UI, falla con 409 antes de crear movements. Defensa-en-profundidad sobre el gate del POS.
- ✅ **Sub-subproductos**: si subproducto A usa subproducto B en su receta, producir A consume B de su propio stock (no expande hacia sus insumos). Producir B es operación separada.
- ✅ **Idempotency-key** en el movement +N del subproducto. Reintentos del cliente con la misma key devuelven la tanda previa.
- ✅ **`expandRecipeOneLevel`** en `@pos-tercos/domain` — nueva función pura que devuelve `{ ingredients: Map, subproducts: Map }` solo del primer nivel. La recursiva `expandRecipe` se preserva (la usa CogsService hasta que entre FIFO de subproductos).
- ❌ Cocinero NO puede producir desde el admin (no tiene acceso). ✅ SÍ produce desde la pantalla de producción del KDS Flutter (ruta `/production`, vía `GET /subproducts/production-status` + `POST /subproducts/:id/produce`, ambos `@KitchenAccess`).
- ❌ **Stock negativo no permitido**: producir o vender lo rechaza con 409 dentro de la tx.

### Endpoints nuevos

- `POST /subproducts/:id/produce` `@KitchenAccess` — body `{ quantityProduced, notes?, idempotencyKey? }` → devuelve `ProductionRun { runId, subproductId, quantityProduced, consumed: [{ entityType, entityId, name, quantityConsumed, unit }] }`.
- `GET /inventory/stock` extendido para incluir subproductos como Stockable. `GET /inventory/stock/:type/:id` acepta `subproduct`.
- `GET /inventory/movements?subproduct_id=...` filtra por subproducto.

### UI admin

- `/subproducts` lista con columna **Stock** + badge "Bajo" (umbral) + botón inline "Producir" (icon-only, Dueño/Admin).
- `/subproducts/[id]` panel a la derecha con stock actual, umbral, botón "Producir" grande, últimos 15 movimientos.
- `SubproductForm` con campo `thresholdMin`.
- `/inventory/movements` filtro "Subproducto" + opción "Producción" en Tipo.
- `/inventory/[type]/[id]/adjust` acepta `subproduct` (rama agregada).

### COGS — FIFO completo (cerrado en sesión 2)

- `CogsService.runLedger` ahora es un **orquestador cronológico** que procesa los 3 tipos de stockable (insumos + productos directos + subproductos) en una sola pasada por tiempo, manteniendo una cola FIFO por entidad.
- **Tandas de producción son atómicas en el orquestador**: el +N del subproducto se materializa como un lote con `unitCost = (suma de costos FIFO de los insumos consumidos) / cantidad_producida`. El lote queda disponible para vender en eventos posteriores.
- **Ventas de productos preparados** descuentan FIFO del subproducto Y de insumos directos en la misma sale. Los 3 costos se atribuyen a la venta y suman al COGS del período.
- **Sub-subproductos**: si subproducto A consume subproducto B, A se produce DESPUÉS de B → A toma el costo FIFO de B (que ya tiene lote). Si B no tiene stock al momento, el costo de A queda parcialmente desconocido (`unknownQty` propaga).
- **`getInventoryValuation`** incluye lotes de subproductos en `entityType='SUBPRODUCT'`.
- **`getProductMargins`** atribuye al producto el costo de sus insumos + subproductos directos (vía `expandRecipeOneLevel`).
- **No hay "Waste Cost" inflado**: los consumos PRODUCTION ya no se categorizan como mermas, se materializan en los lotes de los subproductos.

### ⚠️ Cold start (CRÍTICO al desplegar)

El día que se despliegue este cambio, **todos los subproductos arrancan en stock 0**. Cualquier producto que dependa de subproductos en su receta aparecerá como **"Sin {subproducto}"** en la disponibilidad hasta que el cocinero/dueño registre al menos una producción.

**Plan obligatorio el día del deploy:**
1. Antes de abrir el local, entrar a `/subproducts` y producir todas las tandas que ya hay listas en cocina (movement `INITIAL` no se usa para subproductos — se hace vía `Producir`).
2. Si el cocinero produjo y no registró: marcar como producido para que aparezcan disponibles.
3. **Si no se hace este paso**, el POS va a mostrar productos preparados como "Agotado" → bloqueo de ventas.

Esto NO afecta ingredientes (siguen con su stock histórico) ni productos directResale.

### Sesiones pendientes (post-este-cambio)

- ~~**Sesión 2 (FIFO subproductos)**~~ ✅ HECHA: `packages/domain/src/cost-fifo/run-ledger.ts` (`runLedgerFifo`, 13 tests) procesa subproductos como entidad con cola FIFO propia; las tandas de producción se materializan como lote con `unitCost = sum(insumos)/qty`; sub-subproductos propagan; PRODUCTION NO se cuenta como merma. La deuda del WASTE-mapping está cerrada. *(Nota: `production.service.ts` aún persiste `unit_cost: null` en el movement +N y tiene un comentario stale "entra en sesión próxima" — el costeo se deriva en el ledger, no de esa columna; corregir el comentario.)*
- ~~**Sesión 4 (KDS Flutter producción)**~~ ✅ HECHA: la pantalla de producción existe en `apps/kds-flutter` (`presentation/production/`, ruta `/production`, botón desde el board). Lista subproductos con stock + umbral y registra tandas. Consume `GET /subproducts/production-status` (`@KitchenAccess`, incluye `yield`) — NO `/inventory/stock` (admin-only desde el hardening de seguridad 2026-06-22).
- **Sesión 5 (POS/web menu pulido)**: micro-copy de "Sin {subproducto}" si necesita ajuste.

---

## 7.v5 Auditoría de calidad + mejoras (2026-06-09/10)

Sesión de auditoría completa + hardening. Verificado: typecheck 12/12, lint 0, domain 97/97, e2e 47/47.

### Refactors (sin cambio de comportamiento)

- **SalesService partido** (1.464 → 752 líneas): `sales-consumption.service.ts` (computeConsumptionSpecs + assertStockSufficient — **lógica de consumo ÚNICA online/offline**), `sales-offline.service.ts` (syncOffline), `sales-receipt.service.ts` (ESC/POS + cajón), `sales.mappers.ts` (toSaleDto/includeFull/buildReceiptData). El controller rutea a cada servicio; los módulos externos siguen inyectando `SalesService`.
- **Redondeo canónico** en `@pos-tercos/domain/common/money.ts`: `roundMoney` (2 dec, montos cobrados) y `roundCost` (4 dec, costos/FIFO). NO crear más helpers locales de redondeo.
- **Guarda de merma**: `grossQuantity()` en expand-recipe lanza `RecipeInvalidMermaError` si `mermaPct ∉ [0,1)` (defensa contra Decimal corrupto en DB; el Zod de entrada ya validaba).
- **Componentes admin <200 líneas**: PaymentActions, FinanceCockpit, ShiftSessionDetailView, InvoicePaymentActions, FixedCostsManager — partidos en subcomponentes hermanos.

### Tests

- Domain (Vitest): 97 tests. Nuevos: expandRecipe/expandRecipeOneLevel (18), computeProductCost/Combo (12), evaluateAvailability (16), grossQuantity (6). `state-shape.test.ts` reescrito al shape de turnos v2.
- E2E API (Jest, requiere Postgres): 47 tests en 6 suites. Nueva `consumption.e2e-spec.ts`: consumo con merma/subproducto, reventa, combos, **equivalencia exacta online vs syncOffline**, 409 por stock insuficiente, reverso de void, reporte inventory-usage. Regla: TODA suite e2e debe crear sus propios usuarios (no depender del seed) y llamar `cleanDb` en afterAll (la caja única bloquea a la suite siguiente si queda OPEN).

### Features y hardening nuevos

- **Reporte "Uso y mermas"**: `GET /reports/inventory-usage?from=&to=` (AdminAccess) + página `/reports/usage` + sidebar. Por stockable: consumo por ventas (neto de voids), producción in/out, compras, mermas WASTE, ajustes netos, % merma y **$ perdido** (merma + faltantes × lastUnitCost/conversionFactor; subproductos sin valorizar — su costo es FIFO).
- **Resumen diario al dueño por WhatsApp**: `OwnerDigestService` (reports module), cron 21:30 hora local, reusa `getDailyAiSummary` + `WHATSAPP_PROVIDER`. Requiere `OWNER_WHATSAPP_PHONE`; sin la var no envía. Trigger manual `POST /reports/admin/send-daily-digest` (Dueño). Audit `OWNER_DAILY_DIGEST_SENT`.
- **Validación de env al arranque**: `assertRequiredEnv()` en main.ts — `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` siempre; `WEB_ORDER_TOKEN_SECRET` en prod. Proceso muere temprano con mensaje claro.
- **SSE pantalla pública**: backoff exponencial 3s→60s con techo. NUNCA deja de reintentar (kiosko sin operador) — solo deja de martillar.
- **Sync offline POS**: `OfflineSale.attempts`; tras 3 fallos el drain automático salta la venta (rechazo permanente probable). El "Reintentar" de la bandeja usa `{ includeExhausted: true }`.

### B.4b — IMPLEMENTADA (2026-07-06, supersede el diferimiento)

La apertura de caja offline se implementó en §7.v13 (decisión del dueño). Este párrafo queda como historial del diferimiento original (2026-05-24).

---

## 7.v6 Pagos divididos (cuenta separada) — 2026-06-10

El cobro acepta **una cuenta dividida en 2..10 partes**, cada una con su método.

### Modelo
- **Tabla `sale_payments`** (migración `20260610150000_sale_payments` + backfill): fuente ÚNICA de verdad del método de pago. El cobro simple escribe 1 fila; el dividido N. CHECKs: `amount > 0`, `amount_received >= amount`.
- `sales.payment_method` queda como **resumen denormalizado**: el método si es único, **NULL si la cuenta se dividió** (el CHECK viejo `paid_at ⇒ method` se relajó a `sin pagar ⇒ sin método`).
- **Sin estado "medio pagado"**: la división se compone en el POS y `confirmPayment` la confirma ATÓMICA (todas las partes o ninguna). Validación server-side: suma exacta al total, comprobante verificado por parte digital, efectivo recibido ≥ parte.
- Wire: `ConfirmPayment` acepta `method+amountReceived` (simple) XOR `payments: SalePaymentInput[]`. `Sale.payments[]` en el DTO.

### Integraciones financieras (todas leen de sale_payments)
- **Caja** (`expectedCash`) y **close-analysis IA**: solo la porción CASH de cada venta.
- **Z-report / session detail `byMethod`**: por pago (una dividida aporta a varios métodos; count = pagos).
- **Reportes `byMethod`**: ídem.
- **Reconciliación CSV**: la unidad de match es el PAGO — una dividida con 2 transferencias matchea cada abono del banco por su parte. (De paso se corrigió un bug latente: solo miraba `status=PAGADO`, pero al reconciliar las ventas ya están ENTREGADO.)
- **Recibo ESC/POS**: sección "PAGOS (cuenta dividida)" con método/monto/vuelto por parte; el cajón abre si ALGUNA parte fue CASH.
- **Offline**: la venta offline sigue siendo de pago único y también escribe su fila en sale_payments al sincronizar. La UI oculta "Dividir cuenta" sin red.

### POS UI (`features/sales/components/split/` + `lib/split.ts` puro)
- Toggle "Dividir cuenta" en CheckoutModal (solo online) → 3 modos: **Partes iguales** (N con redondeo exacto: el remanente va a las primeras), **Por productos** (cada UNIDAD vendida se asigna a una persona; promos prorrateadas por unidad), **Montos libres** (la última parte autocompleta el resto).
- Cada persona: método + efectivo recibido con vuelto propio, o check de comprobante por transferencia. El botón Confirmar se habilita cuando todas las partes están cobradas y la suma cuadra.

E2E: `split-payments.e2e-spec.ts` (7 casos). Verificado: typecheck 12/12, lint 0, domain 122/122, e2e 70/70.

---

## 7.v7 Cajero pro — nav FUDO, arqueos, medios de pago configurables (2026-06-11)

- **Nav superior del POS** (estilo FUDO): pestañas con ícono — Vender `/`, Turnos `/turnos`, Historial `/historial` (con Anular), Caja `/caja` (Z vivo + movimientos + cierre), **Arqueos `/arqueos`** (historial de cierres con detalle expandible: vendido, por método, movimientos, arqueo digital, descuadre). + Pedidos web (modal con badge) + **acción rápida "Movimiento"** (entrada/salida de efectivo desde el topbar). La campana de "pedido listo" es GLOBAL (`ReadyChimeWatcher` en el layout). Eliminados OpsSidebar/CajaModal/TurnAction/DayHistoryAction.
- **Arqueo digital al cierre**: además del efectivo, el cajero arquea cada método digital contra lo que dice la app (`shifts.digital_count_breakdown` = [{method, expected, counted, difference}]). Descuadre digital ≥$5.000 → audit + alerta WhatsApp al dueño. Admin lo ve en el detalle de sesión.
- **Medios de pago configurables**: tabla `payment_method_settings` (catálogo = enum `PaymentMethod`, ahora con **CARD**). Defaults: SOLO `CASH` + `TRANSFER`. Admin los habilita en `/medios-pago` (AdminAccess). `GET /payment-methods` (habilitados, cajero) / `GET all` + `PUT` (admin, audit `PAYMENT_METHODS_UPDATED`). **El cobro rechaza métodos deshabilitados** (`assertPaymentParts`). POS: selector simple, cuenta dividida y arqueo digital usan la lista dinámica; offline cae a CASH+TRANSFER. Labels canónicos en `PAYMENT_METHOD_LABELS` (types). Nunca puede quedar 0 métodos activos.
- E2E: payment-methods (4 casos) + arqueo digital en split suite. 81/81.

---

## 7.v8 Cajero pro II — correcciones de mostrador, comanda, propinas (2026-06-11)

Cambios sobre §7.v7. Verificado: typecheck 12/12, lint 0, domain 122/122, e2e 91/91.

### Movimientos de caja con método
- `cash_movements.method` (PaymentMethod, default CASH): un egreso por transferencia ajusta el **arqueo digital** de su método, NO el cajón. `expectedCash` solo suma movimientos CASH. Esperado digital al cierre = ventas del método + movimientos IN−OUT.
- El registro vive en la pestaña **Caja** (no hay botón en topbar) con selector de método. Editar/eliminar movimientos SOLO con caja OPEN (`PATCH/DELETE /shifts/:id/cash-movements/:movementId`); cerrada = inmutable. Audit `CASH_MOVEMENT_UPDATED` (before/after) / `CASH_MOVEMENT_DELETED`.

### Badge "En caja" en vivo
- Incluye movimientos (entradas−salidas) y refresca al instante vía evento global `pos:caja-changed` (`features/shifts/lib/caja-events.ts` — `notifyCajaChanged()` se dispara en cobro, anulación, movimientos, ediciones).

### Propinas
- `shifts.tips_collected` (migración `20260611170000_shift_tips`): se ingresan al CERRAR el turno, bote APARTE (no suman a expectedCash). Visibles en arqueo POS + detalle sesión admin.
- Nómina (`GET /workers/period`): `tipsTotal` del período + `tipsShare` por empleado (proporcional a días trabajados, remanente a los primeros). Informativo — NO entra al total a pagar.

### Comanda + factura
- `renderComandaEscPos` en domain (`printer/render-comanda.ts`): ticket cocina 58mm sin precios.
- `GET /sales/:id/comanda-escpos` — permitido desde PENDIENTE_PAGO. Audit `COMANDA_PRINTED`.
- **Flujo POS**: al tocar **Cobrar** se CREA la venta (PENDIENTE_PAGO) + se imprime la comanda; al **Confirmar** se cobra + factura automática (best-effort); cerrar el modal sin pagar **cancela** la venta (`POST /sales/:id/cancel` ahora acepta COUNTER → CANCELADO_NO_PAGO).

### Edición de pedidos cobrados (SalesEditService)
- `PATCH /sales/:id/items`: editable en PAGADO/EN_PREPARACION/LISTO_DESPACHO con caja OPEN. **Regla de cocina**: si ≠ PAGADO, las líneas de preparación (no directResale) deben quedar idénticas — solo cambia reventa (bebidas). Recalcula precios/promos con `computeLine` (export de sales.service), ajusta stock por la DIFERENCIA de consumo, ajusta el pago único al nuevo total (cuenta dividida + total distinto → 400). Emite `order.status.changed` al KDS. Audit `SALE_ITEMS_EDITED`.
- `PATCH /sales/:id/payment`: reclasifica método/división del pago (suma exacta al total, solo métodos habilitados, caja OPEN). Audit `SALE_PAYMENT_CHANGED`. Para corregir descuadres.
- POS Historial: botones **Editar** (EditSaleModal con candados en líneas de preparación + agregar producto vía ProductPickerModal) y **Pago** (ChangePaymentModal). Al guardar edición se reimprime la comanda.

### Arqueo histórico (POS /arqueos)
- Detalle completo: apertura, ventas en efectivo, entradas−salidas, esperado, contado, descuadre, propinas + vendido por método + lista colapsable de ventas con su método + arqueo digital.

---

## 7.v9 Confiabilidad POS — sockets vivos, offline endurecido, tests (2026-06-11)

Bloque de hardening post-auditoría. Verificado: typecheck 12/12, lint 0, domain 122 + POS 26 (Vitest nuevo), e2e 93/93.

### Realtime
- `GET /auth/ws-token`: JWT fresco para el handshake WS (la cookie httpOnly no viaja cross-origin). `keepSocketAuthFresh` (apps/pos/src/lib/socket-auth.ts) refresca `socket.auth.token` en `reconnect_attempt` (throttle 5 min) y en `connect_error`/`auth.error` — una reconexión horas después ya no muere con token vencido. Aplica a `/ws/pos` y `/ws/kds`.
- Badge "Pedidos web" con punto de salud (verde = WS vivo; ámbar = caído con resync REST 12s).
- `usePolling` (apps/pos/src/lib/use-polling.ts): TODOS los pollers del POS pausan con pestaña oculta, refrescan al volver al frente y no solapan corridas. NO crear `setInterval` nuevos en el POS — usar este hook.

### Observabilidad
- `logError` (apps/pos/src/lib/client-log.ts): consola + ring buffer en localStorage (`window.__posLogs()` desde DevTools). Los catches best-effort (IndexedDB, print, sockets, payment-methods) DEBEN loguear por acá, no tragar.

### Offline (cierra los huecos de la auditoría)
- sync-engine: exclusión multi-pestaña con **Web Locks**, backoff exponencial 5s→5min por venta (`lastAttemptAt`), 5 intentos automáticos; OfflineProvider re-drena cada 30s mientras quede cola.
- Persistencia: si el navegador deniega `navigator.storage.persist()`, el banner offline lo avisa (cola en riesgo de purga) y queda en el logger.
- SW **v3**: warm-up de `/`, `/caja`, `/historial`, `/turnos`, `/arqueos` en install. Subir `CACHE_VERSION` al agregar rutas.
- Server `syncOffline`: rechaza `soldOfflineAt` >15 min en el futuro (audit `OFFLINE_SYNC_CLOCK_DRIFT`); audita drift de precio >1% vs catálogo (`OFFLINE_PRICE_DRIFT_DETECTED`) sin bloquear ("gana lo cobrado offline" sigue vigente).
- `openShift` sin red: cae a la apertura OFFLINE local (B.4b implementada en §7.v13).

### Sweep de cobros abandonados
- `StaleSalesSweepService`: cron 10 min cancela COUNTER `PENDIENTE_PAGO` >30 min (huérfanas del flujo "venta al abrir el cobro"); guard updateMany para no pisar un cobro en curso. Audit `STALE_SALES_SWEPT` + `POST /sales/admin/sweep-stale-pending` (Dueño). Los pedidos WEB pendientes NO se barren (los rechaza el cajero).

### Producción-readiness (2026-06-12)
- **Backup**: `.github/workflows/db-backup.yml` — pg_dump -Fc nocturno → R2 con verificación (`pg_restore --list`) y retención 30 días. Restore drill documentado en deploy.md §7. Secrets de GitHub pendientes de configurar al crear la DB de prod.
- **Alertas**: `ServerErrorAlertFilter` (APP_FILTER global, hereda BaseExceptionFilter) — 5xx inesperado → log con stack + WhatsApp al dueño (throttle 10 min por firma). `POST /client-logs` (Throttle 30/min) recibe los errores best-effort del POS (`logError` reporta con throttle local 10/min). Uptime externo: registrar `/healthz` en UptimeRobot (deploy.md §8).
- **Sesión muerta**: SessionKeeper → dos 401 consecutivos del refresh = redirect a /login.
- **Regla <200 líneas (mayormente cumplida)**: 3 componentes la exceden tras features posteriores y están pendientes de partir — `HistoryRow.tsx` (262), `CartPanel.tsx` (220), `EditSaleModal.tsx` (204). El resto del POS cumple. Helpers comunes en `apps/pos/src/lib/` (`errors.ts getErrorMessage`, `dates.ts startOfTodayIso`, `audio.ts getAudioContext`) y `features/shifts/lib/sale-statuses.ts` (`PAID_STATUSES`) — no re-duplicar.
- **Smoke navegador**: `apps/pos/e2e/smoke.spec.ts` (Playwright, chromium) — login→vender→cobrar→cerrar caja contra los dev servers corriendo (`pnpm -F @pos-tercos/pos test:e2e-ui`); setup/teardown por API maneja la caja única (reabre con dueño) y deja la caja OPEN al final. Es smoke LOCAL, no corre en CI.

### Tests POS (Vitest — `pnpm -F @pos-tercos/pos test`)
- 26 tests de lógica pura: `totals` (promos: pct/BOGO/ganador absoluto/ventana), `split` (partes iguales exactas, unidades prorrateadas, validación, vuelto), `denominations` (neto CASH-only, neto digital), `shift-summary` (cuenta dividida por método, exclusión de VOID/pendientes). Integrado a `pnpm test` (turbo).

---

## 7.v10 Eliminación de turnero + KDS (2026-06-27)

> **Decisión del dueño:** se eliminan por completo **el turnero** (llamado de turnos, pantalla de turno, campana, flash, SSE de estado) y **el KDS** (display de cocina). La app de cocina futura será **web** (no Flutter) y se construirá después; consumirá los endpoints de producción/biblia/inventario que **siguen vivos**. Verificado: typecheck 12/12, lint 0, unit (domain 135 + pos 39 + api 19).

### Nuevo ciclo de vida de la venta
- **COUNTER (mostrador): termina en `PAGADO`.** No hay estados de cocina. El recibo imprime el **# de recibo** (no "TU TURNO").
- **WEB_PICKUP:** `PENDIENTE_PAGO → PAGADO → LISTO_DESPACHO` (terminal). El cajero marca **"Marcar listo para retirar"** desde el modal de Pedidos web → `POST /sales/:id/mark-ready` (`SalesService.markWebReady`, TOCTOU-safe) → dispara el WhatsApp `pickup_ready`. **Listo = fin** para RECOGER.

> ⚠️ **`WEB_DELIVERY` agrega un paso más — ver §7.v21.** Para domicilios `LISTO_DESPACHO` significa "salió en la moto", NO el final: cierra con `ENTREGADO`.

### Eliminado
- **Backend:** módulos `apps/api/src/kds/` y `apps/api/src/public-display/` (borrados). En `app.module.ts` desregistrados. `SalesService`/`SalesEditService` ya no inyectan `KdsGateway`. Endpoints `/kds/*` y `/public-display/*` **no existen**. `KdsService.ready` reemplazado por `SalesService.markWebReady`. La asignación de `turnNumber` se quitó de `confirmPayment` + `syncOffline`.
- **Tipos:** `packages/types/src/kds.ts` y `public-display.ts` borrados. `turnNumber` quitado de `SaleSchema`, `ShiftSessionOrderSchema`, `PublicWebOrderSchema`. `ReceiptData`/`ComandaData` (domain) sin `turnNumber` (el ESC/POS imprime `PEDIDO #recibo`; offline imprime el provisional `OFF-N`).
- **App Flutter:** `apps/kds-flutter/` **borrada** (1.5G) + su job `flutter` en `.github/workflows/ci.yml`.
- **POS:** `features/turn/` borrado (TurnPanel, ReadyChimeWatcher, ManualCallSection, ready-chime), ruta `/turnos` y su tab en `PosNav`. `useKdsLiveRefresh` + `sales/api/kitchen.ts` borrados (usaban `/ws/kds`). El historial muestra `#recibo` (no "Turno N").
- **TV (public-display app):** capa de turno borrada (`useDisplayStream`, `TurnBadgeCircular`, `WhiteFlashOverlay`, `useTurnChime`, `useStreamWatchdog`, `server.ts`, CSS `.turn-*`). El SSE `/public-display/stream` ya no se consume.

### Conservado (NO tocar pensando que es del turnero)
- **TV sigue viva** mostrando **productos + publicidad + música**: `BrollStage` (carrusel B-roll), `useBrollConfig` (consulta `/api/display/broll` cada 5 min), `useAmbientMusic`, kiosk guards, wake lock. El módulo `apps/api/src/display/` (B-roll/música configurable por el dueño en `/turnero` admin) queda intacto.
- **Pedidos web** (`/ws/pos` `PosGateway`, `features/web-orders`) siguen vivos. Única acción de cocina del cajero: "Marcar listo".
- Rol `COCINERO` + `@KitchenAccess` + endpoints de producción (`/subproducts/:id/produce`, `/subproducts/production-status`) + biblia (`/recipe-book`) + inventario **siguen vivos** para la futura app web de cocina.
- **DB sin migración:** columnas `sales.turn_number`/`ready_at`/`called_at` + enums `EN_PREPARACION`/`LISTO_DESPACHO`/`ENTREGADO` quedan **dormidos** (git es el archivo; cero riesgo de migración). El audit action `KDS_ORDER_DELAYED` se conserva para leer histórico (nunca se emite de nuevo).

### Tests e2e ajustados
- `sales-edit.e2e-spec.ts` + `cogs.e2e-spec.ts`: el estado se fuerza vía `prisma.sale.update({status})` (antes lo manejaban los endpoints `/kds/*` borrados). `sales-concurrency.e2e-spec.ts`: la unicidad se valida sobre `receiptNumber` (no `turnNumber`). `auth-revocation.e2e-spec.ts`: el test de revocación WS apunta a `PosGateway` (el `KdsGateway` ya no existe).

---

## 7.v11 App de cocina (`apps/cocina`) — 2026-06-27

> La app de cocina que §7.v10 dejó pendiente, ahora **construida** (web, responsive). Reemplaza conceptualmente al KDS Flutter borrado, pero NO es un display de pedidos (hay comanda física impresa): es la herramienta del cocinero para recetas, producción e inventario. Verificado: typecheck 13/13, lint 0, e2e 165/165 (21 suites, +11 kitchen), 5 builds Next.

### Backend nuevo — módulo `kitchen` (`apps/api/src/kitchen/`, `@KitchenAccess`)
- `GET /kitchen/stock` — todos los stockables de cocina (insumo+subproducto+reventa), **cantidades sin costos** (`Stockable[]`, que no expone `lastUnitCost`). Reusa `InventoryService.listStockables`.
- `POST /kitchen/waste` — registra **merma** (movement WASTE negativo, motivo obligatorio) vía `InventoryService.createMovement`. El cocinero NUNCA hace ajustes arbitrarios ni recepción (eso entra por facturas en admin — decisión del dueño).
- `POST /kitchen/count` — **conteo físico ciego** (batch): reusa `StockCountsService.register` por ítem; devuelve `{counted, adjusted}` SIN revelar lo esperado.
- `GET/POST /kitchen/incidents` + `POST /kitchen/incidents/:id/resolve` (`@AdminAccess`) — bitácora de incidencias del cocinero para el dueño.
- `GET /kitchen/checklist?type=OPEN|CLOSE` + `POST /kitchen/checklist/complete` — checklist apertura/cierre (una rutina por `(type, día local)`). Ítems los administra el admin: `GET/POST /kitchen/checklist/items` + `PATCH /kitchen/checklist/items/:id` (`@AdminAccess`).
- Reusa lo existente: `/recipe-book` (biblia), `/subproducts/production-status` + `/produce` (producción), `/ingredients`.
- **DB nueva** (migración `20260627160000_kitchen_module`): tablas `kitchen_incidents`, `checklist_items`, `checklist_completions` + enums `KitchenIncidentCategory`, `ChecklistType`. FK a usuario relation-less (nombre resuelto en el service vía `UsersService.namesByIds`). Audit actions nuevos: `KITCHEN_INCIDENT_LOGGED/RESOLVED`, `KITCHEN_CHECKLIST_COMPLETED`, `CHECKLIST_ITEM_CREATED/UPDATED`. ⚠️ `cleanDb` (e2e) trunca las 3 tablas nuevas.

### App `apps/cocina` (Next.js 15, responsive, puerto 3006)
- Aislamiento de cookies `cocina_*` (middleware sanea `admin_*`/`pos_*`) + `X-Client-App: cocina`. El backend `auth.controller` ganó el 3er app `cocina` en `COOKIE_NAMES`/`resolveApp`. Gate de rol = `@KitchenAccess` (COCINERO/ADMIN_OPERATIVO/DUENO).
- Secciones: **Biblia** (`/biblia`, solo lectura), **Producción** (`/produccion`), **Inventario** (`/inventario`: stock + merma + conteo ciego), **Incidencias** (`/incidencias`), **Checklist** (`/checklist`). Home = launcher.
- Admin: ruta `/cocina` (incidencias + administrar ítems del checklist) + item en el sidebar (sección Operación).

### Decisiones cerradas (NO re-discutir)
- Biblia **solo lectura** (el admin cura recetas/pasos). Recepción de insumos **NO** la hace el cocinero (rompería FIFO/COGS). Stock visible al cocinero **sin costos**. Conteo **ciego** (la pantalla de conteo no pre-llena lo esperado; el cocinero igual ve stock en la pestaña Stock — aceptable para 1 cocinero). Extras incluidos: bitácora de incidencias + checklist. PEPS/caducidad de lotes quedó para fase 2.

> ⚠️ **Dos cosas de arriba ya no son exactas — ver §7.v34.** El **conteo del
> cocinero ya NO ajusta stock**: nace PENDING y lo aprueba el admin en
> `/inventory/counts` (`adjusted` vuelve 0 siempre). Y la **producción acepta
> foto de evidencia** (`evidenceKey`). El checklist tampoco funciona como se
> describe acá: se marca tarea por tarea con autoguardado.

---

## 7.v12 Bloque de ventas 2026-07 — cuentas abiertas, descuento manual, panel de pedidos (2026-07-05)

> Cierra los ajustes #1/#2/#3/#5b/#8 y TODOS los bugs de la auditoría 2026-07 (B1-B9) +
> la limitación FIFO de la reversa de cortesías. Doc de traspaso: `AUDITORIA-Y-AJUSTES-2026-07.md`.
> Verificado: typecheck 13/13, domain 151, POS 40, e2e 22 suites/177, lint limpio.
> Migración: `20260705100000_open_tabs_and_manual_discounts`.

### Cuentas abiertas (#3)
- `sales.is_open_tab` — venta COUNTER que vive en PENDIENTE_PAGO indefinidamente (cliente conocido). `CreateSale.openTab` exige `customerName`. **Exenta del sweep** de abandonadas.
- **Comanda incremental**: `sale_items.sent_to_kitchen_qty/_at`. `POST /sales/:id/send-to-kitchen` estampa lo pendiente y devuelve ambas variantes de comanda ESC/POS SOLO con lo nuevo (tanda 2+ rotulada "ADICIÓN"). `editItems` preserva lo enviado por huella de línea. Quitar una línea ya enviada NO imprime corrección (aviso de voz — limitación documentada).
- Cobro: mismo `confirm-payment`; si la caja original cerró, `resolvePaymentShift` re-cuelga la venta de la caja abierta del que cobra. Al pagar, la comanda solo lleva lo pendiente (`sendTabToKitchen`), no re-imprime.
- POS: input **Cliente** (#1) + botones **Descuento**/**Cuenta** en el carrito (`CartMetaControls`); **`OrdersPanel`** (#2, izquierda ≥lg): cuentas abiertas (Cobrar / Agregar-editar / A cocina con badge de pendientes / Cancelar) + últimos pedidos del día. Evento global `pos:orders-changed`.
- **#8**: la comanda de ANULACIÓN (render `cancelled`, número gigante) se dispara al anular una venta pagada (VoidModal) y al cancelar una cuenta abierta con tandas enviadas.

### Descuento manual (#5b)
- Por LÍNEA (`sale_items.manual_discount_kind/value`; el monto vive en `line_discount` con `appliedPromotionId=null`) y SOBRE EL TOTAL (`sales.order_discount_kind/value/amount`). FIJO y PORCENTAJE. CHECKs defensivos en DB.
- **EXCLUYENTE con promociones**: cualquier descuento manual desactiva el motor de promos para TODA la venta (server y POS espejan la regla vía `manualDiscountAmount` en `@pos-tercos/domain/common/manual-discount.ts` — puro, testeado).
- `discount_total = Σ line_discount + order_discount_amount` (CHECK `sales_total_coherent` intacto → recibos y reportes sin cambios).
- Sin aprobación pero: motivo obligatorio (`discount_reason`), audit `SALE_MANUAL_DISCOUNT`, alerta WhatsApp al dueño (kind `manual_discount`).
- Split "por productos" deshabilitado si hay descuento sobre el total; descuentos manuales NO disponibles offline (el payload de sync no los representa).

### Fixes de auditoría (B1-B9, todos cerrados)
- **B1**: `confirmPayment` re-lee items/total DENTRO de la tx SERIALIZABLE (edición concurrente → 400, nunca cobra snapshot stale).
- **B2**: `editItems` lee TODO dentro del closure de `runSaleTxWithRetry` (un retry recomputa deltas frescos; antes duplicaba ajustes de stock).
- **B3**: P2002 de `idempotency_key` → devuelve la venta ganadora (`isIdempotencyKeyConflict`).
- **B4**: la tx del cobro re-verifica que la caja destino siga OPEN.
- **B5**: `syncOffline` valida consistencia aritmética del payload (400 a la bandeja); método deshabilitado → audit `OFFLINE_SYNC_DISCREPANCY`.
- **B6**: venta offline de otro día → audit `OFFLINE_SYNC_DISCREPANCY {kind:'cross_day_shift'}` (no bloquea).
- **B8**: catches de auditoría offline loguean con `Logger.error` (ya no mudos).
- **B9**: `GET /sales` con from/to/limit inválidos → 400.

### FIFO — reversa de cortesía con base de costo real
- `runLedgerFifo` registra los draws de cada cortesía (`sourceType='cortesia'`) y los movimientos `cortesia_reversal` (delta>0) devuelven las unidades con su costo ORIGINAL (reverso FIFO, helper `returnDraws` compartido con el void de ventas) + netean `cortesia`/`cortesiaCostBySource`. Sin lotes fantasma (el faltante NO se re-inyecta — el replay cubre toda la historia). **Desde §7.v32 el faltante además se estima y deja deuda; anular la cortesía la cancela.**

### Auditoría §1.C completa (2026-07-05) — fixes posteriores
> Pasada de auditoría con 6 agentes (FIFO, reportes, dinero, inventario/crons, código muerto, frontends). Detalle completo en `AUDITORIA-Y-AJUSTES-2026-07.md §1.C`. Verificado: typecheck 13/13, domain 154, POS 40, e2e 22 suites/179, lint limpio. Lo clave:
- **`ShiftsService.close()` es tx SERIALIZABLE** + advisory lock + guard `WHERE OPEN` + retry — un cobro concurrente al cierre ya no descuadra el arqueo (SSI aborta a uno).
- **Void/reembolso con la caja de la venta CERRADA** registra la devolución como `cash_movements OUT` (por parte de pago, method-aware) en la caja ABIERTA actual; sin caja abierta se bloquea. (`resolveRefundMovementShift`/`createRefundMovements` en sales.service.)
- **Reconciliación CSV**: la ventana de `unmatched_sale` es por días CALENDARIO (antes toda venta de la tarde del último día del extracto escapaba del flag).
- **`getTopProducts`/`getProductMargins` prorratean `orderDiscountAmount`** (#5b) — revenue concilia con `sale.total`/P&G. `voidCount` del summary por `paidAt`.
- **FIFO**: tanda sin consumos → lote `unitCost=null` (nunca $0); batch malformado aplica sus consumos; sin lotes fantasma en reversa de cortesía.
- **Scan de sugerencias**: guard `scanning` compartido entre cron y endpoint manual (evita PENDING duplicadas).
- **Admin/cocina**: doble-submit arreglado en IngredientForm/SubproductForm (`submitting` cubre la red) + `portionSize > 0`; blob leak de SlideEditModal; errores visibles en IncidentsPanel/IncidenciasView/ChecklistItemsPanel; barrels de dashboard/kitchen-admin; borrados `pos/DayHistoryModal.tsx` y `cocina/lib/api-server.ts` (huérfanos).
- Decisiones aceptadas sin cambio (documentadas en el doc de auditoría): grossMargin no resta waste/cortesía (líneas separadas del P&G), margen por producto usa receta vigente (aproximación), byMethod.count = pagos, endpoints de trigger manual sin caller de UI se conservan.

### #13 Anti-abuso del pedido web (2026-07-06)
- `POST /web/orders`: máx **3 pedidos PENDIENTES por teléfono por día** (los pagados no cuentan) → 400 con mensaje claro.
- **Kill-switch** `business_config.web_orders_enabled` (migración `20260706100000_web_orders_toggle`): el dueño pausa/reactiva pedidos web desde `/finanzas/estado` (WebOrdersToggleCard) sin deploy. API → 503; `GET /web/menu` expone `webOrdersEnabled` y la web muestra banner + bloquea `/checkout`. El 503 deliberado NO alerta al dueño como error del sistema (ServerErrorAlertFilter ignora HttpException 5xx ≠ 500).

---

## 7.v13 Calidad 10/10 — snapshots FIFO, caja offline, tx helper único (2026-07-06)

> Cierra los 3 pendientes estructurales del informe de calidad (`INFORME-CALIDAD-2026-07.md`):
> B1 (ledger FIFO O(n) creciente), B.4b (apertura de caja offline — decisión del dueño:
> se REVIERTE el diferimiento) y C2 (5 copias del retry Serializable).
> Verificado: typecheck 13/13, domain 173, POS 40, web 9, api unit 19, e2e 25 suites/191, lint 0, builds 9/9.

### Snapshots mensuales del ledger FIFO (cierra B1)
- **Domain**: `runLedgerFifo(movements, seed?)` acepta una `LedgerSeed` (lotes restantes + waste/cortesías históricos + costo por cortesía, serializable) y devuelve `endingLots` + flag `needsFullReplay`. La detección de reversa que cruza el corte es por **under-return**: si una reversa no puede devolver toda su cantidad desde los draws de la ventana, el consumo original fue pre-corte (cubre también el caso parcial venta-editada-tras-el-corte). `buildLedgerSeed(fifo, cutoffIso)`. 6 tests de equivalencia matemática (replay completo === seed+incremental, con round-trip JSON).
- **API**: tabla `ledger_snapshots` (migración `20260706150000`, `cutoff_at` UNIQUE + payload JSONB). `CogsService.runLedger(rangeFrom?)` con caché por modo (incremental/full, TTL 60s): (1) valuación/lotes/cortesías usan SIEMPRE el incremental (el seed preserva agregados completos); (2) P&G/márgenes cuyo rango empiece ANTES del corte → replay completo; (3) `needsFullReplay` → fallback automático a replay completo (nunca dato incorrecto, solo más lento). Cron mensual **día 2, 4:30 AM** + `POST /reports/admin/ledger-snapshot` (Dueño). E2E `ledger-snapshot` (4 casos).
- Consecuencia: el replay habitual procesa SOLO el mes corriente — memoria y tiempo dejan de crecer con la historia. El deadline "antes del mes 9" quedó cerrado ANTES del lanzamiento.

### Apertura de caja OFFLINE (B.4b — implementada)
- **Server**: `POST /shifts/sync-offline-open` + columna `shifts.offline_local_id` UNIQUE (migración `20260706160000`). Idempotente por `localId`; `openedAt` se backdatea al momento real; si ya hay caja OPEN de hoy la **adopta** (caja única; fondo distinto queda en bitácora `openingCashMismatch`); caja OPEN de día anterior o caja del día ya cerrada → 409; reloj adelantado >15 min → 400. Si la apertura fue AYER (corte cruzó medianoche) la caja nace stale → el POS obliga al arqueo de ayer antes de operar (flujo honesto). E2E `shifts-offline-open` (5 casos).
- **POS**: `OpenShiftForm` sin conexión abre LOCAL (IndexedDB singleton `offlineShiftOpen`) y navega a vender (hard nav, el SW sirve la página cacheada); al recargar muestra el estado pendiente. El sync-engine drena la apertura **ANTES** que las ventas en cada drain (las ventas necesitan caja en el server); su fallo no bloquea las ventas. SW **v4**: warm-up de `/shift/open`; fuera `/turnos` (ruta muerta de §7.v10).

### Helper único de tx Serializable (cierra C2)
- `apps/api/src/common/tx.ts`: `isSerializationFailure` + `runWithSerializationRetry(work, maxAttempts=16)`. Reemplaza 5 copias divergentes (sales/shifts/stock-counts/production/workers-weekly). `SALE_TX_OPTS` (política de timeout del cobro) sigue en sales. NO volver a copiar el predicado — importar de `common/tx`.

---

## 7.v14 Día de NEGOCIO de la caja — corte 4 am (2026-07-09)

> Decisión del dueño: el local vende de madrugada. La CAJA ya no corta a medianoche —
> su "día" va de **4:00 am a 3:59 am** hora local (`BUSINESS_DAY_CUTOFF_HOUR = 4` en
> `@pos-tercos/domain/common/business-day.ts`: `startOfBusinessDay` / `businessDayWindow` /
> `sameBusinessDay`, puros + 12 tests). Verificado: domain 185, e2e 25 suites/208 (+3 del corte),
> POS 63, typecheck 13/13, lint 0.

### Qué cambió (solo la OPERACIÓN de la caja)
- **Guard stale** (`ShiftsService.startOfBusinessToday`): la caja abierta el jueves 5 pm sigue operable (vender, cobrar, movimientos) hasta las 3:59 am del viernes. A las 4:00 am pasa a stale → `StaleShiftGate` obliga el arqueo antes de seguir.
- **"Una caja por día"** (`open` + `syncOfflineOpen`): la ventana es el día de negocio. Cerrar a las 2 am y reabrir a las 3 am sigue bloqueado (mismo día de negocio); la caja del día siguiente abre normal desde las 4 am — cerrar de madrugada YA NO consume el cupo del día siguiente.
- **B6 offline** (`sales-offline.service`): el audit `cross_day_shift` compara día de negocio (venta 23:50 sincronizada 00:10 ya no alerta falso).
- **POS `startOfTodayIso`** (`apps/pos/src/lib/dates.ts`): las vistas operativas (historial, panel de pedidos, modal web) muestran "el día" desde el corte de las 4 am — a la 1 am el cajero sigue viendo la operación de la noche.

### Qué NO cambió (decisión explícita del dueño — NO "corregir")
- **La atribución contable de las ventas sigue en día CALENDARIO por `paidAt`**: lo vendido hasta las 23:59 es de ese día; lo cobrado a la 1 am cae al día siguiente en reportes/P&G/dashboard. El Z-report de la caja del jueves incluye la madrugada (agrupa por `shiftId`) — es esperable que Z-report ≠ reporte diario de ventas en noches que cruzan medianoche; no es un bug.
- Nómina/costos fijos/tesorería/promos (fecha-solo), checklist cocina, límite anti-abuso web (3/día por teléfono) y crons siguen en día calendario. El snapshot FIFO (día 2, 4:30 am) queda justo después del corte — alineado.

---

## 7.v15 Cuentas abiertas al cerrar caja — resolver antes de cerrar (2026-07-09)

> Decisión del dueño: una cuenta abierta (`isOpenTab` + PENDIENTE_PAGO) que quedó sin cobrar
> ensuciaba el reporte de la sesión cerrada (colgaba del `shiftId` de una caja muerta). Ahora
> el modal de cierre **pregunta** por cada cuenta abierta de esa caja antes de dejar cerrar.

### Comportamiento
- **POS `CloseShiftModal`**: si la caja tiene cuentas abiertas sin cobrar, muestra `OpenTabsResolver` (feature `sales`) y "Cerrar turno" queda deshabilitado hasta que no quede ninguna. Por cuenta, 3 acciones:
  - **Cobrar** → `CheckoutModal` normal (la plata entra a ESTA caja; el arqueo se recarga vía `loadArqueo`).
  - **Traspasar** → `POST /sales/:id/carry-over` suelta el `shiftId` (a NULL): sale del arqueo/reporte de la caja que se cierra, sigue PENDIENTE_PAGO y se cobra en la caja abierta cuando se pague (`resolvePaymentShift` la re-cuelga). Escape honesto para "el cliente sigue comiendo".
  - **Cancelar** → `POST /sales/:id/cancel` (CANCELADO_NO_PAGO); si ya fue a cocina, imprime comanda de anulación (#8).
- **Backend `SalesService.carryOverOpenTab`**: solo cuentas abiertas sin cobrar; guard condicionado (`updateMany` WHERE PENDIENTE_PAGO+isOpenTab) contra carrera con un cobro concurrente; idempotente; audit `SALE_CARRIED_OVER {fromShiftId}`. No toca stock (la cuenta abierta nunca descontó) ni el efectivo esperado (PENDIENTE_PAGO ya excluido).
- **El gate es solo de UI**: `close()` del backend sigue permisivo (admin/offline). Sin cambio de esquema.

### Verificado
- e2e `open-tabs-discounts` 13/13 (traspaso saca de la sesión + idempotencia + cobro re-cuelga + rechazo si no es cuenta abierta). POS 63, typecheck 13/13, lint 0.

> ⚠️ **Deuda de tests ajena a esto (feature de categorías en curso, sin commitear):** `products.create` ahora exige que la categoría exista (`ProductCategoriesService.resolveCanonicalName`) y `cleanDb` NO trunca `product_categories`. Los e2e que crean productos con categorías hardcodeadas **fallan en el `beforeAll`** contra una DB de test recién migrada hasta sembrar las categorías (ver `productCategory.createMany` agregado en `open-tabs-discounts`). Conviene centralizar ese seed en el bootstrap de e2e antes de commitear categorías.

---

## 7.v16 Medios de pago DINÁMICOS — el enum PaymentMethod deja de existir (2026-07-16)

> Decisión del dueño: poder **crear/editar/borrar** medios de pago desde el admin (no solo
> habilitar los del enum). Se retiran **Daviplata** y **QR Bancolombia**. Verificado:
> typecheck 13/13, lint 0, domain 190, POS 63, e2e payment-methods 9/9 + split 7/7 + live smoke.
> Migración: `20260716120000_dynamic_payment_methods`. **Supersede** §7.v7 ("catálogo = enum
> PaymentMethod") y la línea de §5 que lista el enum `PaymentMethod`.

### Qué cambió
- **`payment_method_settings` es la fuente de verdad de la IDENTIDAD del método.** El enum
  Prisma `PaymentMethod` **se eliminó**; `sale_payments.method`, `cash_movements.method` y
  `sales.payment_method` pasaron a **texto** (los valores históricos `DAVIPLATA`/`QR_BANCOLOMBIA`
  quedan legibles como texto). Columnas nuevas: `code` (PK, era `method`), `name` (label editable),
  `is_cash`, `requires_verification`, `reconciliation_source` (`NEQUI_CSV|BANCOLOMBIA_CSV|null`,
  CHECK), `is_system`. Built-ins tras la migración: **CASH** (Efectivo, sistema, efectivo, no
  borrable), **TRANSFER** (Transferencia, digital, recon Bancolombia), **CARD** (Tarjeta, digital,
  off), **NEQUI** (Nequi, digital, recon Nequi, off). Daviplata/QR **borrados del catálogo**.
- **Tipos** (`packages/types/src/sales.ts`): `PaymentMethod = string`; `PaymentMethodCodeSchema`
  (`z.string`); `PaymentMethodEnum` queda como alias deprecado (= string) para compat. Se ELIMINÓ
  el hardcode `DIGITAL_PAYMENT_METHODS` — la "digitalidad" (pide verificar comprobante) la define
  el flag `requiresVerification` **por método**, no el code. `PAYMENT_METHOD_LABELS` queda solo
  como **fallback** de built-ins + históricos; el label vivo sale del catálogo (`paymentMethodLabel`).
  Schemas nuevos: `CreatePaymentMethodSchema`, `UpdatePaymentMethodSchema`.
- **API** (`payment-methods` module): `GET /payment-methods` (habilitados, cajero) · `GET /all`
  (admin) · **`POST`** (crear custom: siempre digital, `code` = slug UPPER_SNAKE del nombre, único)
  · **`PATCH /:code`** (name/enabled/requiresVerification/reconciliationSource/sortOrder) ·
  **`DELETE /:code`** (rechaza `isSystem`; nunca deja 0 habilitados). Se eliminó el bulk `PUT`.
  El service expone `enabledSet`/`requiresVerificationSet`/`methodsForReconciliation(source)`;
  `SalesService.assertPaymentParts` y `ReconciliationService` leen del catálogo (ya no hardcodean).
- **UI**: admin `/medios-pago` con CRUD completo (agregar/editar/borrar/habilitar + verificación +
  reconciliación). Cobro POS/admin (selector, cuenta dividida, cambiar-pago, movimientos de caja,
  confirmar pago web) rinden el **nombre** del catálogo y derivan digital de `requiresVerification`.
  Offline: el POS cachea el catálogo habilitado (localStorage) y cae a CASH+TRANSFER.

### Regla dura (NO violar)
- `CASH` es **built-in de sistema**: no se borra (cajón + arqueo de efectivo + fallback offline
  dependen de él). Los métodos custom son **siempre digitales** (`isCash=false`).
- **Deuda menor documentada**: en arqueos/reportes históricos y en el recibo térmico (ESC/POS), un
  método custom se muestra por su **code** (ej. `RAPPI`); el nombre vivo solo se resuelve en el
  cobro. Built-ins (y Daviplata/QR históricos) muestran su label siempre.

---

## 7.v17 La nómina en efectivo deja de tocar el cajón (2026-07-16)

> Bug reportado por el dueño: pagó nómina desde tesorería (bolsillo **Efectivo**, con su
> `initialCash`) y el arqueo del turno mostró **"Salidas de efectivo −$765.000"** → `expectedCash`
> negativo (−$522.500) sobre una caja abierta con $100.000. Esa plata nunca salió del cajón.
> Verificado: typecheck 13/13, lint 0, e2e 27 suites/259 (+1 de regresión).

### Causa
`WorkersWeeklyService.payWeekDays` era el **único** gasto del sistema que escribía en
`cash_movements`: con `cashAmount > 0` exigía caja abierta y creaba un `OUT`/CASH colgado del
turno (`reason = "Nómina X · semana Y"`). Costos fijos, facturas y compromisos **nunca** lo
hicieron — pagan y listo, cada uno con su `cashAmount`/`bankAmount`. La nómina era el outlier.

El modal admite además defaulteaba a `EFECTIVO`, así que el camino al cajón se disparaba solo.

### Regla dura (NO violar)
- **Los movimientos de caja son inherentes a la CAJA**: solo se crean a mano desde el POS
  (`/caja`) o por la devolución cross-caja de un void (`sales.service.ts`). **Ningún módulo
  financiero (nómina, costos fijos, facturas, compromisos, tesorería) escribe `cash_movements`.**
- El bolsillo **Efectivo de tesorería ≠ el cajón del turno**. Tesorería es la plata del negocio
  (incluye el cajón como subconjunto); el arqueo es solo el cajón de ESE turno. Si el dueño
  físicamente sacó el efectivo del cajón, **registra la salida a mano** en el POS.
- Sigue vigente el contrato de `treasury.service.ts`: tesorería **NO lee `cash_movements`**
  (evita "dos verdades"). Ya descontaba la nómina vía `payroll_week_payments.cashAmount` — el
  movement del turno era un **segundo descuento contra un saldo distinto**.

### Cambios
- `payWeekDays`: fuera el gate de caja abierta y el `cashMovement.create`. Ya no necesita
  `ShiftsService` (ni `WorkersModule` importa `ShiftsModule`). Pagar en efectivo **sin caja
  abierta ahora funciona** (antes era 400).
- `voidWeekPayment`: fuera el `IN` compensatorio y su gate de caja. Anular = `status: VOIDED`
  (idempotente por claim `WHERE status='PAID'`); la plata vuelve al bolsillo por dejar de contar
  como gasto pagado.
- `payroll_week_payments.cash_movement_id`/`shift_id` quedan **legacy** (sin migración): no se
  escriben más; los abonos viejos conservan su rastro. Nadie fuera del service los leía.
- `PayWeekModal`: el aviso ámbar "sale de la caja abierta" pasa a explicar que sale del bolsillo
  de tesorería y que si la sacó del cajón registre además la salida en el POS.
- E2E `payroll-weekly`: caso "un abono EN EFECTIVO no toca la caja" (0 movimientos +
  `expectedCash` intacto + `cashMovementId` null + pago en efectivo con la caja cerrada).

---

## 7.v18 Reversa de merma + hardening de seguridad y mobile (2026-07-25)

> Sesión de auditoría completa (viabilidad prod + ciberseguridad + mobile).
> Verificado: typecheck 13/13, lint 0, unit 933, e2e 40 suites/354, builds 8/8,
> `pnpm audit --prod` sin vulnerabilidades, 5 tests de navegador (Playwright).

### La merma ahora se puede anular (única pérdida sin camino de vuelta)
- `inventory_movements` es insert-only: una merma mal tecleada ("10 kg" en vez
  de "1 kg") solo se corregía con un ajuste manual que devolvía la CANTIDAD,
  pero el costo seguía restando del neto del P&G **para siempre**.
- El movimiento compensatorio lleva `sourceType='waste_reversal'` + `sourceId`
  = id del movimiento de merma original (una merma no tiene entidad padre, a
  diferencia de una cortesía). `runLedgerFifo` lo trata como a
  `cortesia_reversal`: devuelve las unidades con su base de costo REAL y netea
  la pérdida en `waste`. Sin lotes fantasma si la merma sobre-consumió.
- `POST /inventory/movements/:id/reverse-waste` (`@AdminAccess`), motivo
  obligatorio, reversas **parciales acumulables** (nunca más de lo mermado),
  audit `INVENTORY_MOVEMENT_WASTE_REVERSED`. Botón "Anular" en la tabla de
  movimientos, oculto cuando ya se devolvió todo.
- ⚠️ El ledger tiene caché de 60s: tras anular, el P&G refleja el cambio
  cuando vence el TTL (staleness deliberada, ver `CogsService`).

### Seguridad
- **Next 15.5.19 → 15.5.21**: traía SSRF en `rewrites` y las 4 apps proxian
  `/api` con un rewrite. **bcrypt 5 → 6** (la v6 no usa `node-pre-gyp`, que
  arrastraba `brace-expansion` vulnerable; los hashes `$2b` existentes siguen
  validando). SCA de producción: 10 avisos → **0**.
- **Cadena de suministro**: GitHub Actions clavadas a commit SHA (un tag es
  movible y el workflow de backup tiene las credenciales de R2) +
  `minimumReleaseAge: 10080`, `blockExoticSubdeps`, `trustPolicy: no-downgrade`
  en `pnpm-workspace.yaml`.
- **CSP en admin, cocina y pantalla** (la web ya la tenía; el admin, donde vive
  la plata, era la única sin ella). El `connect-src` del admin incluye el
  origen del WS de pedidos web, que en prod es otro dominio — sin eso el
  socket muere en silencio. Verificada en Chromium sobre 11 pantallas.
- SSRF en el resolvedor de links de Maps: el allowlist solo cubría el primer
  salto; ahora se revalida el destino del redirect (16 tests).
- Log injection en `POST /client-logs` (se aplanan los caracteres de control).
- **Verificado y NO era problema** (documentado para no re-auditarlo): los 259
  endpoints están gateados por rol; `GET /ingredients|/products` anulan
  `lastUnitCost` para quien no es admin/dueño (`stripCostForRole`) — el
  cocinero NO ve costos; gitleaks sobre 345 commits: cero secretos reales.

### Mobile
- La barra de la caja se desbordaba 29px en 375px ("Cerrar sesión" cortado):
  abajo de `sm` el botón pasa a ícono y "Pedidos web" a "Web".
- El botón "Agregar" del menú medía **32px en teléfono y 36px en escritorio**
  (al revés de lo que pide un pulgar) → 44px en móvil, igual los chips de
  categoría. El pie de la web reserva el alto de la barra flotante + safe-area.
- Resultado: 0 pantallas con scroll horizontal en web, caja y cocina.

### Deuda conocida (no bloquea el lanzamiento)
- **Snapshot FIFO**: `needsFullReplay` se dispara cuando una anulación revierte
  una venta anterior al corte, y es **pegajoso todo el período** (una sola
  reversa que cruce el borde del mes ⇒ todos los reportes de ese mes replican
  la historia completa). No da datos incorrectos, solo más lento. Medido a
  escala real: 12 meses = 219k movimientos = **180 ms / ~200 MB de heap**. Lo
  que hay que vigilar hacia el año 2-3 es la MEMORIA (~18 MB por mes de
  historia), no el tiempo.
- **Deriva de redondeo FIFO**: acotada en **$0,48 por cada $1.000.000** movido
  (acumulación del `roundCost` de 4 decimales). Inmaterial en COP.
- El envío cuenta como ingreso (decisión del dueño 2026-07-17): el revenue de
  *top productos* difiere del de *resumen de ventas* exactamente por la suma de
  los envíos. Es esperado — pero si el pago al domiciliario no se registra como
  gasto, el neto queda inflado.

---

## 7.v19 El pedido al proveedor se abre en WhatsApp, no se envía solo (2026-07-27)

> Decisión del dueño: pedirle a un proveedor es una conversación, no una
> notificación. El sistema arma el mensaje; **lo manda la persona desde SU
> WhatsApp**. Antes salía por el número del gateway: el proveedor le contestaba
> a un número que nadie lee y el hilo quedaba partido en dos.

### Qué cambió
- **Domain** `whatsapp/supplier-order-link.ts` (puro, 8 tests): `buildSupplierOrderMessage`
  + `buildSupplierOrderLink` → `wa.me` con el texto ya escrito. Acepta N ítems
  (hoy la UI manda uno; la puerta queda abierta a agrupar varias sugerencias del
  mismo proveedor en un solo mensaje).
- **Mensaje enriquecido** (antes: "Hola! Quisiera hacer un pedido: • Pan: 3 paquete"):
  saludo al proveedor por su nombre + de parte de qué negocio + ítems con
  cantidad en unidad de COMPRA + **el día en que se quiere recibir**
  (`neededBy`, YYYY-MM-DD local; el label dice "hoy/mañana" cuando aplica) +
  nota + dirección de entrega y teléfono de contacto (de `business_config`) +
  cierre "¿Nos confirmas si lo tienes y a qué hora lo puedes despachar?".
- ❌ **El mensaje NO habla de precios** (decisión del dueño): ni el último que
  cobró, ni estimados, ni "cotízanos". Lo que cobra se negocia en el chat;
  sacar a relucir el precio viejo ancla la conversación en el peor lugar. El
  admin SÍ muestra el último precio en el selector de proveedor — es interno,
  no viaja en el mensaje.
- **API**: `POST /:id/send-to-supplier` (enviaba) → `POST /:id/supplier-order/preview`
  (read-only, arma texto+link) + `POST /:id/supplier-order` (marca ACCEPTED).
  `PurchaseSuggestionsService` ya no llama `whatsapp.sendText` para proveedores
  (sigue haciéndolo el resumen a los admins, que va a números propios).
- **Admin**: el diálogo muestra la **vista previa exacta** del mensaje (se
  rearma con 350 ms de retraso al cambiar proveedor/cantidad/nota) y el botón
  "Abrir WhatsApp". `window.open` va primero y sin `await` en el medio — con un
  `await` antes, el navegador lo bloquea como popup.
- La sugerencia se marca ACCEPTED al abrir el chat: el sistema no puede saber si
  la persona tocó enviar, y perseguirlo no vale la pena (siempre puede
  rechazarla o volver a pedir).
- Proveedor sin teléfono ya **no es un 400**: el link viene en null y la UI lo
  explica con el botón deshabilitado.

---

## 7.v20 El cierre arquea TODA la plata: cuenta obligatoria + descuadre total (2026-07-27)

> Reportado por el dueño mirando `/shifts`: un turno cerró con "+$1.000 de
> descuadre" en el cajón mientras $25.000 de transferencias quedaban **sin
> arquear** — y esa plata no entraba en ninguna novedad. El arqueo digital era
> opcional (§7.v7) y cada pata se medía por separado contra el umbral.

### Reglas duras (NO violar)
- **Arquear la cuenta es OBLIGATORIO para cerrar.** `ShiftsService.close`
  rechaza (400, nombrando los medios) si algún método NO-efectivo con
  movimiento en el turno quedó sin contar. Contar **0 sí es arquear**; dejar el
  campo vacío, no.
- **La lista de medios a arquear la manda el server.** `GET /shifts/:id/expected-cash`
  devuelve `digital[]` (`method`, `name` del catálogo, `expected`) desde la
  MISMA función que usa el cierre (`computeDigitalExpected`) → la caja nunca
  pide un medio que el cajero no vio. El cálculo con las ventas cargadas en el
  modal es solo respaldo si esa consulta falla (el listado del modal está
  paginado; con muchas ventas se quedaría corto).
- **La novedad se dispara por el descuadre TOTAL.** Además de las alertas por
  cajón y por método, si ninguna de las dos llegó al umbral pero
  `|efectivo + cuenta| >= $5.000` se registra `SHIFT_DISCREPANCY_DETECTED`
  con `metadata.kind='combined'` (+ WhatsApp al dueño). `SHIFT_CLOSED` ahora
  guarda también `digitalDifference`.

### UI
- Caja: el arqueo de cuenta muestra "falta contar" por medio, el botón
  "Cerrar turno" queda bloqueado con el detalle de lo que falta, y el widget de
  diferencia muestra el **descuadre total** (con el desglose efectivo · cuenta).
- Admin `/shifts`: la tabla muestra **Efectivo · Cuenta · Total** por turno
  (contado arriba, esperado y diferencia debajo). Los turnos viejos con medios
  sin arquear se marcan `sin arquear` y su total queda sin calcular — sumar lo
  que falta mostraría un faltante inventado.

Verificado: e2e 42 suites/376 (+1 suite `shift-discrepancy` + arqueo obligatorio
en `shifts`), unit admin 148, typecheck 12/12, lint 0.

---

## 7.v21 Domicilios encendidos: el reparto se cierra con ENTREGADO (2026-07-27)

> El dueño reportó que la web solo ofrecía "recoger". La causa NO era código
> faltante: `WEB_DELIVERY` estaba completo desde §7.v16 pero
> `business_config.delivery_enabled` nace en `false` y nadie lo había prendido
> (switch en admin → **Web del cliente** `/publicidad` → *Domicilios*).
> Verificado: typecheck 12/12, lint 0, unit api 121 + admin 148,
> e2e **42 suites / 384** (+8 en `web-delivery`), sin migración.

### El domicilio ya no muere en "despachado"
- `LISTO_DESPACHO` significaba dos cosas a la vez: en RECOGER es el final; en
  DOMICILIO era "salió en la moto" **y también** el final — o sea que "va en
  camino" y "el cliente ya comió" eran indistinguibles para siempre y el tiempo
  de reparto no se podía medir. El enum `ENTREGADO` existía pero estaba
  **dormido desde §7.v10**: ningún código lo escribía.
- `POST /sales/:id/mark-delivered` (`@CashierAccess`) → `SalesService.markWebDelivered`:
  **solo `WEB_DELIVERY` en `LISTO_DESPACHO`**, guard condicionado por status
  (dos toques concurrentes no duplican transición ni bitácora), `sale_status_log`
  + audit `SALE_STATUS_CHANGED {by:'mark-delivered'}`.
- **Sin WhatsApp**: el cliente ya tiene la comida en la mano; avisarle es ruido.
  Por eso no se agregó un 5º flag `notified_*`.
- Cajero: botón **"Marcar entregado"** en la tarjeta del pedido + filtros
  `Listos / en camino` y `Entregados` en el modal de Pedidos web.
- Ciclo final: RECOGER `…→ LISTO_DESPACHO` · DOMICILIO `…→ LISTO_DESPACHO → ENTREGADO`.

### Otros arreglos del mismo bloque
- **Copy**: `buildPaymentInstructions` (web-orders.controller) le decía "te
  avisamos cuando esté lista para **retirar**" a quien pidió a domicilio, en la
  pantalla donde está por transferir. Ahora bifurca por `deliveryAddress`
  ("…cuando salga hacia tu dirección"). El WhatsApp ya bifurcaba; esta pantalla
  se había quedado atrás.
- **Fallback mudo**: si `/web-hero/config` no responde o no valida, la web cae a
  `EMPTY_PUBLIC_BUSINESS_INFO` → `deliveryEnabled: false`. No cierra la tienda
  (`acceptingOrders: true` a propósito) pero **apaga los domicilios sin que se
  note**. Ahora `getHeroServer` loguea el motivo — si "desaparecieron los
  domicilios", la respuesta está en los logs y no en cazar el switch del admin.
- Voseo en la tarjeta *Domicilios* del admin ("Si repartís…" → "Si repartes…").

### Tope anti-abuso configurable (deuda de tests, no de producto)
- `WEB_ORDER_MAX_PER_IP_PER_DAY` ajusta el tope diario por IP (**default 25,
  sin cambio de comportamiento**; una env var basura cae al default). Existía un
  problema real de harness: toda la suite e2e pega desde `127.0.0.1`, así que
  los tests **compartían un solo presupuesto** y los últimos morían con 429 por
  vecindad. `setup-env.ts` lo sube para e2e y `web-delivery` reemplaza el
  **storage** del throttler (no el guard: `ThrottlerGuard` va como `APP_GUARD`,
  donde `overrideGuard` no llega, y pisar ese token se llevaría auth y roles).
- El anti-abuso **no quedó sin cobertura**: `web-order-daily-limit.guard.spec.ts`
  (6 tests unit) prueba tope, aislamiento por IP, reset de ventana, default y
  env var inválida.

### Pendientes conocidos (NO son bloqueantes del reparto)
- **La vitrina no anuncia el domicilio**: no hay ni una mención en home, hero,
  barra de estado ni footer — el cliente se entera recién en el checkout.
- **El pago al domiciliario no tiene campo propio**: el ingreso del envío está
  separado (`deliveryRevenue`/`foodRevenue` en el P&G, §7.v18) pero el egreso se
  registra a mano; si se olvida, el neto queda inflado por lo pagado al repartidor.

---

## 7.v22 El aviso al cliente lo manda el cajero, no el sistema (2026-07-27)

> El dueño reportó que al asignar el envío la caja decía "Avisado" sin que se
> notara ningún envío. Auditando aparecieron **tres capas de falsa confianza
> apiladas**. Verificado: typecheck 12/12, lint 0, domain 357, admin 156,
> e2e 44 suites / 398. Sin migración.

### Lo que estaba pasando
1. **No había proveedor configurado.** Sin `KAPSO_*` el factory cae al
   `MockWhatsAppAdapter`. **Ningún cliente recibió nunca un WhatsApp** — ni el
   del envío, ni instrucciones de pago, ni "pago confirmado", ni "listo".
2. **La base de datos registraba `sent`.** El mock devolvía `ok:true` y
   `NotificationService` escribía la fila igual. La tabla de auditoría mentía.
3. **El badge no miraba nada**: `const assigned = sale.deliveryFee > 0` — decía
   "Avisado" porque había un número en el campo del envío.

### Decisión del dueño: aviso MANUAL por wa.me
Como el pedido al proveedor (§7.v19): el sistema escribe el mensaje, **lo manda
la persona desde SU WhatsApp**. No necesita chip dedicado, ni número registrado
en Meta, ni templates aprobados — y el cliente responde en el hilo de siempre.

- `WhatsAppProvider.delivers?: boolean`. El mock lo declara `false` y
  `notify()` **sale sin tocar nada**: ni marca el flag ni escribe la fila. El
  pedido queda "sin avisar", que es la verdad.
- `POST /sales/:id/whatsapp/:stage[?force=true]` → `NotificationService.buildManualLink`:
  arma el `wa.me` con **el mismo texto** que enviaría el automático
  (`buildNotificationMessage` — una sola fuente para que no cambie la voz el
  día que se encienda Kapso), marca el flag y registra `status:'manual'`
  (distinto de `sent`: el histórico dice quién avisó). Sin `force`, reavisar da
  400.
- **`Sale.notified`** en el DTO (`{paymentInstructions, paymentReceived,
  readyForPickup, canceled}`): la caja ya puede distinguir avisado de sin avisar.
- Botón en los 4 momentos + el inicial de RECOGER, elegido por
  `whatsappStageFor(sale)` (puro, 8 tests). Un domicilio **sin envío cotizado no
  ofrece avisar**: el total no es real todavía.
- `window.open('', '_blank')` **antes** del `await` y luego `location.href` — con
  un await en el medio el navegador lo bloquea (piedra ya conocida de §7.v19).

### El mensaje del envío ahora muestra el desglose
`Total: $45.000 ($38.000 del pedido + $7.000 de domicilio)`. Antes decía solo el
total y "ya incluye el domicilio" — al cliente le acaba de subir el número que
vio en la web y ese es justo el dato que va a querer discutir.

### Tests: dos premisas, dos suites (NO mezclar)
- `whatsapp-manual.e2e-spec.ts` — **sin** proveedor (el mock real): verifica que
  no se envía Y que no se finge.
- `web-delivery` / `web-orders` / `whatsapp-retry` — usan
  `withDeliveringWhatsApp()` (helper en `test/helpers/`): prueban el camino
  AUTOMÁTICO, que sigue vivo para cuando exista Kapso.

---

## 7.v23 La dirección manda: Google Places + candado real de zona (2026-07-27)

> Verificado: typecheck 12/12, lint 0, e2e 44 suites / 398 (+14 de
> `web-address`). Sin migración.

### El bug de fondo: se medía la cosa equivocada
Había dos datos que no se hablaban: `deliveryAddress` (texto libre, a dónde va la
comida) y `customerLat/Lng` (**GPS del navegador**, dónde está el teléfono). El
radio validaba **el GPS**. Quien pedía desde el trabajo para su casa se medía
desde el trabajo; quien estaba parado en la puerta del local podía escribir una
dirección a 20 km y pasaba.

### Ahora
- **Puerto `AddressProvider`** en domain (`suggest` / `resolve`), con
  `GoogleAddressAdapter` (Places New, sesgado a `regionCode:'co'` + radio del
  local) y `StubAddressAdapter` determinístico para dev/tests sin llave ni
  cuota (una dirección con "lejos" cae a ~50 km).
- **La llave NUNCA va al navegador**: el autocompletado pasa por
  `GET /web/address/suggest` (40/min por IP) y `POST /web/address/resolve`
  (20/min). Es un endpoint público y cada búsqueda cuesta plata.
- **Coordenadas FIRMADAS (`addressToken`, HMAC, TTL 1h)**: el server resuelve,
  firma `{formatted, lat, lng, exp}` y el navegador solo transporta el sobre.
  Sin esto el candado sería decorativo — bastaría editar el lat/lng del body. Y
  evita pagar una segunda resolución al crear el pedido.
- **Candado real**: con `ordersRespectRadius` activo, un domicilio **sin token
  válido se rechaza** ("elige tu dirección de la lista"), y fuera del radio
  también. El GPS ya no participa de la decisión (sí se guarda: abre el mapa).
- Web: `AddressAutocomplete` (debounce 350 ms, session token de Google para no
  pagar cada tecla) reemplaza el input libre y el `LocationCheck` por GPS.
  Torre/apto/portería quedan en campo aparte — **no se geocodifican** y son lo
  que el repartidor necesita.
- Google devuelve precisión variable; se expone (`exact|interpolated|approximate`)
  y la web avisa "ubicación aproximada". A 3 km de radio esa diferencia decide.

### Config vigente (dev)
`delivery_enabled=true`, `orders_respect_radius=true`, `order_radius_km=3`.
**En prod hay que replicarlo desde admin → Web del cliente → Domicilios** (son
datos, no código) y setear `GOOGLE_MAPS_API_KEY`; sin la llave corre el stub, que
inventa direcciones.

### Decisiones tomadas (NO revertir sin preguntar)
- **Bloquear, no avisar** (decisión del dueño 2026-07-27): revierte
  "el radio es un filtro, no un candado" (§7.v13 / 2026-07-16). Aquello tenía
  sentido cuando dependía de un permiso de GPS que se puede negar; con la
  dirección verificada, ya no.
- **Línea recta** (haversine), no distancia de manejo: no se agrega otra API
  paga. A 3 km el error de recorrido pesa — si empieza a rechazar gente que sí
  se alcanza, subir el número antes que cambiar el método.

### Pendiente conocido
`WEB_ORDER_MAX_PER_IP_PER_DAY` (§7.v21) y el throttle de direcciones son **por
IP y en memoria**: siguen atados al invariante `numReplicas:1`.

---

## 7.v24 El domicilio NO es ingreso: es plata de un tercero (2026-07-27)

> **REVIERTE la decisión de §7.v18 / 2026-07-17** ("el envío cuenta como
> ingreso"). El dueño lo vio en `/reports/sales` y lo llamó "un gran error": el
> cobro del domicilio **no se lo queda el negocio**, se lo lleva el repartidor.
> Contarlo como ingreso inflaba ventas, ticket promedio y —peor— el margen
> bruto, porque el envío no consume inventario (COGS 0).
> Verificado: typecheck 12/12, lint 0, unit todo verde, e2e 44 suites / 399.
> Sin migración.

### La regla (NO volver a invertirla sin decirlo acá)
- **`revenue` = lo que se queda el negocio.** En `sales-summary`, heatmap, P&G y
  estado financiero: `Σ(total) − Σ(deliveryFee)`.
- **`deliveryCollected` = plata de terceros** recaudada. Se reporta —hay que
  arquearla y hay que pagarla— pero NUNCA se suma a los ingresos. Reemplaza a
  `deliveryRevenue`; `foodRevenue` **se eliminó** (era idéntico al nuevo
  `revenue`, dos nombres para lo mismo).
- **`byMethod` SÍ incluye el envío**: es la plata que físicamente entró por cada
  medio, y es contra eso que se arquea y se concilia con el banco. De ahí la
  identidad `Σ byMethod = revenue + deliveryCollected`, que la UI explica en
  vez de esconder (si no, "por método de pago" parece no cuadrar).
- **Caja y arqueo no cambian**: el efectivo del domicilio está en el cajón. Si
  el dueño le paga al repartidor, eso es una **salida de efectivo** registrada a
  mano en el POS (§7.v17: ningún módulo financiero escribe `cash_movements`).

### Efecto colateral bueno
La deuda de §7.v18 ("el revenue de *top productos* difiere del de *resumen de
ventas* exactamente por la suma de los envíos") **queda cerrada**: ahora los dos
excluyen el envío y coinciden. Hay un invariante que lo fija en
`math-invariants`.

### Otros arreglos del mismo bloque
- **`WEB_DELIVERY` crudo en pantalla**: los dos mapas de etiquetas de
  `reports-sales` tenían solo COUNTER y WEB_PICKUP, así que el dueño leía el
  nombre del enum. Ahora hay **`SALE_TYPE_LABELS` / `saleTypeLabel()` en
  `packages/types`** (misma solución que `SALE_STATUS_LABELS`): una sola fuente,
  imposible olvidar un tipo nuevo en una app.
- **El detalle del pedido dice cuánto es domicilio** (modal del cajero y fila
  expandida del reporte), con el "queda en el negocio" al lado. Antes el salto
  entre subtotal y total no tenía explicación.
- **Recibo del pedido web**: `ConfirmWebPaymentModal` mandaba la comanda a
  cocina pero **no imprimía la factura** (el mostrador sí). Se agregó, con el
  mismo best-effort.
- **Pedidos web en el panel de Vender**: `OrdersPanel` consultaba
  `type: 'COUNTER'`, así que un pedido web cobrado no aparecía en "Últimos
  pedidos" aunque sí estuviera en Historial.
- **Envío + aviso en un solo toque**: `DeliveryFeeField` guarda la tarifa y abre
  WhatsApp en la misma acción (antes eran dos botones seguidos para una sola
  idea). `whatsappStageFor` devuelve null para domicilio sin cobrar — ese aviso
  lo dispara el campo del envío.
- Copy: "N pedido llevan más de 10 min sin completarse" → concordancia y
  "sin **cobrarse**" (el contador solo mira `PENDIENTE_PAGO`, no cocina).

---

## 7.v25 La web del cliente deja de contar el progreso del pedido (2026-07-27)

> Decisión del dueño: el avance del pedido lo marca el cajero a mano y en la
> práctica no siempre ocurre. Una barra "Recibido → Preparando → Listo" que
> nunca avanza es peor que no tenerla: promete algo que no va a pasar.
> Verificado: typecheck 12/12, lint 0, unit todo verde, e2e 44 suites / 399.

### La web muestra TRES desenlaces, no ocho estados
| Desenlace | Cuándo | Qué ve el cliente |
|---|---|---|
| Esperando tu pago | `PENDIENTE_PAGO` | Cómo pagar + botón de WhatsApp (lo único accionable) |
| Pago confirmado | `PAGADO` y cualquier avance posterior | Su número de pedido; el resto llega por WhatsApp |
| Cancelado | `CANCELADO_*` / `VOID` | Que no se completó |

- **Borrado** `StatusTimeline` (las 3 pastillas de progreso) y el "Tiempo
  estimado: listo en ~20 min" — nada respaldaba esa promesa.
- `PAGADO` pasa a ser **terminal para la web**: el poller deja de consultar ahí
  (antes seguía hasta `LISTO_DESPACHO`, gastando requests para redibujar lo
  mismo) y el banner de "pedido en curso" se limpia. `isTerminalStatus` quedó
  como **fuente única** — el poller tenía su propia copia y se habían
  desincronizado.
- El **domicilio va antes del total** en el detalle: puesto después, el total se
  leía como si le faltara sumar algo.

### Lo que NO se tocó
Los botones del cajero (**Marcar listo · Marcar despachado · Marcar entregado**)
y los mensajes de WhatsApp **siguen existiendo**. El canal de avance es WhatsApp,
no la página.

> ⚠️ **Consecuencia operativa**: si el cajero no usa esos botones, los pedidos se
> quedan en `PAGADO` para siempre — se acumulan en "Por preparar" del modal de
> Pedidos web y ningún domicilio llega nunca a `ENTREGADO` (§7.v21), así que el
> tiempo de reparto no se puede medir. El cliente igual no se entera: la web ya
> no promete ese avance.

---

## 7.v26 Cerrado = no se arma pedido · el chat se abre solo (2026-07-27)

> Dos ajustes del dueño sobre la web del cliente. Verificado: typecheck 12/12,
> lint 0, unit todo verde, e2e 45 suites / 412.

### Con el local cerrado no se puede hacer crecer el pedido
Antes solo se bloqueaba el checkout: el cliente armaba todo y chocaba al final.
La regla ahora es una: **cerrado ⇒ el pedido no crece.**

| Acción | Cerrado |
|---|---|
| Ver el menú y los precios | ✅ |
| Tocar un producto (abrir el picker) | ❌ |
| Sumar cantidad en el carrito | ❌ |
| Quitar / vaciar | ✅ |
| Ir a pagar | ❌ |

- El card dice **"Cerrado"**, NO "Agotado": el producto existe y mañana se
  vende igual — reusar el cartel de agotado mentiría sobre el motivo.
- El menú se sigue leyendo a propósito (quien mira a las 3 pm es el cliente de
  las 5) y el carrito **no se borra**.
- Todo sale de `acceptingOrders` (kill-switch + horario, resueltos en el
  server): la web no recalcula nada.
- ⚠️ Depende del switch **"Fuera de horario, no aceptar pedidos web"**. En dev
  quedó prendido; **en prod hay que prenderlo desde admin** (es dato, no código).

### El chat de WhatsApp se abre al confirmar, sin botón extra
El botón "Enviar mi pedido por WhatsApp" de la pantalla de seguimiento era un
paso que —observación del dueño— la mayoría no iba a dar; y sin ese mensaje el
pedido quedaba esperando a que el cajero se acordara de escribir.

- **El motivo técnico que lo justificaba ya no existía**: se puso para que el
  cliente escribiera primero y se abriera la ventana de 24 h de la Cloud API.
  Desde §7.v22 los avisos salen del WhatsApp **personal** del cajero — no hay
  ventana ni templates que respetar.
- Ahora `CheckoutForm` abre el chat **dentro del gesto de confirmar**
  (`window.open('', '_blank')` ANTES del `await`, luego `location.href` — la
  misma piedra del pop-up de §7.v19).
- `SendOrderByWhatsApp` **queda** como respaldo, en tono secundario y al final:
  cubre pop-up bloqueado, pestaña cerrada o volver al link horas después.
- Beneficio operativo: el mensaje entrante le llega al cajero **a su teléfono**,
  que es una señal más fuerte que un badge en el POS.

---

## 7.v27 El domicilio en el cierre de caja: contado pero marcado (2026-07-27)

> El dueño reportó que el cierre "tiene en cuenta el valor del domicilio".
> Verificado contra los datos: el **efectivo esperado NO lo incluía** (sus dos
> domicilios se pagaron por transferencia). Lo que sí lo incluía eran las
> **líneas de ventas** del reporte — inconsistencia con §7.v24, que dejó los
> reportes netos pero no tocó el Z del turno.
> Verificado: typecheck 12/12, lint 0, unit 165 admin, e2e 45 suites / 412.

### La regla (NO invertirla sin leer esto)
Un domicilio pagado **en efectivo** deja esa plata **físicamente en el cajón**.
Por eso `expectedCash` la sigue esperando: si no lo hiciera, cada domicilio en
efectivo produciría un **sobrante fantasma** en el arqueo. La plata se descuenta
cuando se le paga al repartidor, registrando una **salida de efectivo** (§7.v17:
los movimientos de caja se hacen a mano en el POS).

| Cifra | Domicilio | Por qué |
|---|---|---|
| `totalSales` (vendido) | **excluido** | No es ingreso del negocio |
| `byMethod` / `cashSalesTotal` | **incluido** | Es la plata que entró; se arquea contra esto |
| `expectedCash` | **incluido** | Está en el cajón |

De ahí la identidad `Σ byMethod = totalSales + deliveryCollected`.

### Lo que se agregó
- `deliveryCollected` y **`deliveryCashCollected`** en `ShiftSummary`. El
  segundo es la parte que entró en efectivo (prorrateada por la porción CASH en
  cuentas divididas): el Z-report avisa en ámbar **"de lo esperado, $X son
  domicilios cobrados en efectivo: son del repartidor"**, para que el cajero
  sepa cuánto de lo que cuenta se va a ir.
- El pie del Z pasó de "Total ventas del turno" a **"Vendido en el turno"**
  neto, más "· más $X de domicilios (no son ingreso)".
- 7 tests nuevos en `shift-summary.test.ts`, incluido el prorrateo de cuenta
  dividida y el caso "domicilio por transferencia no ensucia el efectivo".

### Bug de fondo encontrado
`ShiftZReport.tsx` declaraba **su propia copia** de `interface ShiftSummary` con
4 campos. Por eso agregar datos al resumen no llegaba al reporte. Ahora importa
el tipo real — un tipo duplicado por componente es una desincronización
esperando a que alguien agregue un campo.

### Barrido posterior: 3 pantallas más contaban el envío como ingreso
§7.v24 neteó el resumen de ventas y el P&G, pero **quedaron tres sumando
`total` bruto**. Encontradas revisando todos los `_sum: { total }` y `+= s.total`
del backend:

1. **Dashboard de inicio** (`getDashboardSummary`): ingresos del día **y** el
   comparativo de la semana pasada. Se netean los DOS lados — netear solo hoy
   habría inventado una caída en el WoW%.
2. **Estado financiero** (`finance-summary`): `revenue` del mes y, con él, el
   `netCash` (ingresos − pagado).
3. **Resumen diario del dueño (IA)**: mezclaba las dos escalas —
   `digitalRevenue = totals.revenue (NETO) − cashRevenue (BRUTO)`—, así que con
   un domicilio en efectivo salía **negativo**. Ahora lo digital se suma de su
   propio lado.

**Correctos, verificados y NO tocados:** la conciliación bancaria (matchea
`sale_payments.amount`, que es lo que llegó al banco), `byMethod`,
`cashSalesTotal` y `expectedCash`. Tesorería sigue en bruto a propósito: mide
plata en bolsillos reales, y el envío por transferencia **sí** entró a la cuenta
(la deuda ahí es que el pago al domiciliario no se registra en ningún lado).

Invariante nuevo en `math-invariants`: *"ninguna pantalla de ingresos cuenta el
envío, y lo cobrado sí"* — recorre resumen, dashboard y byMethod en un solo caso.

### Aviso del efectivo (corregido tras aclaración del dueño)
El efectivo de un domicilio **se le paga directo al domiciliario: no entra al
cajón**. Por eso, si aparece un domicilio registrado como cobrado en efectivo,
el Z avisa que el esperado lo está contando de más — en vez de sugerir
registrar una salida que no corresponde a esta operación.

---

## 7.v28 El domicilio sale del arqueo y pasa a ser UN dato de decisión (2026-07-27)

> Regla del dueño, sin excepciones: *"ese dinero no es del negocio ni se cuenta
> para cierres de caja, arqueos, ventas"*. Y un único dato que sí quiere:
> **cuánto se llevan los domiciliarios**, para saber cuándo conviene contratar.
> Verificado: typecheck 12/12, lint 0, unit 165 admin, e2e 45 suites / 414.

### Fuera del efectivo esperado
`computeExpectedCash` ahora **resta el envío** de la porción cobrada en efectivo
(prorrateado en cuentas divididas). Razón operativa: **el efectivo del domicilio
se le paga DIRECTO al domiciliario y nunca entra al cajón** — el repartidor solo
devuelve lo de la comida. Antes se esperaba y cada domicilio en efectivo habría
marcado un faltante inventado.

Invariante nuevo: *"un domicilio cobrado en efectivo NO sube el efectivo
esperado"* (paga 13.000, el cajón espera 5.000).

### El dato: `DeliverySpendCard` en /finanzas/estado
Total del mes + cantidad + promedio por entrega, con la comparación explícita
contra lo que costaría un repartidor propio. **Tarjeta aparte, NO dentro del
P&G** — y se quitó de ahí la línea que había: no es venta (el negocio no se
queda el peso) ni gasto propio (lo paga el cliente), así que dentro del P&G
volvía a mezclarse con la plata del negocio.

### Único lugar donde el envío SIGUE contando (y por qué)
El **arqueo digital**. Un domicilio pagado por transferencia **sí entró a la
cuenta**: si el esperado lo excluyera, el cajero contaría el banco y vería un
sobrante en cada domicilio — con alerta de descuadre al dueño (§7.v20) cada vez.
El arqueo digital no es una cifra de ventas: es "cuánto hay en la cuenta".

### Segunda pasada: el envío desaparece de TODA la caja
El historial de arqueos llamaba **"Ingresos"** a la suma de `byMethod`, y
`ShiftSessionSummary.totalRevenue` venía bruto. Al mostrarlo separado el dueño
fue claro: **es ruido**. Los domiciliarios cobran **en el momento**, no por días
— no hay nada que conciliar ni que entregar después, así que verlo en un arqueo
no aporta.

- `totalRevenue` (sesión) pasa a **neto**; `ShiftSessionOrder` lleva su
  `deliveryFee` y el resumen expone `deliveryCashCollected` (uso INTERNO: netear
  la fila de efectivo).
- `ArqueoDetail`: **"Ingresos" → "Cobrado"**, la fila de efectivo va neta y
  **no hay línea de domicilios**. Ídem el Z de cierre y el detalle de `/shifts`.
- **Reporte de ventas: `byMethod` también va NETO** (prorrateado por método).
  Antes sumaba más que "Ingresos" y hacía falta un párrafo explicándolo; ahora
  cuadra exacto y no hay nada que explicar. Invariante:
  `Σ byMethod === totals.revenue`.

**El envío se ve en UN solo lugar: la tarjeta "Domicilios del mes"**
(Finanzas → Estado). Total, cantidad y promedio, para decidir cuándo conviene
contratar un repartidor propio.

### Mapa final del envío
| Dónde | ¿Aparece el envío? |
|---|---|
| Ventas, ingresos, P&G, dashboard, estado financiero, `byMethod` | **No** |
| Cierre de caja, arqueo del cajón, historial de arqueos, detalle de sesión | **No** |
| Arqueo digital y conciliación bancaria | **Sí, en el número** (el banco lo recibió) pero **sin línea propia** |
| Tarjeta "Domicilios del mes" (Finanzas) | **El único lugar donde se muestra** |

⚠️ Si un domicilio se paga por transferencia y al repartidor se le da efectivo
del cajón, esa salida hay que registrarla en Caja como cualquier otra — si no,
el arqueo marca faltante. El sistema ya lo soporta; no hay automatismo.

---

## 7.v30 El envío NUNCA está en el arqueo, en ningún medio (2026-07-28)

> Aclaración final del dueño: **"entran pero salen al momento… no hay un cierre
> de caja donde no se hayan pagado todos los domicilios"**. Al repartidor se le
> paga al entregar, siempre. Entonces al cerrar esa plata YA SALIÓ, de cualquier
> medio — y el arqueo no debe esperarla.
> Verificado: typecheck 12/12, lint 0, unit 165 admin, e2e 45 suites / 416.

### La regla, ahora sin excepciones
`expectedCash` **y** `computeDigitalExpected` restan el envío, prorrateado por
la parte que pagó cada medio. Ídem `ShiftSessionSummary.byMethod`, que es de
donde leen el historial de arqueos y el detalle de `/shifts`.

Consecuencia buscada: **ningún total de caja incluye el domicilio** — ni el
esperado en efectivo, ni el de cuenta, ni el total del turno, ni en el admin.
Invariante: en el detalle de sesión, `Σ byMethod === totalRevenue`.

### Se descartó el registro manual de pago al domiciliario
Una versión intermedia agregó `POST /sales/:id/delivery-payout` + un vínculo
`cash_movements.sale_id` para registrar a mano "le pagué al repartidor". **Se
revirtió entero** (código y migración, nunca se commiteó): si el pago es
automático y garantizado en cada entrega, pedirle al cajero que lo registre es
un paso que nunca va a fallar de forma útil — solo ruido. Se deja anotado para
no reinventarlo.

⚠️ El corolario que hay que aceptar: el sistema **asume** que todo domicilio se
pagó. Si alguna vez no fuera así, el arqueo mostraría un sobrante por ese monto.
Es el trade-off elegido a cambio de que la caja quede limpia.

### Dónde vive el dato
Solo en la tarjeta **"Domicilios del mes"** (Finanzas → Estado): total, cantidad
y promedio, para decidir cuándo conviene un repartidor propio.

---

## 7.v31 Auditoría de estabilidad: el arqueo del cliente y la merma doble (2026-07-28)

> Auditoría cíclica pedida por el dueño (estabilidad, fugas, arquitectura,
> seguridad). Los gates ya estaban verdes al empezar: los dos bugs salieron de
> leer la lógica, no de los tests. Verificado: typecheck 12/12, lint 0,
> unit 1.079, e2e 45 suites / 417, builds 8/8.

### El badge "En caja" mostraba de más el domicilio cobrado en efectivo
`computeShiftSummary` (admin) seguía en la semántica **bruta** de §7.v27
mientras el server ya iba **neto** (§7.v30). No es un caso de borde: el badge
del topbar y `CajaPanel` usan SIEMPRE el cálculo del cliente —sin respaldo del
server—, así que en cualquier turno con un domicilio en efectivo el cajero veía
un número y contaba otro. El Z-report además no cuadraba consigo mismo
(apertura + ventas en efectivo + entradas − salidas ≠ esperado), porque el
"esperado" sí venía del server.

- La fórmula del prorrateo estaba escrita a mano en **5 lugares**. Ahora vive
  una sola vez en `packages/domain/src/finance/delivery-netting.ts`
  (`netOfDeliveryFee` / `deliveryFeeShareOfPayment`, 11 tests) y la importan
  `computeExpectedCash`, `computeDigitalExpected`, el resumen de sesión, el
  reporte de ventas y el admin. **Si cambia la regla del envío, se cambia ahí.**
- Los tests del admin afirmaban el comportamiento viejo — se corrigieron al
  invariante real: `Σ byMethod === totalSales`.

### Doble clic en "Anular merma" devolvía el doble de stock
`InventoryService.reverseWaste` leía "lo ya devuelto" y escribía la reversa
**fuera de transacción**. Dos requests leían ambas `alreadyReturned = 0`, las
dos pasaban el tope y el insumo volvía al doble. Y como `inventory_movements`
es insert-only, ese fantasma **no se borra**: solo se compensa a mano.

Ahora va en tx `Serializable` + `runWithSerializationRetry` (el patrón ya
establecido en ventas/cierre/producción). Test de regresión en
`waste-reversal.e2e-spec.ts`, **verificado que falla sin el fix** (2 de 6
requests entraban). ⚠️ Con solo 2 requests en paralelo la carrera no se
reproduce — el test manda 6.

### Promesas sueltas: ahora las atrapa el linter
Se activaron `no-floating-promises` y `no-misused-promises` (con tipos, vía
`projectService`) en las 5 apps. **Había cero violaciones de floating**: no
limpió nada, congela la disciplina que ya existía para que no se pierda.

- `checksVoidReturn: { attributes: false }` es obligatorio: sin eso marca 88
  `onClick={async () => …}` perfectamente sanos y la regla termina apagada.
- Solo sobre `src/` — `next.config.ts`/`vitest.config.ts`/`prisma/seed.ts` están
  fuera del tsconfig de la app y el parser con tipos los rechaza.
- Se arreglaron los 4 sitios reales (`setInterval`/`setTimeout` con callback
  async, `forEach` sobre promesas en el service worker de dev).

### Dos huecos de tooling que llevaban tiempo abiertos
- **`apps/cocina` nunca tuvo reglas de hooks.** El glob del linter decía
  `apps/{admin,pos,web,public-display}`: `pos` ya no existe (se fusionó en
  `admin`) y `cocina` (§7.v11) nunca se agregó. Corregido — y al agregar una
  app nueva hay que agregarla ahí o queda sin linter en silencio.
- **`caja-events` movido a `admin/src/lib/`.** `sales` lo importaba por ruta
  profunda para esquivar un ciclo REAL (`caja-shifts` ya importa el barril de
  `sales`). Un bus de eventos es transversal, no propiedad de un feature. De
  paso: dos `vi.mock` apuntaban a `features/shifts/lib/caja-events` —que no
  existe, es `caja-shifts`— y llevaban tiempo siendo inertes.

### Deuda reportada y NO corregida (decisión: no refactorizar a ciegas)
- **42 componentes >200 líneas** (la regla de §3 dice <200) y **11 imports
  cross-feature** que saltan el `index.ts`. Son de mantenibilidad, no de
  estabilidad; partirlos sin supervisión es más riesgo que beneficio.
- Cobertura API: **77,7% statements / 62,5% branches**. Lo más flojo con lógica
  real es `subproducts/production.service.ts` (**20%**), que es justo el camino
  concurrente de producción — candidato #1 a más e2e.
- Verificado y sin novedad (para no re-auditarlo): SQL siempre parametrizado,
  cero `dangerouslySetInnerHTML`/`eval`, cookies `httpOnly`+`sameSite:lax`,
  CORS con allowlist obligatoria en prod, todos los `setInterval` con cleanup,
  cachés en memoria acotadas (`prune`), y todos los `void this.x(...)` van a
  services que envuelven su cuerpo en try/catch (no hay unhandled rejection que
  tumbe el proceso en Node 20).

---

## 7.v32 Lo que se regala o se tira SIEMPRE tiene un costo (2026-07-30)

> El dueño vio una cortesía de hamburguesa costeada en **$3.425** cuando el
> producto vale **$4.925** de insumos, y lo llamó por su nombre: *"nunca se
> asume en cero porque es un gran error, debe darle un valor"*.
> Verificado: domain 376, api unit 121, admin 172, **e2e 45 suites / 419**,
> typecheck 12/12, lint 0, más verificación visual de las dos pantallas. Sin
> migración.

### Qué pasaba
La hamburguesa consume, a un nivel, 1 Pan + 1 Pollo sazonado. El Pan estaba en
**−8 unidades** (25 compradas, 33 consumidas), así que FIFO no tenía lote del
cual sacar su costo. La cortesía cargó solo el subproducto ($3.425) y el pan
sumó **$0** — el número se veía exacto y estaba incompleto.

La causa era una asimetría deliberada del ledger: **la venta estimaba su
faltante al último precio conocido y dejaba una DEUDA** que la próxima compra
corrige a costo real, pero **merma y cortesía no estimaban nada**: su faltante
quedaba en `unknownQty`, que en el P&G suma cero. Regalar o tirar un insumo que
no estaba cargado salía gratis.

### La regla (NO volver a invertirla)
- **Los CUATRO consumos estiman igual**: venta, cortesía, merma y **producción**.
  El faltante se valora al último precio conocido del replay y, si el stockable
  nunca tuvo entrada, al respaldo del catálogo (`fallbackUnitCost`).
- **Sin ningún precio con qué estimar sí queda `unknownQty`** — ahí es
  desconocido de verdad, y eso es distinto de cero.
- **Todo faltante crea DEUDA** (`Debt.kind: 'sale' | 'cortesia' | 'waste' |
  'production'`), así que la próxima compra lo corrige al costo REAL por
  diferencia. Antes solo la venta lo hacía; como los otros tres no dejaban
  deuda, sus unidades fantasma tampoco se descontaban de la compra siguiente y
  la valuación quedaba por encima del stock real de la DB. Esto lo cierra.
- **La producción es la excepción parcial**: estima igual (si no, el subproducto
  nace barato y ese descuento se arrastra a TODO lo que se venda con él) y su
  deuda se salda para sacar las unidades fantasma del inventario, pero el lote
  producido **NO se re-costea**: pudo venderse hace meses y reabrir esa cadena no
  es viable. La diferencia contra el estimado queda sin registrar — limitación
  acotada al caso de producir sin haber cargado la compra.
- **La corrección se imputa a la fecha del CONSUMO**, no a la de la factura: si
  cayera en el mes de la compra, el mes que regaló el producto quedaría
  subestimado para siempre (los reportes filtran `waste`/`cortesia` por fecha).
- **Anular una cortesía o una merma cancela su deuda**, o una compra posterior
  saldaría la deuda de algo que ya no existe.

### Dónde
Todo en `packages/domain/src/cost-fifo/run-ledger.ts`: `registerShortfall`
(único lugar donde nace una deuda), `attributeToLoss` (netea en la línea de
merma o cortesía) y el saldo dentro de `addLot`, que ahora despacha según
`kind`. `Debt.saleId` pasó a `Debt.consumerId` — un snapshot viejo se hidrata
al shape nuevo, no hay que regenerarlo.

Las historias aleatorias de `test-support/ledger-histories.ts` ahora generan
mermas, cortesías **y tandas de producción** sin stock: las leyes de propiedad
(conservación de unidades, nada valuado en $0, equivalencia snapshot vs replay
completo) cubren el camino nuevo.

### La UI dice cuándo el número es estimado
Un estimado presentado como exacto es el mismo problema que el $0: el dueño lee
una cifra cerrada. El ledger ahora declara **cuánto** de cada pérdida es
estimado (`LossEntry.estimatedCost`, que vuelve a 0 solo cuando la factura salda
la deuda) y eso viaja hasta la pantalla:

- **Solicitudes de cortesía**: "aprox." junto al total del mes + aviso con el
  monto estimado, y `· estimado` en la fila de cada cortesía
  (`CortesiaGivenSummary.estimatedCost`, `CortesiaRequest.fifoCostEstimated`).
- **Estado financiero**: aviso bajo las líneas de Cortesías y de Merma
  (`cortesiasCostEstimated` / `wasteCostEstimated`), con el mismo tono que el
  aviso de COGS estimado que ya existía.
- `partial` (no había NINGÚN precio con qué estimar) ahora dice "está
  subestimado", que es distinto de "es aproximado".

De paso, `CortesiasPanel` declaraba **su propia copia** del resumen del mes con
3 campos: por eso agregar datos al backend no llegaba a la pantalla. Ahora
importa `CortesiaGivenSummary`. Es el mismo error que `ShiftZReport` en §7.v31 —
un tipo duplicado por componente se desincroniza siempre.

⚠️ El ledger cachea 60s: después de subir la factura que salda una deuda, el
P&G refleja el costo real cuando vence el TTL.

---

## 7.v32 La cortesía es un pedido del día: va en el historial (2026-07-30)

> El dueño regaló una hamburguesa y en el historial del día solo apareció el
> pedido cobrado. La cortesía **sí** estaba registrada (`cortesia_requests`,
> stock descontado, notificación al dueño) pero vivía únicamente en una pestaña
> aparte que leía `/cortesias/mine` — las de otro usuario no se veían y el chip
> no traía contador, así que en la práctica era invisible.
> Verificado: typecheck 12/12, lint 0, unit admin 172 (+10), e2e cortesías 9/9.
> Sin migración.

### La regla
- **Un pedido regalado es un pedido**: la cocina lo preparó y el negocio no lo
  cobró. Va en la MISMA lista que las ventas del día, ordenado por hora,
  rotulado `CORTESÍA` y con el valor **tachado** + "regalado · no se cobró" (es
  pérdida, no un pedido más que entró plata). El motivo se muestra siempre —es
  lo que el cajero necesita para explicarlo— y las `REVERSED` se ven "no cuenta".
- **Los filtros por estado son de VENTA** (Pend. pago / Pagados / Listos /
  Anulados): una cortesía no se cobra ni se anula, así que solo sale en «Todos»
  y en su propia pestaña. El contador de «Todos» sí la cuenta.
- **El historial del día no filtra por cajero** — tampoco el de cortesías.
  Nuevo `GET /cortesias/day?from=` (`@CashierAccess`, todas las del día de
  negocio, `from` inválido → 400). `/cortesias/mine` queda para el watcher de
  novedades, que sí es personal.
- Si la lectura de cortesías falla, el historial de ventas se muestra igual (un
  regalo no puede tumbar la pantalla operativa); el fallo va al `logError`.

### Detalle
- **Las dos listas del día llevan cortesías**: el historial (`DayHistoryPanel`)
  y «Últimos pedidos» del panel de Vender (`RecentOrdersSection`, extraído de
  `OrdersPanel` — que quedó en 240 líneas).
- **Se toca y se ve, igual que un pedido cobrado**: `CortesiaDetailModal`
  (qué salió · motivo · quién la dio · valor regalado) se abre desde las dos
  listas. Una fila que no responde al tap cuando todas las de al lado sí,
  se lee como que la app está rota.
- **Aparece al instante, sin recargar**: regalar el pedido emite
  `notifyOrdersChanged()` (el mismo bus que cobrar/anular/editar) y el
  historial **se suscribió** a ese evento — antes solo pooleaba cada 8s, así
  que cualquier cambio hecho en otra vista tardaba o exigía recargar.
- `mergeDayEntries`/`entryMatchesFilter` (`features/sales/lib/day-entries.ts`,
  puros) hacen la unión; `CortesiaHistoryRow` (feature `caja-cortesias`) rinde
  la fila del historial. Se **borró** `CortesiasList`: su scope "mías" era el
  bug y su "Marcar visto" ya lo cubre el `CortesiaNotifier` (toast).

---

## 7.v33 Ningún mensaje de WhatsApp depende de un emoji (2026-08-24)

> El dueño mostró un pedido que le llegó con `�` donde iban los iconos y sin el
> comentario que el cliente había escrito. Verificado: typecheck 12/12, lint 0,
> domain 388, api unit 121, admin 177, web 22, types 168.
> Migración: `20260824120000_payment_accounts` (**sin aplicar**: Docker abajo).
> ⚠️ e2e NO corridos en la sesión (el daemon de Docker no levantó); las suites
> que tocan estos textos afirman subcadenas que sobreviven al cambio.

### La nota del cliente nunca llegaba al chat
`buildWebOrderLink` acepta `notes` desde siempre, pero el campo se cortaba en dos
puntos: `PublicWebOrderSchema` no lo exponía y **ninguno** de los dos que arman el
link lo pasaba (`CheckoutForm`, `SendOrderByWhatsApp`). El cliente escribía "sin
cebolla" en el checkout, se guardaba en la venta y nadie lo veía. Ahora viaja en
el DTO público (y en la proyección del panel del cajero, `saleToPublicWebOrder`).

### Sin emoji, en ningún mensaje (regla dura)
Todos los pictogramas que usábamos están **fuera del plano básico de Unicode**
(4 bytes: 🛵 🙌 👋 📅 📍 …). El código y el `encodeURIComponent` estaban bien —se
verificó byte a byte en fuente y en `dist`— pero en el teléfono del dueño llegaban
como `�`. Los únicos de 3 bytes que sobrevivían eran `✅` y `⚠`, o sea casi
ninguno: elegir "emoji seguros" no era una salida.

- La jerarquía la da la **negrita de WhatsApp** (`*texto*`) y el salto de línea.
  En los mensajes al cliente van en negrita el `#pedido` y el total — los dos
  datos que vuelve a buscar cuando reabre el chat.
- En el pedido al proveedor, los iconos que rotulaban cada bloque pasaron a ser
  etiquetas escritas (`Lo necesitamos:`, `Nota:`, `Entrega en:`, `Contacto:`).
- ⚠️ Al quitar un emoji hay que mirar la puntuación: `va en camino 🛵 Lo llevamos
  a:` quedaba como frase corrida.
- Un test de propiedad en `owner-alerts.test.ts` recorre las alertas y falla si
  reaparece un codepoint > U+FFFF.

### Los datos de pago salen del admin y el número se copia de un toque
Decisión del dueño: **sin QR** — el número de cuenta, fácil de copiar. Un link
`wa.me` solo transporta texto (no hay forma de adjuntar una imagen), así que un
QR habría exigido encender Kapso o adjuntarlo a mano en cada pedido.

- `buildPaymentAccountsText` (domain, puro, 4 tests) imprime cada cuenta como
  **rótulo / número solo en su línea / a nombre de**. El número va sin rótulo
  pegado, sin `:` y **sin negrita** (los asteriscos de WhatsApp se cuelan en el
  portapapeles de algunos clientes): así el cliente lo toca dos veces y lo copia
  entero, en vez de arrastrar la selección con el dedo y perder un dígito.
- **`business_config.payment_accounts`** (`[{label, value, note}]`, migración
  `20260824120000_payment_accounts`): el dueño las edita en admin → Web del
  cliente → **Datos de pago**. Antes vivían en `PAYMENT_INSTRUCTIONS_NEQUI` /
  `_TRANSFER`, o sea que cambiar de cuenta exigía entrar a Railway y reiniciar.
  Las env vars quedan de **respaldo** si la lista está vacía o la config no
  responde — un pedido sin a dónde pagar es peor que un dato viejo.
- El MISMO texto alimenta el WhatsApp y la pantalla de seguimiento del pedido
  (`web-orders.controller`): si dijeran cuentas distintas, el cliente no sabría
  a cuál transferir.
- ⚠️ El aviso con el costo del domicilio **ya existía**: es el stage
  `payment_instructions`, y en domicilio lo dispara el botón *"Cobrar por
  WhatsApp"* del campo de envío (§7.v24) — no sale al crear el pedido porque
  ahí el total todavía no es real.

### Las 14 alertas al dueño se leen como el mismo remitente
`buildOwnerAlert({businessName, title, body})` (domain) es la **única** forma de
armar una alerta: `[Negocio] *Título*` + línea en blanco + cuerpo. Llegan mezcladas
con los chats personales del dueño; con cada una empezando distinto tenía que
abrirlas para saber si eran del negocio. `businessName()`
(`apps/api/src/common/business-name.ts`) reemplaza las 13 copias de
`process.env.BUSINESS_NAME ?? 'Tercos'`.

Además: un **reembolso** ya no se lee igual que una anulación (`kind: 'refund'`);
la **cortesía** dice quién la dio y cuánto costó (antes era una línea suelta sin
cajero ni valor); el descuadre digital muestra el **nombre** del medio del catálogo
(`Transferencia`) y no el code (`TRANSFER`); y de los mensajes salieron el `Shift:`
en inglés, el id truncado, la ruta `/shifts/<uuid>` y el `p. m..` con doble punto
— al dueño no le sirven y no puede tocarlos. El faltante ahora trae su signo.

---

## 7.v34 El dueño ve lo que hace la cocina (2026-08-24)

> Pedido del dueño: conectar con el trabajo del cocinero — historial de checklist
> por trabajador (qué cumplió y qué no), producción de cada uno, y merma e
> incidencias **con foto**. Verificado: e2e 46 suites / 449, domain 390, admin
> 184, api unit 123, lint 0, typecheck 12/12, build de admin OK.
> Migración: `20260824170000_kitchen_owner_visibility`.

### Lo que era imposible antes (3 fallas de MODELO, no de UI)
1. **El checklist no podía decir qué NO se cumplió.** La rutina solo se guardaba
   completa y con un único autor, así que un día a medias era indistinguible de
   un día en que nadie abrió la app.
2. **Merma e incidencias no tenían foto.** La columna `evidence_key` existía en
   `inventory_movements` pero solo la usaba producción.
3. **`evidenceUrl` estaba atada a producción** (`/subproducts/production/:sourceId/evidence`):
   una merma no tiene `sourceId`, así que su foto no habría tenido cómo servirse.

Y la **Bitácora ignoraba la cocina entera**: su grupo "Cocina" solo tenía el
muerto `KDS_ORDER_DELAYED`.

### Decisiones del dueño (NO re-discutir)
- **Checklist con marca por tarea y autoguardado** (`checklist_marks`): cada
  casilla se guarda al tocarla, con autor y hora. Es lo único que responde
  "quién hizo qué" y "qué faltó".
- **Foto OBLIGATORIA en merma, opcional en incidencia**: en una merma siempre hay
  algo físico que fotografiar; una incidencia puede ser "se fue la luz" y exigir
  foto haría que no se reporte.
- **Las vistas viven en un hub `/cocina` con pestañas**, no en entradas sueltas
  del sidebar ni dentro de Reportes.

### Reglas duras nuevas
- **La foto se sirve por el DUEÑO DEL DATO, nunca por key suelta**:
  `GET /inventory/movements/:id/evidence` y `GET /kitchen/incidents/:id/evidence`.
  Un endpoint que devuelva cualquier key deja el bucket a mano de quien la adivine.
  `POST /kitchen/evidence` sube y devuelve la key; subir y registrar son dos pasos
  para que un reintento del registro (idempotente) no re-suba megas.
- **La cocina achica la foto antes de subir** (1600 px / JPEG 0.8, ~300 KB):
  sin eso R2 se llena con mermas diarias. Si el navegador no puede decodificar
  (HEIC), sube el original — mejor pesado que no poder registrar.
- **`ChecklistDay` es el shape ÚNICO** de una rutina, para hoy y para el
  histórico. `ChecklistToday` se eliminó: dos tipos para lo mismo ya se
  desincronizaron en §7.v31 y §7.v32.
- **Volver a marcar una tarea no cambia el autor** (interesa quién la hizo).
  **Desmarcar después de cerrar reabre la rutina** — si no, el día diría
  "cerrada" con una tarea pendiente.
- **Qué tareas se esperaban un día viejo**: las creadas ese día o antes, activas
  o marcadas ese día. Una tarea desactivada que nunca se marcó queda FUERA: no
  guardamos cuándo se desactivó y contarla inventaría un incumplimiento.
- **Días previos a la migración** se leen desde `checklist_completions.done_item_ids`
  y vienen con `legacy: true`, sin autor por tarea. La UI lo dice, no inventa.
- **La merma del cocinero AHORA se audita** (`KitchenInventoryService`): el log de
  movimientos vive en el controller de inventario, por el que la cocina no pasa,
  así que la merma del admin quedaba en la bitácora y la del cocinero no.

### FIFO: el costo de la merma se indexa por movimiento
`LedgerFifo.wasteCostByMovement` (espeja `cortesiaCostBySource`): la merma se
atribuye a `m.id` y su anulación netea ESE movimiento vía `sourceId`. Se hizo así
—en vez de estimar aparte con `lastUnitCost`— para que el costo de una merma sea
**el mismo número** en el hub y en el P&G. **NO viaja en el seed** a propósito
(son muchas más filas que las cortesías): cubre la ventana replayada, y pedir un
rango anterior al corte ya cae en replay completo por la regla 2 de `CogsService`.

### API nueva (todo `@AdminAccess` salvo lo de la app de cocina)
- `POST /kitchen/evidence` `@KitchenAccess` · `POST /kitchen/checklist/mark` `@KitchenAccess`
- `GET /kitchen/checklist/history?from&to` · `GET /kitchen/productions?from&to&user_id`
  · `GET /kitchen/waste?from&to&user_id` · `GET /kitchen/activity?from&to`
- `GET /inventory/movements/:id/evidence` · `GET /kitchen/incidents/:id/evidence`
- `POST /kitchen/checklist/complete` ya **NO** lleva `doneItemIds` (el server
  tiene las marcas; mandarlas otra vez solo habilita que discrepen).

**La producción se lista por TANDA**, agrupada por `source_id`, acotando primero
los encabezados: limitar sobre el total partiría una tanda al medio (entrada
dentro del tope, consumos afuera).

### UI
- Admin `/cocina`: pestañas **Resumen · Producción · Merma · Checklist ·
  Incidencias · Tareas**, con rango y trabajador en la URL (SSR). Las opciones
  del filtro por persona salen de **quien realmente trabajó** en el rango —
  `/workers/users` filtra por `payType != null` y se saltaría a un cocinero sin
  nómina configurada.
- Un día **sin tareas configuradas no cuenta como rutina incumplida**.
- Cocina: cámara en merma (obligatoria) e incidencias (opcional), con galería
  como respaldo si el permiso de cámara está denegado; checklist con
  autoguardado y reversión si el guardado falla.
- Bitácora: grupo **Cocina** vivo (producción, merma, anulación de merma,
  checklist, incidencias, conteos, tareas). `describeEvent` lee `afterJson` **y**
  `metadata` — los movimientos de inventario auditan en `after` y sin eso media
  cocina salía sin detalle.

### Deuda conocida
- **58 de 133 acciones de auditoría no tienen etiqueta** en `/audit` y se
  muestran con el código crudo (`TREASURY_TRANSFER_CREATED`, …). Las 10 de cocina
  quedaron cubiertas; el resto es deuda vieja de otros dominios y viola §3
  ("nada de nombres de excepción, códigos…").
- `parseDateRange`/`parseLocalDate` se movieron de `reports.controller.ts` a
  `common/local-dates.ts` (su casa documentada) — no volver a duplicarlos.

---

## 7.v35 Sugerencias de compra: llevaban meses muertas (2026-08-25)

> El dueño reportó que "Revisar ahora" desbordaba la pantalla, que no se
> generaban sugerencias y que la IA fallaba. Verificado: typecheck 12/12,
> lint 0, domain 401, admin 198, api unit 123, **e2e 46 suites / 450**,
> más verificación en navegador de las 3 pantallas y del PDF.
> Migración: `20260825120000_purchase_suggestion_units`.

### El escaneo llevaba caído desde §7.v4 y nadie se enteró
`purchase_suggestions` solo acepta **insumo o producto** (CHECK
`chk_purchase_sugg_polymorphic`), pero desde que los subproductos pasaron a ser
stockables con `thresholdMin` propio, el escaneo los recorría igual. Un solo
subproducto bajo mínimo —"Pollo sazonado", −12 de 20— reventaba el `create` y
se llevaba por delante **el escaneo entero**: ni las sugerencias que venían
después, ni la marca de vencidas (que corre al final del bucle). El cron
horario venía fallando cada hora, en silencio, y el botón devolvía 500.

- **Los subproductos se saltan a propósito**: no se compran, se **producen**.
  Su faltante se atiende en Producción, no con un pedido a un proveedor.
- **Un ítem que falla ya no tumba la corrida**: cada registro va en su propio
  try/catch y el resultado reporta `failedCount`. Un escaneo "sin novedad" y
  uno que falló en 3 insumos se veían exactamente igual.

### La cantidad sugerida apuntaba al DOBLE del mínimo
Regla vieja: reponer hasta `2 × mínimo`. Con 21 panes de 30 pedía **4
paquetes**; con 2.500 g de pollo de 3.000, **4 kg**. Regla del dueño: cubrir
**exactamente el faltante**. Ahora con 21 de 30 pide 1 paquete.

- `computeSuggestedPurchase` (`packages/domain/src/purchasing/`, puro, 7 tests)
  es la **única** fuente del cálculo: lo usa el escaneo y lo usa la pantalla
  para explicarlo. Una regla así copiada en los dos lados se separa siempre.
- El faltante se mide en unidad de **stock** (gramos, unidades) y se redondea
  **hacia arriba** a unidad de **compra**: no se compran medios paquetes, y
  quedarse corto dejaría el insumo bajo mínimo apenas llegue el pedido. Ley
  probada: la compra sugerida SIEMPRE alcanza el mínimo.
- ⚠️ Consecuencia aceptada: comprar lo justo deja el inventario **en** el
  mínimo, así que la sugerencia vuelve a aparecer antes que con la regla vieja.
  Es lo pedido; quien compra puede subir la cantidad en el diálogo.

### "2.500 / 3.000" no decía de qué
La sugerencia guardaba la unidad de COMPRA pero no la de **inventario** ni el
factor de conversión, así que la pantalla mostraba números sin unidad y no
podía decir si 4 kg alcanzaban. Columnas nuevas `unit_stock` +
`conversion_factor` (nullable: las sugerencias viejas no lo tienen y no se
puede inventar — caen a la unidad de compra con factor 1).

`CoverageExplainer` lo dice en palabras, en la ficha y en el diálogo del
pedido, recalculándose con la cantidad que quien compra escriba a mano:
*"Hoy tienes −28 unidad (estás debiendo) y el mínimo es 20 unidad. Faltan 48
unidad. Se compra por paquete, y cada paquete trae 12 unidad. Comprando 4
paquete (48 unidad) quedas en 20 unidad: justo el mínimo."*

### El encabezado se partía letra por letra
La columna de acciones de `PageHeader` es `shrink-0`, así que su contenido
define cuánto espacio queda para el título. `RunActionsBar` metía ahí el
mensaje de resultado sin ancho máximo y el título quedaba en una letra por
línea. El mensaje ahora va **acotado** (`max-w-xs`) y debajo de los botones.
De paso: **una acción a la vez** — antes el verde de una acción convivía con
el rojo de otra porque el error no limpiaba el mensaje anterior.

### El resumen por WhatsApp decía que había enviado
`sendSummaryToAdmins` llamaba `sendText` sin mirar `delivers`: con el mock de
dev devolvía `ok:true` y la pantalla afirmaba "Enviado a 2 destinatarios" sin
que saliera un solo mensaje. Mismo patrón que se cerró en §7.v22 — ahora sale
temprano y reporta `skipped · no hay WhatsApp conectado en el servidor`.

### La IA fallaba sin decir por qué
`evaluateAllPending` se tragaba la excepción y devolvía "3 fallaron". El motivo
casi siempre es el mismo para todas y es accionable (no hay llave, se acabó el
saldo, no hay conexión): ahora viaja en `errors[]`, traducido a español por
`describeEvalFailure`. **La llave y el modelo del código están bien**
(`claude-haiku-4-5`, verificado contra la API real); si falla en producción es
`ANTHROPIC_API_KEY` en Railway.

### Segunda pasada de auditoría (mismo día): 15 defectos más

- **Resolver una sugerencia no servía de nada.** El dedupe del escaneo solo
  miraba las abiertas, así que aceptar ("ya se lo pedí al proveedor") o
  rechazar ("no lo voy a comprar") duraba hasta el escaneo siguiente: el stock
  seguía bajo —obvio, el pedido no ha llegado— y la volvía a crear. Ahora hay
  ventana de re-pregunta: **48 h tras aceptar** (a esa altura llegó, y el stock
  subió, o el proveedor incumplió) y **24 h tras rechazar** (la razón para no
  comprar suele vencerse). Con test de regresión para los dos casos.
- **Resolver no era atómico**: dos personas a la vez dejaban un ACEPTADA *y* un
  RECHAZADA en la bitácora para la misma sugerencia. Ahora es claim
  condicionado por estado (`updateMany` + `count === 1`), como el resto del
  repo.
- **El prompt del LLM mentía**: decía "refill a 2× threshold" cuando la regla
  ya era cubrir el faltante, y le pasaba `'unidad receta'` fija en vez de la
  unidad real, así que el modelo no podía distinguir 2.500 g de 2.500 kg ni
  cruzarlo con el histórico de compras. Además el prompt tenía "threshold" cinco
  veces y esa palabra se colaba al análisis que se muestra en pantalla.
- **El PDF le mostraba al proveedor lo que nos cobró su competencia.**
  `estUnitCost` sale de la última factura, sea de quien sea, y el papel se le
  entrega a quien le estás comprando — justo lo que §7.v19 prohíbe en el
  mensaje. El costo pasó a ser **opcional y apagado por defecto**, con el aviso
  de que es interno.
- **Un escaneo omitido se reportaba como exitoso**: al tocar "Revisar ahora"
  mientras corría el automático, el guard devolvía todo en cero y la pantalla
  pintaba en verde "0 revisados · 0 nuevas". Ahora el resultado lleva `skipped`
  y lo dice.
- **La pantalla llamaba "hoy" a una foto vieja.** Las existencias son del
  momento de la detección; entre medias se vendió y se produjo. Decía "Hoy
  tienes 2.500 g" sobre un dato de hace horas, justo donde se decide cuánto
  pedir. Ahora dice "Al detectarla había…", muestra la fecha de la toma y avisa
  cuando ya pasaron horas.
- **Tras pedir por WhatsApp la pantalla seguía en "Pendiente"** (`useState`
  ignora el prop que trae `router.refresh`), así que dejaba rechazar lo ya
  aceptado y volver a mandar el mismo pedido. Ahora toma la sugerencia que
  devuelve el endpoint.
- **El chat podía decir una cantidad y el registro otra**: la vista previa se
  rearma con 350 ms de retraso y el botón abría el link viejo con el valor
  nuevo. Ahora no se puede abrir mientras el texto se recalcula.
- **El precio del proveedor estaba rotulado con la unidad equivocada**:
  `lastUnitPrice` es por la unidad de la FACTURA, no por la de compra — una
  arroba a $200.000 se leía "$200.000 / kg". Se quitó el rótulo.
- **Errores en inglés con estado interno y UUID en pantalla**: `Suggestion
  already resolved (status=ACCEPTED)`, `Suggestion 8f3a-… not found`.
  Traducidos, y el detalle pasa por `getErrorMessage` como el resto.
- **`API 500` llegaba a la pantalla**: `mensajeDeError` no reconocía como
  técnico el texto de respaldo de `ApiError`. Regla agregada, con test.
- La **evaluación en lote** hacía N llamadas al modelo en serie dentro de una
  request (60 pendientes = minutos, el navegador cortaba y quien mirara volvía
  a tocar el botón mientras el servidor seguía gastando). Tope de 25 por
  corrida, **diciendo** cuántas quedaron. Y un fallo de negocio ya no se le
  achaca a la IA.
- El **resumen por WhatsApp** no tenía tope: con muchas sugerencias abiertas el
  mensaje se pasa del largo máximo y falla entero. Se acota a 40 líneas y dice
  cuántas quedaron fuera; el total sigue sumando todas.
- **"No hay sugerencias abiertas" se decía cuando sí las había** y lo que
  faltaba era a quién avisarle (ningún dueño o admin activo con teléfono).
- **`?limit=-3`** llegaba a Prisma como paginación hacia atrás y devolvía las 3
  más VIEJAS, sin error. Y un filtro de estado inexistente devolvía lista vacía,
  indistinguible de "no hay nada pendiente".
- **"Stock se repuso (auto-stale)"** también se escribía cuando el insumo se
  había desactivado o le habían puesto el mínimo en 0. Nota corregida: afirmar
  que se repuso falseaba el historial.

### El error de IA que reportó el dueño era de ENTORNO, no de código
`ANTHROPIC_API_KEY` **no está configurada en Railway** (ni en qa ni en
production). Por eso fallaban las dos cosas: la extracción de facturas y la
evaluación de sugerencias. La llave del `.env` local se probó contra la API real
y funciona; `claude-haiku-4-5` es el modelo correcto y **no existe un "Haiku 5"**
(el listado de la API lo confirma: Opus 5, Sonnet 5, Fable 5 y Haiku 4.5).

⚠️ El `.env` llega al proceso **solo como efecto colateral de importar
`@prisma/client`** — no hay carga explícita de variables en `main.ts`. En
Railway no importa (las inyecta la plataforma), pero explica por qué "está en
el .env" y "el proceso la ve" no son lo mismo.

De paso, el mensaje que llegaba a la pantalla era `No LLM provider configured.
Set ANTHROPIC_API_KEY or OPENAI_API_KEY` — inglés y nombres de variables de
entorno, contra §3. Ahora hay un traductor único
(`adapters/llm/llm-failure.ts`) que usan facturas y sugerencias; el texto crudo
va al log, que es donde sirve.

### PDF de la orden de compra
`renderPurchaseOrderHtml` (domain, puro, 4 tests) → el navegador ofrece
"Guardar como PDF". **Sin librería de PDF**: el navegador ya lo hace y jsPDF o
puppeteer serían cientos de KB (o un binario) por un documento de una página.
Es el mismo camino del recibo del POS.

- El documento lo arma el **servidor** junto al mensaje de WhatsApp: la
  dirección y el teléfono del negocio viven en la configuración, y armarlos por
  separado terminaría diciendo dos cosas distintas.
- Lleva la equivalencia ("4 paquete = 48 unidad") y rotula el costo como **de
  referencia interna, no un precio acordado** — el mensaje al proveedor sigue
  sin hablar de precios (§7.v19).
- **Imprimir NO resuelve la sugerencia**: sacar el papel no es haber pedido.
- ⚠️ `window.open` va **sin `noopener`**: con esa bandera devuelve `null` y la
  pestaña abre en blanco. Acá no hace falta — el contenido lo generamos
  nosotros.


## 7.v36 Biblia de capacitación: la guía vive dentro del admin (2026-08-25)

> Pedido del dueño: una guía de la plataforma que explique **cada módulo** y el
> paso a paso de cada procedimiento, visible para todos los usuarios.
> Verificado: typecheck 12/12, lint 0, unit admin 208 (+10), build del admin OK,
> anclas y buscador probados en navegador. Sin migración, sin backend.

### Qué es
`/guia` en `apps/admin` — **12 capítulos, 80 temas**. Cubre las 5 pantallas
(caja, gestión, cocina, web del cliente, TV), todos los módulos y un capítulo
final de **reglas de oro** con las decisiones de fondo que explican por qué los
números son como son (domicilio fuera de todo total, nada cuesta cero,
insert-only, día de negocio a las 4 am, avisos manuales por WhatsApp).

Cada tema trae: a quién le sirve (Caja/Cocina/Dueño), **dónde está en la app**,
el paso a paso y —cuando no es evidente— **por qué** es así. Los avisos se
distinguen a propósito: `Regla` (romperla descuadra los números), `Ojo` (cuesta
plata o deja rastro imborrable) y `Dato`.

### Decisiones (NO re-discutir)
- **Todos ven todo.** El item del menú NO lleva `onlyDueno`/`onlyOperativo`: un
  operativo lee el capítulo de finanzas aunque no entre a esa pantalla. Sirve
  para entrenar a alguien que va a rotar de puesto.
- **El contenido es DATO TIPADO en el repo** (`features/guia/content/*.ts`), no
  filas en la base: se versiona con git, se revisa en el PR y no se
  desincroniza en silencio. Nadie lo edita desde la app. El `switch` del
  renderer es exhaustivo — agregar un tipo de bloque rompe la compilación hasta
  cubrirlo.
- **Los `id` de sección son la URL** (`/guia/<cap>#<id>`). Cambiarlos rompe los
  enlaces que la gente guardó.

### Dos cosas que hubo que arreglar para que sirviera
- **Las anclas no saltaban**: el contenedor con scroll es el `main` del shell
  (no el documento) y la página llega en streaming, así que cuando el navegador
  intenta el salto la sección todavía no existe — y no reintenta. Un resultado
  del buscador aterrizaba al principio del capítulo, con la sección **5.574 px
  más abajo**. Lo cierra `HashScroller` (reintenta por frames hasta que monta).
  El offset bajo la barra lo pone `scroll-mt-24` en cada sección.
- **El buscador ordenaba mal**: con AND puro, "cerrar caja" ponía primero
  secciones que mencionan las dos palabras de pasada y dejaba *Cerrar el turno*
  en sexto lugar. `searchSections` (puro, 10 tests) pesa **dónde** cae cada
  palabra: título > resumen > cuerpo, con premio a la frase completa.

### Deuda conocida — CERRADA en §7.v37
- El cocinero no podía abrirla (`ADMIN_ALLOWED_ROLES` no lo incluye). Se cerró
  moviendo el contenido a `packages/guia` y montando `/guia` también en
  `apps/cocina`, filtrado por audiencia.

## 7.v37 La cocina se usa con el pulgar: guía propia y UI de celular (2026-08-25)

> Dos pedidos del dueño en modo ensayo: la guía en la app del cocinero, y que la
> cocina sea cómoda de verdad. **El dispositivo es CELULAR** (dato del dueño),
> no tableta. Verificado en Chromium a 390×844: typecheck 13/13, lint 0,
> unit 11/11 paquetes (cocina 43, +11), e2e 46 suites/472. Sin migración.

### El contenido de la guía se mudó a `packages/guia`
No es del admin ni de la cocina: el admin muestra los 12 capítulos y la cocina
filtra los que le tocan al cocinero (**10 temas de 80**, en 4 capítulos). El
modelo de contenido ya declaraba `audience` por sección, así que `chaptersFor`
poda cada capítulo y la guía de cocina queda al día sola cuando el contenido
crece. Ponerlo en `domain` (lógica pura) o en `ui` (componentes) lo habría
escondido donde nadie lo busca.

### Cinco arreglos de UI, medidos y no opinados
Auditoría con Playwright a 390 px contando cada control por debajo de 44 px
(el mínimo que §7.v18 ya había fijado para web y caja — **a cocina solo le
habían revisado el desbordamiento, nunca los toques**): de 7 a 17 controles
chicos por pantalla a **cero**.

1. **La nav medía 20 px.** Bug real, no preferencia: `CocinaNav` usa
   `h-full items-stretch` y el contenedor móvil no tenía altura, así que cada
   pestaña colapsaba al alto del ícono.
2. **La nav pasa ABAJO en celular** (`CocinaTabBar`, 56 px, con safe-area).
   En 844 px de alto el pulgar no llega arriba sin recolocar la mano, y en la
   cocina se navega con una mano. En `sm+` sigue arriba.
3. **Las pestañas ahora dicen su nombre.** Eran cinco íconos sin etiqueta
   (`hidden md:inline`) justo en el único dispositivo que se usa.
4. **Marcar un ítem del checklist tenía 17 px de área** (la etiqueta del
   `Checkbox`), para la acción que más se repite en la app. Ahora la fila entera
   es el botón, 56 px, con la marca a 28 px.
5. **Stock negativo se veía igual que "Bajo"** (ámbar), y decía "−28 porc.",
   que no significa nada. Ahora es "Sin cuadrar" en rojo, sin porciones, y con
   el consejo que corresponde: a un insumo le falta la COMPRA, a un subproducto
   le falta registrar la PRODUCCIÓN. `stock-state.ts` es puro y tiene 11 tests.

### Regla que queda
- **44 px es el piso de toque en cocina**, como en web y caja. El único control
  por debajo es el `input[type=file]` de la foto, que es `sr-only` a propósito
  (se toca el botón "Tomar foto").
- El `Input` compartido mide 40 px: en cocina los buscadores lo suben a 44 con
  `className="h-11"` en vez de tocar `packages/ui`, que usan las cinco apps.

## 7.v37 Lista de faltantes: la hoja con la que se sale a comprar (2026-08-26)

> Pedido del dueño: además de las sugerencias automáticas, poder armar A MANO
> el pedido —viendo existencias y mínimos—, que la IA revise si las cantidades
> alcanzan, y sacar el PDF. Verificado: typecheck 12/12, lint 0, domain 419,
> types 168, ui 138, admin 208, api unit 126, **e2e 47 suites / 484**,
> 8 builds, más verificación en navegador del flujo completo y del PDF.
> Migración: `20260826040000_purchase_lists`.

### Por qué un módulo aparte y no una variante de las sugerencias
Una sugerencia es UN ítem que el sistema detectó solo; una lista es un
DOCUMENTO con varios ítems que arma una persona y se lleva al mercado. Meterlas
en la misma tabla obligaba a inventar un estado por renglón y a partir el PDF
en pedazos. Comparten lo que de verdad es común: `computeSuggestedPurchase`
(cuánto falta) y el renderizador de la orden al proveedor.

### Decisiones del dueño (NO re-discutir)
- **Se guarda con historial**: quién la armó, cuándo, qué pidió y en qué quedó.
  Repetir el pedido de la semana pasada es la mitad del valor.
- **Admin y dueño solamente**: muestra costos y total, que no van a roles
  operativos. Verificado con un test: el cocinero recibe 403.
- **Dos papeles**: el general (interno, con costos, existencias y mínimo) y uno
  por proveedor (solo lo suyo, **sin precios**).
- **La IA revisa UNA cosa**: si las cantidades alcanzan o se va a quedar corto.
  De precios y proveedores ya opina la evaluación de las sugerencias.

### Reglas duras
- **La lista nace llena.** El botón principal la crea con todo lo que está bajo
  el mínimo y la cantidad que hace falta; quien compra ajusta. Teclear desde
  cero es donde se olvidan cosas.
- **Un ítem no se repite en una lista**: índice único en la DB, y agregar dos
  veces el mismo insumo ACTUALIZA la cantidad en vez de crear otro renglón.
  Dos renglones del mismo pan hacen comprar el doble sin que nadie lo note.
- **Los subproductos no entran**: se producen, no se compran (la misma razón
  por la que reventaban el escaneo de sugerencias, §7.v35).
- **Snapshot de unidades y existencias** en cada renglón: el papel tiene que
  seguir diciendo lo mismo dentro de un mes, aunque el insumo cambie de unidad
  o de umbral.
- **El total suma SOLO lo que tiene costo conocido** y reporta aparte cuántos
  quedaron fuera. Rellenar los desconocidos con 0 daría un total que se lee
  como completo y es menor al que se va a pagar.
- **El papel del proveedor NO lleva precios** (§7.v19). Y no es solo la regla:
  `lastUnitCost` sale de la ÚLTIMA factura, sea de quien sea, así que
  imprimirlo puede entregarle a un proveedor el precio de su competencia.
- **Cerrada = pedida**: deja de editarse y queda como historial. El cierre es
  un claim condicionado por estado — dos personas cerrando a la vez no
  duplican bitácora.

### Qué hace útil la revisión con IA
El dato que la vuelve algo más que aritmética es el **consumo real de los
últimos 30 días**, que sale de los movimientos de inventario (solo los deltas
negativos: una compra no es consumo). Con eso responde cosas como *"Pan va a
quedar en 1.160 unidades, muy por encima del mínimo de 20 y del consumo mensual
de 52: estás comprando de más"*. Sin ese dato solo podría repetir la cuenta del
mínimo, que la pantalla ya muestra.

### La pantalla dice en cuánto queda el inventario
Cada renglón muestra existencias, mínimo, cuánto comprar y **en cuánto queda si
compras eso** — recalculado con lo TECLEADO, no con lo guardado, y en rojo si
no alcanza el mínimo. Elegir una cantidad sin ver el efecto es teclear a ciegas.

### Superficie
- **API** `purchase-lists` (`@AdminAccess`): CRUD de listas e ítems,
  `GET /candidates` (catálogo comprable con faltante), `/document` y
  `/document/supplier`, `/suppliers`, `/review`, `/close`.
- **Domain**: `renderShortageListHtml` (papel interno, agrupa por proveedor
  cuando hay más de uno) + `doc-shared.ts` con los estilos y helpers que
  comparte con la orden al proveedor — dos hojas de estilo se separan al primer
  retoque.
- **Admin**: `/purchase-lists` y `/purchase-lists/[id]`, sidebar en Compras.


## 8. Estado del proyecto (commits y FASES)

### Commits en `main` (base v1, 92 commits) + rama v2

> La rama activa es `chore/remove-turnero-kds` (eliminación turnero/KDS §7.v10, ~170 commits sobre `main`, aún sin mergear — el rollback es de toda la rama, no de un commit). La rama de la reorientación v2 fue `refactor/v2-reorientacion`. Los commits de `main` son historial válido de FASES 0-15. Los commits v2 están documentados en sec 7.v2.

### Commits en `main` (92, base v1)

```
8a51792 docs: FASE 15.E checklist deploy v1 (Railway + Vercel + Pi + DNS)
b682f88 feat(pwa): FASE 15.D PWA en POS y KDS — manifest + service worker offline
61b7e4e feat(printer,print-agent): FASE 15.C ESC/POS + Print Agent local
949b0ed feat(storage): FASE 15.B R2StorageAdapter para producción
e88b464 chore(api,domain): FASE 15.A hardening — alerta descuadre + sweep huérfanos
d46dbb5 docs(claude): FASE 14.F cierre — RRHH + persistencia + Vitest + cleanup
2ead261 chore(domain,reports): FASE 14.E Vitest formal + costo TopProducts recursivo
13e0d67 feat(reports): FASE 14.D persistencia de reconciliation reports
a86541f feat(admin): FASE 14.C UI /workers — asistencia + comisiones + payroll
6302fca feat(workers): FASE 14.B schema RRHH + endpoints attendance/commission/payroll
d30f83a chore(web-orders): FASE 14.A cleanup deprecated mark-paid + customerPaidAt
5c8e93e docs(claude): FASE 13.F cierre — Reportes y Dashboard
b2ffa61 feat(admin): FASE 13.E UI /reports/operations + sección Reportes en sidebar
806d55a feat(admin): FASE 13.D UI /reports/products — top productos con márgenes
02cccba feat(admin): FASE 13.C UI /reports/sales — serie + breakdowns
1bfc4fc feat(admin): FASE 13.B dashboard home con resumen del día
8707725 feat(reports): FASE 13.A backend — sales/products/heatmap/whatsapp/IA + dashboard
cbc9ddf docs(claude): FASE 9.E cierre — wa.me semi-automático completo
44ed21b feat(kds,web): FASE 9.D KDS abre wa.me al "Marcar listo" + remueve "Ya pagué"
990c9a3 feat(pos): FASE 9.C drawer pedidos web con "Aceptar y contactar" (wa.me)
1bba4ea feat(sales): FASE 9.B endpoint /sales/:id/whatsapp-clicked (audit-only)
ee4a9f3 feat(domain): FASE 9.A wa.me builders puros + audit action
ad34d2f docs(claude): FASE 12.F cierre — FASE 8 + FASE 12 + WhatsApp wa.me + pendientes-externos
2cdf7f6 feat(admin): FASE 12.E UI sugerencias de compra
626adbb feat(purchase-suggestions): FASE 12.D LLM evalúa sugerencias
44ba01b feat(purchase-suggestions): FASE 12.C scan horario + accept/reject
a770e67 feat(admin): FASE 12.B UI promociones — lista + crear con campos por tipo
18bada3 feat(promotions): FASE 12.B schema + Zod superRefine para 4 tipos de promo
6c15d38 feat(domain): FASE 12.A motor de promociones extendido (BOGO + FIXED_OFF + COMBO_OFF)
417204d feat(web): FASE 8.B checkout con autocomplete Mapbox + bloqueo 3km
0a4b09a feat(maps,web-orders): FASE 8.A backend Mapbox + haversine + 3km validation
561ae13 docs(claude): cierre FASE 4 ajustes + FASE 11 + roadmap actualizado
fc0c9d3 feat(admin): FASE 4 ajustes 2.16 sidebar con iconos lucide-react
788717d feat(reports): FASE 11.E reconciliación CSV pagos digitales (stateless MVP)
6abe877 feat(reports): FASE 11.D anomalías por cajero (2σ histórico personal)
fac3d25 feat(approvals,pos): FASE 11.C cambiar propio PIN (Admin + Dueño)
0e0b05c feat(pos,admin): FASE 11.B UI cierre de turno + admin /shifts list
162bd19 feat(shifts): FASE 11.A backend cierre de turno + Z-report + descuadre
7ddffe2 chore(admin): FASE 4 ajustes 2.13 + 2.14 + 2.15 — pulido (margin + format helpers + drop fetch)
b01b8fb feat(invoices,inventory): FASE 4 ajustes 2.6 + 2.9 + 2.11 — movements + foto + unit warning
10524ac feat(suppliers): FASE 4 ajustes 2.7 + 2.8 — supplier polimórfico + detalle con histórico
1c5a8cd feat(invoices): FASE 4 ajustes 2.10 — eliminar borradores PENDING_REVIEW
813539f fix(invoices,audit): FASE 4 ajustes 2.5 + 2.12 — audit actions específicos + cloneFrom valida items
bc77a6b feat(domain,api,admin): FASE 4 ajustes 2.2 — computeComboCost + ingredient.lastUnitCost
3801874 feat(products): FASE 4 ajustes 2.1 — ProductForm soporta direct-resale full
4439647 fix(invoices): FASE 4 ajustes 2.3 + 2.4 — confirm valida totals match + iva ≤ total
858cb50 feat(pos): FASE 7.E drawer pedidos web pendientes + confirm modal
18c928c feat(web): FASE 7.D checkout 1-página + status poller + mark-paid
37165ea feat(web): FASE 7.C apps/web menú + carrito localStorage
8577bf6 feat(web-orders): FASE 7.B PosGateway WS para notificar al POS
cecbe6d feat(web-orders): FASE 7.A backend pedidos web públicos + web menu
7ed3c09 docs(claude): cierre FASE 6 + roadmap a FASE 7
2434523 feat(public-display): FASE 6.D apps/public-display SSE kiosko
83c186e feat(kds): FASE 6.C apps/kds UI con WS auto-reconnect
67dd921 feat(public-display): FASE 6.B SSE pantalla pública
1b06ffd feat(kds): FASE 6.A backend KDS gateway + transitions
90fa22a docs(claude): cierre FASE 5.E + roadmap a FASE 6
de44062 feat(pos): FASE 5.E.7 anular venta con X-Approval-Pin
257b035 feat(pos): FASE 5.E.6 post-pago print recibo + abrir cajón
b1a862e feat(pos): FASE 5.E.5 cobro CASH + digital con doble validación
0086173 feat(pos): FASE 5.E.4 carrito Zustand + totales con promos vivas
04710e7 feat(pos): FASE 5.E.3 catalog grid + size/modifier picker
c8193df feat(pos): FASE 5.E.2 shift gate + apertura turno
10b28f2 feat(pos): FASE 5.E.1 scaffold POS app + auth middleware + role guard
7407092 docs: add roadmap exhaustivo Sprint 5.E + FASES 6-15
ff462c5 feat(printer,cash-drawer): FASE 5.D adapters + receipt HTML rendering
98265e1 feat(promotions,sales): FASE 5.C engine + crons + receipt-gap detection
72d9138 feat(sales,approvals,shifts): FASE 5.B sales backend module + e2e verified
23bbd8a feat(sales,shifts,promotions): FASE 5.A schema + types foundation
0fdb864 docs: add FASE 4 ajustes pendientes (18 áreas, 6 sprints)
1ead706 docs(claude): mark FASE 4 fully closed in canonical state file
8335471 feat(invoices): from-clone endpoint + resume drafts UI (closes FASE 4)
848f215 feat(admin): show lastUnitCost + margin for direct-resale products
223905f feat(admin): suppliers CRUD UI (closes FASE 4 pendiente)
2f1f4ab fix(invoices): track cost vs sale price separately on direct-resale products
bddb87d refactor(inventory,invoices): polymorphic stockables (Insumo + Producto direct-resale)
b80d4d4 feat(admin): invoice upload + edit modal + confirm flow (FASE 4 UI)
f308739 fix(invoices): detect image MIME from magic bytes, not declared header
d8bcf74 feat(invoices): suppliers + IA invoice extraction (FASE 4 backend)
fab5001 docs: testing guide for FASE 0-3
041438e feat(admin): inventory + audit UI (FASE 3.6-3.8)
a4903ce feat(inventory,audit): movements ledger + audit log backend (FASE 3.1-3.5)
776fb6e feat(admin): recipe editor + expanded-cost view (FASE 2.6)
a496ae9 feat(admin): subproducts + products CRUD UI (FASE 2.5 + 2.7)
6ae8dfc feat(admin): shell layout + ingredients CRUD UI (FASE 2.8)
f73e45b feat(catalog): CRUD + recipes + expandRecipe (FASE 2.3-2.4-2.9)
3baf3f4 feat(catalog): Prisma schema + migration for products/recipes (FASE 2.1-2.2)
7530eda feat(auth-fe): login UI in @pos-tercos/ui + Next middleware role guard
9a6aff6 feat(auth): JWT auth + roles backend (FASE 1.1-1.7)
455df52 chore: install 3 Claude Code skills + lock anti-spaghetti rules
b3593e7 feat(ui,lint): shadcn-compat Button in packages/ui + ESLint 9 flat config
dfb72cb feat(apps): scaffold 6 Next.js placeholder frontends
bbf3105 feat(api): NestJS app with Prisma + Postgres healthz
e8b3743 chore: initial monorepo scaffold
```

### FASE 0 — Setup base · ✅ COMPLETADA
Monorepo, Postgres docker, Next.js placeholders, packages/types/domain/ui, ESLint 9, repo GitHub privado.

### FASE 1 — Auth y roles · ✅ COMPLETADA
Schema users + refresh_tokens, JWT 15min/7d con rotación, guards globales, decoradores `@Public/@Roles/@OnlyDueno/@AdminAccess/@CashierAccess/@CurrentUser`, seed 6 users (`dev12345`), LoginForm en `@pos-tercos/ui`, middleware Next Edge con `jose`, cableado en admin.

### FASE 2 — Catálogo + recetas · ✅ COMPLETADA
Schema 11 CHECK constraints, CRUD ingredients/subproducts/products, recipe tree polimórfico, `expandRecipe` puro con cycle detection, UI admin completo (lista + form + editor de receta + expanded-cost view).

### FASE 3 — Inventario + audit · ✅ COMPLETADA
Schema insert-only via trigger, CRUD movements polimórficos, alerta lowStock, AuditService global integrado en Auth + Inventory, UI `/inventory`, `/inventory/movements`, `/inventory/[type]/[id]/adjust`, `/audit`.

### FASE 4 — Proveedores + IA Facturas · ✅ COMPLETADA

- [x] 4.1 Schema suppliers/supplier_products/invoices/invoice_items + InvoiceStatus
- [x] 4.2 Suppliers CRUD backend
- [x] 4.3-4.6 Adapter LLM (interface en domain, impls Anthropic + OpenAI, strategy primary+fallback)
- [x] 4.7 StorageProvider + LocalFilesystemStorageAdapter
- [x] 4.8 `POST /invoices/upload-photo` (Multer + mime magic-byte) → LLM → draft
- [x] 4.9 `POST /invoices/from-clone` — clona factura CONFIRMED como draft PENDING_REVIEW para entrada manual rápida (factura recurrente o cuando IA falla)
- [x] 4.10 UI uploader + InvoiceConfirmModal + InvoiceItemRow
- [x] 4.11 `POST /invoices/:id/confirm` atómico polimórfico
- [x] 4.12 UI histórico (`/invoices`, `/invoices/[id]`)
- [x] UI dedicada `/suppliers` (lista + new + [id] siguiendo patrón ingredients)
- [x] **REFACTOR polimorfismo**: invoices ahora aceptan INGREDIENT o PRODUCT direct-resale (no solo insumos)
- [x] **FIX cost vs sale**: `Product.lastUnitCost` (auto desde facturas) ≠ `Product.basePrice` (venta), banner explicativo + cálculo de margen
- [x] **UI lastUnitCost + margen**: columnas en `ProductsTable` + `CostInfoPanel` read-only en `ProductForm` con margen vivo (badge tonal por threshold)
- [x] **Resume drafts**: ruta `/invoices/[id]/edit` reutiliza el modal con selecciones pre-resueltas desde `invoice.items`. Cubre clones + drafts de upload sin confirmar. `GET /invoices/:id/raw-extraction` expuesto para SSR.

**Llaves LLM:** `apps/api/.env` → `ANTHROPIC_API_KEY=sk-ant-...`. OpenAI fallback opcional (`OPENAI_API_KEY=sk-...`). `LLM_PROVIDER` controla preferencia (`anthropic` default).

### FASE 5 — POS Cajero base · ✅ COMPLETADA

Particionada en 5 sub-sprints (5.A → 5.E). Plan completo en `fase5e-y-pendientes.md`.

- [x] **5.A — Schema + types** (commit `23bbd8a`):
  - 8 modelos Prisma nuevos: `Sale`, `SaleItem`, `SaleStatusLog`, `Shift`, `Promotion`, `PromotionProduct`, `IdempotencyKey`, `ApprovalPin`
  - 5 enums nuevos: `SaleType`, `SaleStatus`, `PaymentMethod`, `ShiftStatus`, `PromotionType`
  - Migration con sequence `receipt_seq`, 18 CHECK constraints, trigger insert-only en `sale_status_log`, trigger role check en `approval_pins`
  - 12/12 SQL constraint tests pasan
  - Types Zod completos + `AuditActionEnum` extendido
- [x] **5.B — Sales backend module + shifts open + approvals**:
  - `IdempotencyService` (@Global) con `findCached` + `cache` + `purgeExpired` (cron en 5.C)
  - `ApprovalsService` (@Global) con bcrypt PIN hash + verify (timing-safe sweep) + endpoint `POST /approvals/pin` (Dueño-only)
  - `SalesService.create` consume `nextval('receipt_seq')` por `$queryRaw` (Prisma drift detector incompatible con `dbgenerated`)
  - `SalesService.confirmPayment` descuenta stock al cobrar (NO al crear): `directResale` → movement directo; producto con receta → `expandRecipe` → movements polimórficos por insumo
  - `SalesService.void` con `X-Approval-Pin` obligatorio + reverso de movements compensatorios si sale ya estaba PAGADO
  - `ShiftsService.open` (1 OPEN por cajero, ConflictException si ya hay) + `getCurrent` + `getById` + `list`
  - 7 endpoints sales (`POST /sales`, `confirm-payment`, `void`, `GET /sales`, `GET /:id`, `GET /:id/status-log`) + 4 endpoints shifts + 1 endpoint approvals
  - **E2E smoke test (15+ casos)**: idempotency hit, expandRecipe matemáticamente correcto (Pollo -150.3759g, Sal -0.7519g), digital double verification para NEQUI, void post-PAGADO revierte stock, audit log con SALE_CREATED/SALE_PAID/SALE_VOIDED/APPROVAL_GRANTED/APPROVAL_DENIED/IDEMPOTENCY_HIT
- [x] **5.D — Print + Cash Drawer adapters**:
  - Interfaces `PrinterProvider`, `CashDrawerProvider`, `ReceiptData`, `PrintResult`, `DrawerOpenResult` en `@pos-tercos/domain/printer/`
  - Función pura `renderReceiptHtml(receipt)` → HTML 80mm-friendly con CSS embebido (page-size 80mm para impresoras térmicas), banner DUPLICADO en reimpresiones, branding del negocio desde env vars con fallbacks
  - `LocalFsPrinterAdapter` guarda HTML en `./tmp/receipts/receipt-{N}.html` (1ra) o `receipt-{N}-rep-{ts}.html` (reimpresiones, no pisa el original — auditable)
  - `LogCashDrawerAdapter` loggea apertura (level=log si con sale, level=warn si no-sale)
  - `PrinterModule` y `CashDrawerModule` (@Global) con tokens DI `PRINTER_PROVIDER`, `CASH_DRAWER_PROVIDER` (pattern idéntico a `STORAGE_PROVIDER`)
  - Endpoints nuevos en `SalesController`:
    - `POST /sales/:id/print` — retorna `text/html` directo (con `@Res()`), audit `RECEIPT_PRINTED` la 1ra vez, `RECEIPT_REPRINTED` siguientes
    - `POST /sales/:id/open-drawer` — apertura normal post-pago, audit `CASH_DRAWER_OPENED`
    - `POST /sales/open-drawer/no-sale` — requiere `X-Approval-Pin` + reason ≥ 5 chars, audit `CASH_DRAWER_OPENED_NO_SALE` + `APPROVAL_GRANTED`
  - **E2E smoke test (15 casos verificados)**: HTML válido en wire (Content-Type text/html), banner DUPLICADO presente en reimpresiones, archivos correctos en disco (original + 2 reprints con sufijos timestamp), drawer falla con sale PENDIENTE_PAGO, drawer ok post-payment, no-sale sin PIN → 403, no-sale con PIN incorrecto → 403 + APPROVAL_DENIED audit, no-sale con PIN correcto → CASH_DRAWER_OPENED_NO_SALE + APPROVAL_GRANTED audit, totales del recibo coinciden ($9.450 con discount $1.050 sobre Coca-Cola × 3)
  - **Print Agent local** (apps/print-agent en :9100) **diferido a FASE 15**: no aporta valor en modo mock, solo será necesario cuando entre la impresora física Epson TM-T20III. El POS (5.E) abrirá el HTML directamente en el browser via `window.open(blob)`.
- [x] **5.C — Promotions engine + crons**:
  - Motor puro en `@pos-tercos/domain/promotions/apply-promotions.ts` con tipos en `types.ts`. API: `applyPromotion(input, activePromotions)` retorna `{appliedPromotionId, lineDiscount}`. Reglas: matching por `(productId, day-of-week mask, time window con cross-midnight, active date range)`; mayor `discountPct` gana; tiebreaker estable por `id`; NO acumulables.
  - PromotionsModule en API: CRUD endpoints (`GET/POST/PATCH/DELETE /promotions`, list + getById accesibles para Cajero por tachado de precios en POS; writes solo Admin/Dueño). `loadActiveAt(at)` pre-filtra por `is_active=true` + rango de fechas; el motor de domain hace el match fino.
  - SalesService.create ahora consume el engine real (stub eliminado).
  - `@nestjs/schedule` agregado. ScheduleModule.forRoot() en app.module.
  - Cron `IdempotencyService.purgeExpired` corre 3:00 AM diario.
  - `ReceiptIntegrityService.detectGaps` corre 4:00 AM diario; calcula `(MAX - MIN + 1) - COUNT(*)`; si gap > 0, audit `RECEIPT_GAP_DETECTED`. Endpoint `POST /sales/admin/check-receipt-gaps` (Dueño-only) para chequeo on-demand.
  - **E2E smoke test (12 casos verificados)**: 2 promos overlapping (20% gana sobre 10% — discount exacto $700/$3500), promo fuera de ventana horaria NO aplica, soft delete con `isActive=false`, audit log completo con `PROMOTION_CREATED` × 3 + `PROMOTION_DEACTIVATED`, receipt-gap detector gap=0 con 5 sales contiguos.
- [x] **5.E — apps/pos UI** (commits `10b28f2` → `de44062`):
  - **5.E.1 scaffold** (`10b28f2`): `apps/pos` deps (jose, zod, @pos-tercos/domain, zustand viene en 5.E.4), `next.config.ts` rewrite `/api/* → :3001`, `middleware.ts` Edge con `jose` (cookie `pos_access` → JWT verify → role check), `POS_ALLOWED_ROLES = [CAJERO, ADMIN_OPERATIVO, DUENO]`, `features/auth` replicado de admin (login + me + logout + server.ts SSR + LogoutButton), `/login` reusa `LoginForm` de `@pos-tercos/ui`, `/unauthorized`, `(authenticated)/layout` con `PosTopbar`. `apps/pos/.env.local` mirror de `admin/.env.local` (gitignored).
  - **5.E.2 shift gate** (`c8193df`): `features/shifts` con api client (`getCurrent`, `open`) + `server.ts` SSR. Page `/shift/open` con `OpenShiftForm` (input `openingCash` + notes opcional). Home page hace gate: si no hay shift OPEN → redirect `/shift/open`; si ya hay → redirect inverso. Layout fetcha user + shift en paralelo y los pasa a `PosTopbar` que muestra badge emerald `● Turno abierto`. Conflict 409 si reabre.
  - **5.E.3 catalog + picker** (`04710e7`): `features/catalog` con `fetchActiveProducts` (GET `/products?only_active=true`), `CatalogGrid` (chips de categorías + grid responsivo + `ProductTile` con `+ opciones` cuando hay sizes/modifiers), `ProductPickerModal` con radio sizes (required si hay) + checkboxes modifiers (si `modifiersEnabled`) + cantidad + preview de unitPrice/total con sumas size+modifiers. Home con split lg:[1fr_360px]: catálogo + placeholder carrito.
  - **5.E.4 carrito + totales con promos** (`0086173`): dep `zustand@^5.0.2`. `features/sales/store/cart-store` con items + `addItem` (combina líneas idénticas: mismo productId+sizeId+modIds) + `removeLine` + `updateQty` + `clear` + `lastSale`. `lib/totals.computeCartTotals(items, promos, at)` usa `applyPromotion` de `@pos-tercos/domain` por línea. `CartPanel` con qty +/- + delete + footer con subtotal/descuentos/total + auto-refresh de promos cada 60s. Strikethrough en línea con promo aplicada + tag `−$X promo`. Picker `onConfirm` ahora cablea al store.
  - **5.E.5 checkout CASH + digital** (`b1a862e`): api `createSale` (POST `/sales` con header `Idempotency-Key` UUID v4) + `confirmPayment`. `CheckoutModal` con selector de 5 métodos (CASH / NEQUI / DAVIPLATA / QR_BANCOLOMBIA / TRANSFER). CASH: input `Recibido` + cálculo de cambio en vivo, valida `received >= total`. Digital: doble input de monto + ambos deben coincidir y matchear total exacto + checkbox `verifiqué app del negocio + comprobante cliente` (manda `digitalDoubleVerified=true`). Idempotency-key generado UNA vez al abrir modal — reintentos por network flake usan el mismo key, backend devuelve cached. Modal no cerrable mientras pending. On success → `setLastSale` + `clear` + `LastSaleBanner` con receipt#/método/cambio.
  - **5.E.6 post-pago print + cajón** (`257b035`): api `printReceipt` (POST `/sales/:id/print` → text/html con headers `X-Receipt-Key`/`X-Receipt-Url`) + `openDrawerForSale`. `lib/openReceiptWindow(html)` abre HTML como Blob URL en `window.open` + auto `window.print()` on load. Detecta popup blocker y reporta. Revoca URL on `beforeunload`. `LastSaleBanner` con 2 botones: `Imprimir recibo` (todos los métodos) + `Abrir cajón` (solo CASH). Estado pending/ok/error inline.
  - **5.E.7 anular venta** (`de44062`): api `listSales` (filtros `shift_id` + `status` + `limit`) + `voidSale` (POST `/sales/:id/void` con header `X-Approval-Pin` + body `{reason}`). `VoidModal` con selector radio de últimas 20 PAGADAS del turno + textarea motivo (5-200) + input PIN 6 dígitos numéricos. Botón rojo `Anular venta` solo se habilita cuando los 3 son válidos. `VoidSaleAction` (topbar wrapper): botón `Anular` disabled si no hay turno + badge amber autoborrar 5s con `Anulada #N`. PosTopbar integra el botón.

  **Decisiones tomadas en 5.E (no re-discutir):**
  - Carrito Zustand local del feature (NO global) — solo el POS lo necesita.
  - Idempotency-Key generado en cliente al abrir CheckoutModal (UUID v4 via `crypto.randomUUID()`); persiste mientras el modal está abierto. No se persiste entre sesiones.
  - Sizes/modifiers seedeados directo en DB para smoke (la API solo expone sizes/modifiers en CREATE de producto, no en PATCH — gap funcional documentado en `fase4-ajustes-pendientes.md`).
  - PIN del Dueño dev seteado en `123456` (override vía `POST /approvals/pin`). Admin Operativo dev sin PIN. UI de configuración entra en FASE 11.
  - Botón "Abrir cajón" solo aparece en CASH (otros métodos no manejan efectivo).
  - `directResale=true` rechaza `isCombo=true` (ya enforced en Zod). 5.E no construye combos — el "Combo Familiar" seed con `basePrice=0` queda como gap para fase 4 ajustes.

### FASE 6 — KDS + Pantalla Pública · ✅ COMPLETADA en `main` / KDS Next.js eliminado en v2

Particionada en 5 sub-sprints. Plan completo en `fase5e-y-pendientes.md` sec 3.1.

- [x] **6.A backend KDS** (`1b06ffd`): deps `@nestjs/websockets` + `@nestjs/platform-socket.io` + `socket.io`. `packages/types/kds`: `KitchenStatusEnum`, `KitchenOrderSchema` (alias Sale), `KdsEventSchema`, constantes `KDS_NAMESPACE='/ws/kds'` + `KDS_QUEUE_ROOM='kitchen.queue'`. Decorator `KitchenAccess()`. `KdsModule` (forwardRef SalesModule) con: `KdsGateway` (auth tri-modal: handshake.auth.token | Authorization Bearer | cookie pos_access; verify JWT con JwtService; role gate; join room; emit), `KdsService` con `getQueue` (PAGADO + EN_PREPARACION FIFO) + `start`/`ready` (transitions con sale_status_log + audit `SALE_STATUS_CHANGED`), `KdsController` con `GET /kds/orders` + `POST /:id/start` + `POST /:id/ready`. Hook `SalesService.confirmPayment` → `kdsGateway.emit('order.created')`.
- [x] **6.B SSE pantalla pública** (`67dd921`): SSE base con `PublicDisplayModule` `@Global()`, `notify()` → RxJS Subject, `stream()` con `concat(initial, updates)`, `GET /state` + `@Sse('/stream')` `@Public()`. **⚠️ El modelo de datos de 6.B (current/next + currentTurn manual) fue SUPERSEDIDO por turnos v2 (2026-05-22)** — ver §6 "Turnos v2" y memoria `project-turnos-v2`. Ahora: turno asignado al pagar (secuencia única), cola de listos por `ready_at`, llamado manual del cajero, `state = {currentTurn, callSeq, asOf}`.
- [x] **6.C apps/kds UI** (`83c186e`): implementó `apps/kds` Next.js — **eliminado en v2 (commit `99cb6a1`)**. Reemplazado por `apps/kds-flutter` (ver sec 7.ter).
- [x] **6.D apps/public-display UI** (`2434523`): kiosko CSS (cursor:none, overflow:hidden, bg-gray-950). Layout viewport sin user-scalable. `useDisplayStream` con `EventSource` (reconnect nativo + backoff browser-managed). `Display` full-screen split: current section gigante (#N text-9xl + customerName) | next section abajo. ConnectionDot top-right debug. Empty state amigable.

  **Decisiones tomadas en FASE 6 (no re-discutir):**
  - WebSocket lib: socket.io (estabilidad + reconnect built-in). Cliente: socket.io-client.
  - Auth WS: handshake.auth.token (cookie httpOnly NO se envía cross-origin del KDS dominio :3003 al API :3001). SSR lee cookie y la pasa como prop `wsToken`.
  - SSE público: sin middleware estricto. La auth boundary la marca el filtro server-side: solo expone `{saleId, receiptNumber, customerName, at}` — NO total/payment/phone.
  - Trigger emits desde 2 lugares: `confirmPayment` (entra al queue) + `KdsService.transition` (start/ready). Ambos checkean `type=COUNTER` antes de notify a public display.
  - Sale tabla NO tiene `updatedAt` — para el `current` del public display derivamos timestamp desde `sale_status_log.changedAt`.
  - Token refresh automático en KDS: NO implementado en 6.C (TODO FASE 14 hardening).

### FASE 7 — Web pública pedidos (sin Mapbox) · ✅ COMPLETADA

Particionada en 6 sub-sprints. Plan completo en `fase5e-y-pendientes.md` sec 3.2.

- [x] **7.A backend web-orders + web-menu + throttler + token HMAC** (`cecbe6d`):
  - dep `@nestjs/throttler ^6.4.0` + `ThrottlerModule.forRoot([{ttl:60_000, limit:100}])` global + `ThrottlerGuard` como `APP_GUARD`
  - `packages/types/web-menu`: `PublicMenuProductSchema` (subset SAFE) + `PublicMenuResponse {products, categories[], asOf}`
  - `packages/types/web-orders`: `WebOrderTypeEnum (WEB_PICKUP, WEB_DELIVERY)` + `CreateWebOrder` con phone E.164 colombiano (`/^\+57\d{10}$/`) + `PublicWebOrder` (subset sin paymentMethod/cashier/shift) + `CreateWebOrderResponse {order, token, tokenExpiresAt, paymentInstructions}` + `MarkPaidSchema` + `WebOrderEvent`
  - `WebMenuModule`: `GET /web/menu` `@Public() Throttle(60/60s)`, expone solo subset del producto
  - `WebOrderTokenService`: HMAC-SHA256, formato `<base64url(payload)>.<base64url(sig)>`, payload `{sid, exp}`, TTL 24h, verify timing-safe + `expectedSaleId` match. Usa `WEB_ORDER_TOKEN_SECRET` (fallback `JWT_ACCESS_SECRET` en dev)
  - `WebOrdersService`: `create()` reusa `SalesService.create` (idempotency + promos + expandRecipe). `getPublic()` lee + proyecta. `markPaid()` audit `SALE_STATUS_CHANGED metadata.stage='customer-paid-claimed'`
  - `WebOrdersController` `@Public()`: `POST /web/orders` (Throttle 30/60s) + `GET /web/orders/:id?token=` (120/60s) + `POST /web/orders/:id/mark-paid?token=` (10/60s)
  - `SalesService.create`: removido lock FASE 5 que rechazaba WEB_*. Shift exigido solo para COUNTER; `cashierId`/`shiftId` quedan null en WEB_* hasta que cajero confirme pago
- [x] **7.B PosGateway WS** (`8577bf6`): namespace `/ws/pos`, room `pos.web-orders`, auth tri-modal idéntica a `KdsGateway`. Role gate `CashierAccess`. `emit()` para `web-order.created` y `web-order.customer-paid`. Hooks: `WebOrdersService.create` post-toPublicDto + `markPaid` post-audit
- [x] **7.C apps/web menú + carrito localStorage** (`37165ea`): deps `zod`, `zustand`. `next.config` rewrite `/api/* → :3001`. `features/catalog` con SSR fetch + `CatalogGrid` chips de categoría sticky + `ProductCard` + `ProductPickerModal` autocontenido. `features/cart` con zustand+persist (key `pos-tercos-web-cart`, partialize items, hydration flag), `CartButton` con badge + total + placeholder estable, `CartDrawer` slide-right
- [x] **7.D checkout 1-página + status poller + mark-paid** (`18c928c`):
  - `CheckoutForm`: toggle pickup/delivery, phone con prefijo locked +57 + 10 dígitos, validación inline, idempotency-key uuid v4, post-success → router.push success URL + clear cart
  - `OrderStatusPoller` hook: poll cada 5s, detiene en estados terminales, expone `{live, reconnecting, stopped}`
  - `OrderStatusView`: header tonal por status, `PaymentSection` solo en PENDIENTE_PAGO con input opcional reference + botón "Ya pagué"
  - `/checkout` y `/checkout/success/[id]` pages con `force-dynamic`
- [x] **7.E POS drawer pedidos web** (`858cb50`):
  - dep `socket.io-client ^4.8.1` para POS
  - `getAccessTokenServer()` agregado a `features/auth` (extra para WS handshake cross-origin del `/ws/pos`)
  - `useWebOrdersSocket`: socket.io-client → `/ws/pos` con `handshake.auth.token` desde SSR, dedupe + sort por createdAt asc, sale del state cuando status != PENDIENTE_PAGO o evento `web-order.cancelled`
  - `WebOrdersDrawer` slide-right con header (count + ConnectionDot live) + lista con badge "Cliente avisó pago" emerald (si `customerPaidAt` no null) o "Pendiente confirmar" amber + botón "Confirmar pago"
  - `ConfirmWebPaymentModal`: load full Sale on open (para ítems), método NEQUI default, doble validación digital con monto auto-precargado al total, llama `confirmPayment` del feature sales (mismo endpoint `POST /sales/:id/confirm-payment`)
  - `WebOrdersAction` (topbar wrapper): badge contador (amber pending / emerald si cliente avisó) + animate-pulse 1.5s al recibir nueva orden
  - PosTopbar acepta `webOrdersInitial` + `wsToken`; layout SSR fetcha en paralelo con user/shift

  **Decisiones tomadas en FASE 7 (no re-discutir):**
  - Token HMAC con TTL 24h. Siempre en URL (no localStorage del cliente). HMAC-SHA256 con `WEB_ORDER_TOKEN_SECRET` (fallback `JWT_ACCESS_SECRET` en dev).
  - Checkout 1-página con toggle (no multi-step) — UX simple por defecto.
  - Notificación POS: namespace nuevo `/ws/pos` + room `pos.web-orders` (separado del `/ws/kds` que es solo COCINERO). Auth tri-modal igual.
  - "Ya pagué" del cliente NO cambia status del sale — solo audit `SALE_STATUS_CHANGED metadata.stage='customer-paid-claimed'`. El cajero verifica manualmente vía POS y llama el endpoint de confirmPayment normal.
  - Web orders no exigen shift abierto al `create` — el shift se asocia recién en `confirmPayment` del cajero (que sí debe tener turno abierto).
  - Status poller cliente cada 5s (no SSE) — evita conexiones colgadas en pestañas inactivas y rate-limit lo permite (120/60s).
  - El POS usa el endpoint `/sales/:id/confirm-payment` existente para órdenes web (no se crea endpoint dedicado) — el modal precarga `amountReceived = total` y obliga doble validación.

### FASE 4 ajustes (sweep) · ✅ COMPLETADA (8 sub-sprints, 13 de 18 items)

Documento canónico: `fase4-ajustes-pendientes.md`. Particionada en 8 sub-sprints:

- [x] **4adj.A** (`4439647`) — 2.3 + 2.4: backend valida `Math.abs(total - sum(items.total)) <= max(1% total, $1000)` + `iva <= total` con mensajes claros.
- [x] **4adj.B** (`3801874`) — 2.1: ProductForm soporta direct-resale full (toggle + 4 campos required + edit lock + banner).
- [x] **4adj.C** (`bc77a6b`) — 2.2: migration `ingredient.lastUnitCost` + `confirm()` lo actualiza + domain puro `computeProductCost`/`computeComboCost` recursivo + endpoint `expandedCost` extendido devuelve `{kind, totals, components, totalCost}` + UI ProductsTable muestra costo de combos.
- [x] **4adj.D** (`813539f`) — 2.5 + 2.12: actions específicos `INVOICE_UPLOADED|CONFIRMED|REJECTED|CLONED` (en vez del genérico `INVENTORY_MOVEMENT_PURCHASE` con metadata.stage). cloneFrom rechaza source con 0 items. Bug colateral: `@UsePipes` a nivel método aplicaba ZodValidationPipe a `@CurrentUser` también — refactor a pipe inline en `@Body`.
- [x] **4adj.E** (`1c5a8cd`) — 2.10: DELETE /invoices/:id solo PENDING_REVIEW + storage.delete idempotente + audit `INVOICE_DELETED`. UI con DeleteDraftButton.
- [x] **4adj.F** (`10524ac`) — 2.7 + 2.8: `SupplierProductSchema` polimórfico + endpoint GET /suppliers/:id/products + UI /suppliers/[id] con secciones "Productos comprados" + "Últimas facturas".
- [x] **4adj.G** (`b01b8fb`) — 2.6 + 2.9 + 2.11: GET /inventory/movements con filtros `source_type`/`source_id`. GET /invoices/:id/photo (binary, AdminAccess). UI /invoices/[id] con sección "Movimientos generados" (CONFIRMED) + foto thumbnail. CreateStockableInline warning amber si unitPurchase ≠ row.unit.
- [x] **4adj.H** (`7ddffe2`) — 2.13 + 2.14 + 2.15: lib/margin-thresholds (centralized) + lib/format (formatCop, formatNumber, formatDate). EditDraftScreen drop doble fetch on-mount.
- [x] **2.16** (`fc0c9d3`) — sidebar con iconos lucide-react.

**Skipped (deuda menor documentada):**
- 2.17 — tests automatizados FASE 4 (esfuerzo grande, no v1; testing-guide manual es suficiente por ahora).

### FASE 11 — Cierre de caja + Anti-fraude · ✅ COMPLETADA (5 sub-sprints)

Particionada según `fase5e-y-pendientes.md` sec 3.6.

- [x] **11.A** (`162bd19`) — Backend `POST /shifts/:id/close`: valida ownership + status OPEN, calcula `expectedCash = openingCash + sum(sales CASH PAGADOS+)`, `difference = counted - expected`. Audit `SHIFT_CLOSED` con metadata. Si `|diff| >= $5.000` (DISCREPANCY_THRESHOLD_COP) → audit adicional `SHIFT_DISCREPANCY_DETECTED` con TODO marker para WhatsApp alert (FASE 9).
- [x] **11.B** (`0e0b05c`) — UI POS `CloseShiftModal` con Z-report preview (apertura + ventas CASH + breakdown por método) + counted input con diff live tonal. `CloseShiftAction` en topbar. Admin `/shifts` page con tabla histórica + diff coloring por threshold. AdminSidebar item "Turnos".
- [x] **11.C** (`fac3d25`) — `POST /approvals/pin` cambió de OnlyDueno a AdminAccess (cada user con rol cambia su propio PIN). UI POS `ChangePinAction` (modal con PIN doble input + confirm matching + 6 dígitos validation). Renderea solo si user.role ∈ {ADMIN_OPERATIVO, DUENO}. Audit con metadata.role.
- [x] **11.D** (`6abe877`) — Reporte de anomalías por cajero (2σ histórico personal). Métricas: `|difference|` + `voidCount` + `noSaleCount` (CASH_DRAWER_OPENED_NO_SALE en ventana del shift). Baseline = top 30 shifts excluyendo el más reciente; si <5 shifts → "no baseline". Flags si métrica > avg + 2σ. UI `/reports/anomalies` con cards de baseline + tabla por cajero.
- [x] **11.E** (`788717d`) — Reconciliación CSV (NEQUI_CSV | BANCOLOMBIA_CSV) **stateless** por ahora (persistencia en FASE 14). Parser CSV minimalista + greedy matching contra sales digitales por monto + fecha ±24h. Flags: `matched` / `unmatched_csv` (red flag) / `unmatched_sale`. UI `/reports/reconciliation` con file upload + selector source + tabla resultado tonal.

**Decisiones tomadas en FASE 11 (no re-discutir):**
- DISCREPANCY_THRESHOLD_COP = $5.000 (hardcoded por ahora; UI muestra warning visual cuando se supera).
- WhatsApp alert al detectar descuadre queda como TODO marker en código — wirea en FASE 9.
- Reconciliación NO persiste reportes en DB en este sprint — endpoint stateless. Tabla `payment_reconciliations` se diferirá hasta que el dueño quiera histórico (FASE 14 hardening prod).
- 2σ requiere ≥5 shifts de baseline — si hay menos, se marca como "Sin baseline" sin error. Razonable: necesitás histórico personal para detectar desviación personal.
- Greedy match en reconciliation prioriza primer match por orden (CSV asc, sale asc) — no el "mejor match" temporal. Aceptable para v1; FASE 14 puede sofisticar con scoring por proximidad.

### FASE 8 — Mapbox + validación 3km · ✅ COMPLETADA en `main` / ELIMINADA en v2

> **En v2 (`refactor/v2-reorientacion`) todo el código de Mapbox y delivery geográfico fue eliminado (commit `385635d`).** `apps/api/src/adapters/maps/` no existe, `GET /web/geocode` no existe, `WEB_DELIVERY` no existe.

Historial en `main` (commits `0a4b09a 417204d`): implementó `MapsProvider` interface + `MapboxMapsAdapter` + `WebGeoController` + validación 3km + autocomplete en web checkout.

### FASE 12 — Promociones avanzadas + Auto-pedido IA · ✅ COMPLETADA (5 sub-sprints)

Particionada en 2 lados: promociones (12.A-12.B) y auto-pedido IA (12.C-12.E).

- [x] **12.A** (`6c15d38`) — Motor de promociones extendido en `@pos-tercos/domain`:
  - `PromotionTypeKind = 'PERCENT_OFF' | 'BOGO' | 'FIXED_OFF' | 'COMBO_OFF'`.
  - `applyPromotion` con switch-by-type: PERCENT (pct sobre línea), FIXED (cap a lineSubtotal), BOGO (sets completos × unitPrice), COMBO (gating por `isCombo`).
  - **Cambio breaking de selección de ganador**: antes "mayor discountPct", ahora "mayor descuento ABSOLUTO en COP" (única forma justa de comparar pct vs fixed vs bogo).
  - `ApplyPromotionInput` ganó `quantity` + `isCombo`. Callers actualizados (api SalesService, pos totals.ts, api PromotionsService.loadActiveAt).
  - 11/11 tests unit (cubren los 4 tipos + mixed types). Tests excluidos del build TS, ad-hoc con `pnpm dlx tsx`. Vitest formal queda para FASE 14.

- [x] **12.B backend** (`18bada3`) — Schema + Zod superRefine:
  - Migration `20260504203249`: agrega `discount_fixed`, `bogo_buy_qty`, `bogo_get_qty` a `promotions`. `discount_pct` ahora NULL.
  - 4 CHECK constraints (`chk_promo_pct/fixed/bogo/combo`) que enforce per-type a nivel DB. Smoke verificado: 6 inválidos rechazados, 3 válidos aceptados.
  - `PromotionSchema` (wire) — discountPct/Fixed/bogo* nullable.
  - `CreatePromotionSchema.superRefine` — switch-by-type con `rejectField` helper para enforce que cada type tenga solo sus campos.
  - `UpdatePromotionSchema` — drops `discountPct`. Decisión: campos por-tipo son inmutables; para cambiarlos se desactiva la promo y se crea una nueva. Mantiene la invariante de tipo sin re-validar XOR.
  - `PromotionsService.loadActiveAt` y `toPromotionDto` mapean los 4 fields. Audit metadata cambió `discountPct` → `type`.
  - Fix incidental: `PromotionSchema.productIds.default([])` causaba variance (output type opcional). Removido `.default([])`.

- [x] **12.B UI** (`a770e67`) — Admin `/promotions`:
  - `apps/admin/src/features/promotions/`: api/client + PromotionsTable (badge tipo + descuento renderizado per-type) + PromotionForm (selector tipo + campos condicionales + 7 chips días + time pickers + multi-select productos) + PromotionDetail (read-only + desactivar).
  - Pages `/promotions`, `/promotions/new`, `/promotions/[id]`. Sidebar item "Promociones" (icon Tag) en sección Catálogo.

- [x] **12.C** (`44ba01b`) — Backend purchase-suggestions:
  - Migration `20260504210021`: model `PurchaseSuggestion` polimórfico (xor ingredient/product) + enum `PurchaseSuggestionStatus` (PENDING, EVALUATED, ACCEPTED, REJECTED, STALE).
  - CHECK polimórfico (xor ingredient_id/product_id coherente con entity_type) + `suggested_qty > 0`.
  - `PurchaseSuggestionsService.runScan(systemUserId)`: idempotente. Lista stockables activos con `thresholdMin > 0`, batch-load `lastUnitCost`, dedupe contra PENDING/EVALUATED activas, crea nuevas + marca STALE las que ya no están bajo threshold.
  - Algoritmo qty: refill a 2× threshold, `ceil(deficit_stock / conversion_factor)`, mínimo 1 (en `unit_purchase`).
  - `@Cron EVERY_HOUR` non-throwing.
  - Endpoints: `GET /purchase-suggestions[?status=&limit=]`, `GET /:id`, `POST /:id/accept`, `POST /:id/reject` (Admin/Dueño); `POST /admin/scan` (Dueño-only).
  - Audit actions nuevos: `PURCHASE_SUGGESTION_CREATED/EVALUATED/ACCEPTED/REJECTED/STALE`.
  - Smoke E2E (3 ingredientes test): bajo-threshold detectado, dedupe, stale auto, accept/reject + audit log correctos.

- [x] **12.D** (`626adbb`) — LLM evaluación de sugerencias:
  - `LLMProvider.evaluatePurchaseSuggestion(req)` agregado a interface + impls Anthropic (Haiku 4.5) y OpenAI (gpt-4o-mini). max_tokens=256.
  - `PURCHASE_SUGGESTION_SYSTEM` prompt en español, máx 3 frases, tono directo.
  - `buildPurchaseSuggestionUserPrompt(input)` arma contexto: item + stock + threshold + sugerencia + costo + últimas 10 compras (date · supplier · qty · $/unidad).
  - `PurchaseSuggestionsService.evaluate(id, userId)`: carga últimos 10 invoice_items CONFIRMED del stockable (con supplier name), llama LLM, escribe `llmRationale + llmModel + llmEvaluatedAt`, transición → EVALUATED.
  - `evaluateAllPending(userId)`: batch sobre PENDING, no-throw, retorna `{evaluated, failed}`.
  - Endpoints Dueño-only: `POST /:id/evaluate`, `POST /admin/evaluate-all-pending`.
  - Smoke real verificado contra Anthropic Haiku 4.5: rationale 468 chars en español, audit log con `metadata.modelUsed + historySize + rationaleLen`.

- [x] **12.E** (`2cdf7f6`) — Admin `/purchase-suggestions`:
  - `apps/admin/src/features/purchase-suggestions/`: api/client + SuggestionsTable (StatusBadge tonal + emoji 🌾/📦 + indicador 🤖 si fue evaluada) + SuggestionDetail (panel rationale IA re-evaluable + acciones aceptar/rechazar con nota) + RunActionsBar (scan manual + evaluar pendientes en batch).
  - Page `/purchase-suggestions` con tabs de filtro por status (Abiertas / Sin evaluar / Evaluadas / Aceptadas / Rechazadas / Vencidas / Todas).
  - Page `/purchase-suggestions/[id]` SSR.
  - Sidebar item "Sugerencias IA" (icono Sparkles) en sección Compras.

  **Decisiones tomadas en FASE 12 (no re-discutir):**
  - Selección ganadora pasó de "mayor pct" a "mayor descuento absoluto en COP" — única forma justa de comparar 4 types.
  - UpdatePromotion no permite cambiar campos per-tipo (inmutable). Para cambiarlos: desactivar + crear nueva. Evita re-validación XOR + audit más limpio.
  - CHECK constraints DB defensivos espejan Zod superRefine (no confiar solo en validación app).
  - Cron de auto-evaluación LLM **NO existe**: el LLM se llama solo on-demand por el Dueño (cuesta $$). El cron solo detecta low-stock + crea PENDING.
  - Algoritmo de qty: refill a 2× threshold con ceiling. Sin lógica de "comprar más por descuento por volumen" — eso lo evalúa el LLM y lo comenta en el rationale.
  - LLM con max_tokens=256 → ~$0.0001 por eval con Haiku 4.5. Aceptable para uso diario.
  - Conversión de unidades en el prompt: actualmente puede confundir al LLM (mezcla `unit_stock` y `unit_purchase` sin conversion factor explícito). TODO menor: clarificar el prompt, pero no bloqueante.

### FASE 9 — WhatsApp wa.me semi-automático · ✅ COMPLETADA en `main` / SUPERSEDIDA en v2

> **En la rama v2 (`refactor/v2-reorientacion`) esta FASE fue reemplazada por el flujo OpenWA automático (commit `e739ef2`). El código de wa.me ya NO existe en v2.** El historial a continuación es para referencia del trabajo en `main`.

Implementación en `main` (commits `ee4a9f3 1bba4ea 990c9a3 44ed21b`):
- Helper puro `@pos-tercos/domain/whatsapp/` con 16/16 tests (wa.me builders).
- Endpoint `POST /sales/:id/whatsapp-clicked` (audit-only) — **eliminado en v2**.
- POS drawer: botón "Aceptar y contactar" (wa.me) — **reemplazado en v2** por llamada a `POST /sales/:id/accept`.
- KDS Next.js abría wa.me al "Marcar listo" — **KDS Next.js eliminado en v2**.
- Web: botón "Ya pagué" removido en FASE 14.A.

**En v2:** ver sec 4.10 y sec 7.v2 para el flujo actual con OpenWA.

### FASE 13 — Reportes y Dashboard · ✅ COMPLETADA (5 sub-sprints)

- [x] **13.A** (`8707725`) — Backend `SalesReportsService` (nuevo) con 6 métodos:
  - `getSalesSummary(from, to, granularity)`: serie temporal por bucket (daily o hourly) + breakdowns por type y por method + totales (count, revenue, discount, voidCount, avgTicket). Filtra ventas pagadas via `paidAt` y excluye PENDIENTE_PAGO/CANCELADO_NO_PAGO/VOID.
  - `getTopProducts(from, to, limit)`: groupBy SaleItem.productId con costo y margen estimados. Costo recursivo: combo (sum components × lastUnitCost), directResale (lastUnitCost), receta (sum recipeEdges directos × lastUnitCost/conversionFactor con merma; subproducts no expandidos).
  - `getHourHeatmap(from, to)`: matriz 7×24 dow × hour count + revenue.
  - `getWhatsAppMetrics(from, to)`: cobertura por stage desde audit log `WHATSAPP_LINK_OPENED`. eligible accepted = todos los web sales; confirmed = los con `paidAt`; ready = los en LISTO_DESPACHO+. coverage = sales únicas alcanzadas / eligible.
  - `getSuggestionsMetrics(from, to)`: counts por status + acceptedEstTotal (suma estTotal de las ACCEPTED).
  - `getDashboardSummary()`: resumen del día con WoW% + conteo en vivo de pedidos pendientes / en cocina / listos / stock bajo / sugerencias pendientes.
  - 6 endpoints `AdminAccess` en `ReportsController` con `parseDateRange` (YYYY-MM-DD → Date local 00:00/23:59, default 7 días, heatmap 30 días).
  - 7 schemas nuevos en `packages/types/reports.ts`.

- [x] **13.B** (`1bfc4fc`) — Dashboard home `/`:
  - 4 stat cards grandes (revenue + WoW%, ventas, pedidos web por aceptar, stock crítico).
  - 3 small cards tonales (en cocina blue, listos emerald, sugerencias purple).
  - Grid 2-cols con 5 links a reportes detalle.

- [x] **13.C** (`02cccba`) — UI `/reports/sales`:
  - `RangeFilter` reutilizable con presets (Hoy/7d/30d/90d) + date pickers + toggle granularity (daily/hourly). URL search params como fuente de verdad — router.push y SSR refetch.
  - `SalesSummaryView`: 4 stat cards (Revenue / Ventas / Ticket promedio / Anuladas) + gráfica horizontal de barras por bucket (sin lib externa, divs con width%) + 2 BreakdownTable (por tipo + por método) con count, revenue absoluto y % del total.

- [x] **13.D** (`806d55a`) — UI `/reports/products`:
  - `TopProductsTable`: ranking + name + qty + revenue + barra distribución + costo/margen/% margen estimados.
  - Margen colorizado: ≥50% emerald, ≥30% blue, ≥15% amber, <15% red, null gray. Footer informativo sobre limitaciones del cálculo.

- [x] **13.E** (`b2ffa61`) — UI `/reports/operations`:
  - `WhatsAppMetricsCard`: 3 progress bars por stage con cobertura % + reached/eligible + hint inline. Tone ≥80% emerald, ≥50% amber, <50% red.
  - `SuggestionsMetricsCard`: 5 pills por status + tarjeta destacada `acceptedEstTotal` en COP.
  - `HourHeatmap`: matriz 7×24 con cells coloreadas (interpolación RGB lineal blue-50 → blue-700 por ratio del pico). Tooltip muestra revenue. Sin lib externa.
  - Sidebar: nueva sección "Reportes" (Ventas/Productos/Operación/Anomalías/Reconciliación). Caja queda solo con Turnos.

  **Decisiones tomadas en FASE 13 (no re-discutir):**
  - Bucketization usa `paidAt` (no `createdAt`) para que el revenue caiga al día/hora del pago, no de la creación. Sales `PENDIENTE_PAGO` no aparecen en summary.
  - Costo de producto con receta es **aproximación** (subproducts no expandidos). El dueño aceptó la simplificación; expansión recursiva queda para FASE 14 si se vuelve relevante.
  - Sin libs de gráficas (recharts/victory). Barras y heatmap renderizados con divs/CSS para minimizar bundle. Cambiar después si el negocio pide funcionalidades complejas (zoom, drill-down).
  - Cobertura WhatsApp se mide en sales **únicas** con click registrado, no en total de clicks (para no inflar % si el cajero hace doble click).
  - WoW% se calcula contra el "mismo día de la semana pasada" (not 7-day rolling). Es lo que un dueño de restaurante intuitivamente compara.

### FASE 14 — RRHH + persistencia + Vitest + cleanup · ✅ COMPLETADA (5 sub-sprints)

- [x] **14.A** (`d30f83a`) — Cleanup deprecated wa.me:
  - `PublicWebOrderSchema`: drop `customerPaidAt` (siempre fue derivado del audit log, nunca DB column).
  - `MarkPaidSchema` + tipo `MarkPaid`: removidos.
  - `WebOrderEventNameEnum`: drop `web-order.customer-paid` (queda `created` y `cancelled`).
  - Backend: `WebOrdersController.markPaid` removido. Service drop `markPaid`/`readCustomerPaidAt`. AuditService + Logger no usados removidos. `buildPaymentInstructions` cambia footer a "Te vamos a contactar por WhatsApp".
  - Web: `api/mark-paid.ts` eliminado, exports actualizados.
  - POS: `lib/project.ts` drop `customerPaidAt: null`. `useWebOrdersSocket` drop subscription a `web-order.customer-paid`. `WebOrdersAction` drop `claimed` count y badge emerald conditional. `ConfirmWebPaymentModal` drop bloque "Cliente declaró pago" → "Verificá el comprobante en WhatsApp antes de confirmar".

- [x] **14.B** (`6302fca`) — Schema RRHH + endpoints:
  - Migration `20260504220000`: model `WorkerAttendance` (userId + checkIn + checkOut nullable + hoursWorked Decimal calculado + notes; CHECK checkOut > checkIn, hoursWorked >= 0); model `WorkerCommission` (userId + type enum + percent / fixedAmount + appliedAt + notes; CHECK per-type defensivos); enum `WorkerCommissionType` (PERCENT_OF_SHIFT | FIXED_PER_SALE).
  - Migración escrita a mano (Docker abajo durante el sprint). Aplicar con `pnpm prisma migrate deploy`.
  - `packages/types/workers.ts`: schemas DTO + `CheckIn` + `CheckOut` + `CreateCommission` con superRefine per-type + `PayrollPeriodEntry` + `PayrollPeriodReport`.
  - `WorkersService`: `checkIn` (rechaza si turno abierto), `checkOut` (calcula hoursWorked decimal), `createCommission` (siempre fila nueva, histórico inmutable), `getActiveCommission(userId, at)` (la más reciente con appliedAt <= at), `getPayrollPeriod` (agrupa por user con totalHours, attendanceDays, activeCommission, estimatedCommission).
  - Endpoints `AdminAccess`: `GET /workers/users` (candidatos), `GET /workers/attendance`, `POST /workers/:userId/check-in`, `POST /workers/attendance/:id/check-out`, `GET /workers/commissions`, `POST /workers/:userId/commission`, `GET /workers/payroll-period`.
  - Audit actions nuevos: `WORKER_CHECK_IN`, `WORKER_CHECK_OUT`, `WORKER_COMMISSION_CREATED`.

- [x] **14.C** (`a86541f`) — UI admin `/workers`:
  - `apps/admin/src/features/workers/`: api/client + WorkerOption type + AttendanceTable + CheckInForm + CommissionsList (form + tabla con TypeBadge tonal + footer "histórico inmutable") + PayrollPeriodTable (3 stat cards + tabla por trabajador con activeCommission + estimatedCommission emerald si >0).
  - Pages: `/workers` redirect, `/workers/attendance` (form + filtro Todos/Abiertos), `/workers/commissions`, `/workers/payroll` (RangeFilter default 14 días).
  - Sidebar: nueva sección "RRHH" con 3 items (UserCheck, Coins, Clock).

- [x] **14.D** (`13e0d67`) — Persistencia de reconciliation reports:
  - Migration `20260504220500`: model `PaymentReconciliation` (source, periodFrom/To strings, counts, reportJson snapshot, importedById, createdAt). Indexes (createdAt DESC) y (source, createdAt DESC). Inmutable.
  - `SavedReconciliation` + `SavedReconciliationDetail` schemas.
  - `ReconciliationService`: `saveReport` (audit `RECONCILIATION_IMPORTED`), `listSaved`, `getSavedDetail` (Zod-parse del JSON para integridad).
  - Endpoints `OnlyDueno`: `POST .../import?save=true` ahora persiste, `GET .../history`, `GET .../history/:id`.
  - UI: ReconciliationView agrega checkbox "Guardar en historial" (default on) + router.refresh post-save. Page `/reports/reconciliation` muestra 2 secciones (importar + histórico). Page `/reports/reconciliation/history/[id]` para detalle.

- [x] **14.E** (`2ead261`) — Vitest formal + costo TopProducts recursivo:
  - Vitest agregado a `@pos-tercos/domain` (^3.0.5) + vitest.config.ts.
  - 27 tests migrados de runner manual a describe/it/expect: 11 promotions + 16 wa.me. `pnpm -F @pos-tercos/domain test` → 27/27 pass.
  - `SalesReportsService.getTopProducts` reemplaza el cálculo inline aproximado por `RecipesService.expandedCost(productId)` que expande subproducts via `expandRecipe` + `computeProductCost`/`computeComboCost`. Trade-off N+1 (≤100 productos, admin-only).
  - ReportsModule importa RecipesModule.

  **Decisiones tomadas en FASE 14 (no re-discutir):**
  - Comisiones: histórico **inmutable** — un cambio crea nueva fila, jamás update. La vigente se calcula con `appliedAt <= ahora`. Permite auditar comisiones pasadas sin perder info.
  - Migration de RRHH y de reconciliations escritas a mano por Docker abajo durante el sprint. Cuando vuelva el server: `prisma migrate deploy` aplica ambas. Schema y SQL espejan estructura que `prisma migrate dev` generaría.
  - `payment_reconciliations.report_json` guarda el `ReconciliationReport` completo (incluyendo todas las rows). En grandes volúmenes esto crece — para v1 está bien; en hardening de FASE 15 evaluar normalizar a tabla hija.
  - TopProducts ahora hace N+1 queries pero es admin-only. Si se vuelve hot: pre-cargar TODOS los grafos en memoria una vez al arrancar el endpoint.
  - Reconciliation guardar es opt-in (default checked) — el dueño puede desactivar para tests sin contaminar histórico.

### FASE 15 — Hardening + Storage R2 + Print Agent + PWA + Deploy · ✅ COMPLETADA (5 sub-sprints + docs)

- [x] **15.A** (`e88b464`) — Hardening backend:
  - `buildDiscrepancyAlertLink()` puro en `@pos-tercos/domain` con 3 tests Vitest. Cuando se detecta `SHIFT_DISCREPANCY_DETECTED`, se construye wa.me URL al Dueño (env `OWNER_WHATSAPP_PHONE`) y se persiste en `audit.metadata.whatsappAlertUrl` para click desde `/audit`. Cero costo.
  - `StorageProvider.listKeys()` agregado a la interface + implementado en `LocalFilesystemStorageAdapter` (readdir).
  - `InvoicesService.sweepOrphanInvoiceFiles()` con `@Cron(EVERY_WEEK)` + endpoint `POST /invoices/admin/sweep-orphans` (Dueño-only) para trigger manual. Limpia archivos en storage no referenciados por ninguna invoice.
  - Doc fix: CLAUDE.md sec 4.8 R2StorageAdapter → FASE 15.B.

- [x] **15.B** (`949b0ed`) — `R2StorageAdapter` para producción:
  - Cloudflare R2 (S3-compatible) con `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`.
  - put/get/url/delete/listKeys implementados. Signed URLs TTL 1h o URL directa si `R2_PUBLIC_URL_BASE` (custom domain CF).
  - Factory lazy en `StorageModule`: `STORAGE_PROVIDER=r2` instancia el adapter (que valida vars en constructor); default `local`. Dev sigue funcionando sin tocar nada.
  - Keys idénticas en ambos adapters → no hay migration de datos al cutover local→R2.

- [x] **15.C** (`61b7e4e`) — ESC/POS + Print Agent:
  - `renderReceiptEscPos(receipt)` puro en `@pos-tercos/domain` retorna Buffer con secuencia ESC/POS para Epson TM-T20III (init, alignment, bold, double-height totals, partial cut). Latin1 encoding para acentos.
  - `DRAWER_KICK` constant para abrir cajón conectado al RJ-11.
  - 7 tests Vitest. Total domain: 37/37 pass.
  - Nuevo app `apps/print-agent`: HTTP server Node nativo en puerto **9120** (el código usa 9120 — `main.ts`; el 9100 original chocaba con Flutter DevTools). Endpoints `/print` (body `{escposBase64}` XOR `{receipt}`), `/drawer-open`, `/health`. Auth opcional `X-Agent-Secret`. Driver 4-modos (Windows spooler / USB libusb / device file / dump a disco en dev).
  - `EscPosPrinterAdapter` + `EscPosCashDrawerAdapter` en `apps/api/src/adapters/`: POSTean al print-agent. Backup HTML del recibo persiste igual que LocalFs (sirve como fallback si agent caído).
  - Factory lazy en `PrinterModule` y `CashDrawerModule`: `PRINTER_PROVIDER=escpos` activa ambos. Default `local`.

- [x] **15.D** (`b682f88`) — PWA en POS (y en el antiguo KDS Next.js):
  - `manifest.json` standalone landscape, theme color azul (POS), íconos SVG inline.
  - Service worker minimalista: online-first con fallback `/offline.html`, stale-while-revalidate para `/_next/static/*`, no cachea `/api/*`, no toca POSTs.
  - **En v2:** el KDS Next.js fue eliminado; el KDS Flutter es nativo (no necesita PWA). Solo el POS mantiene la PWA.

- [x] **15.E** (`8a51792`) — Deploy checklist `deploy.md`:
  - §1 Backend Railway: build/start con `prisma migrate deploy` embebido. Lista completa de env vars agrupadas por dominio.
  - §2 Frontends Vercel: 5 proyectos con build commands monorepo-aware.
  - §3 Print Agent en Raspberry Pi: hardware, instalación, systemd unit, conectividad via Cloudflare Tunnel o Tailscale.
  - §4 DNS Cloudflare: 8 records con SSL Full (strict).
  - §5 Migrations en prod: las 4 pendientes que aplica el deploy.
  - §6 Smoke test post-deploy: 8 pasos end-to-end.
  - §7 Backup Postgres: GitHub Actions cron 2 AM Colombia → R2.

  **Decisiones tomadas en FASE 15 (no re-discutir):**
  - Storage adapter selection lazy via factory en module (no Conditional providers de Nest) — evita instanciar R2 en dev cuando faltan env vars.
  - Print Agent es app separada (Node nativo, sin Nest) — corre en hardware modesto (Raspberry Pi 4 2GB), arranque instantáneo, sin overhead.
  - PRINTER_DEVICE default null → modo "dump a disco" para dev sin hardware. Cuando llegue la impresora, el dueño edita systemd para apuntar a `/dev/usb/lp0`.
  - HTML backup del recibo se mantiene aún con ESC/POS — sirve como fallback "imprimir desde browser" si el agent está caído. Costo: doble disk I/O por print, irrelevante.
  - Theme colors PWA: azul para POS (sigue admin). KDS Flutter ya no tiene PWA (es nativa).
  - Refresh JWT en KDS WS deferido a post-launch — token TTL 15min, tab reload trae fresco. Aceptable para 1 turno por día. Si en operación se vuelve fricción, agregar al hardening post-v1.
  - Migrations pendientes (4) NO se aplican en sesión local (Docker estaba abajo). Se aplican en prod via `prisma migrate deploy` que está en el start command de Railway — automático.

### Pendientes — FASE 10 (DESCARTADA en v2)

- **FASE 10** — Repartidor (DESCARTADA). `apps/repa` fue eliminado. El sistema solo soporta COUNTER y WEB_PICKUP. No hay planes de delivery propio para v1.

---

## 9. Skills Claude Code instaladas

Project-scoped en `.claude/skills/`. Activan al reiniciar Claude Code.

| Skill | Cuándo invocarla |
|---|---|
| `ui-ux-pro-max` | Cualquier decisión de UI: design system, color, tipografía, layout, accesibilidad, refactor visual. |
| `vercel-react-best-practices` | Antes de mergear código React/Next.js: 70 reglas de performance Vercel. |
| `find-skills` | Si aparece necesidad de tooling y dudás si hay skill que la cubra. |

---

## 10. NO hacer sin preguntarme

- Cambiar el alcance de v1 (definido en `pos-spec.v1.md`).
- Borrar migraciones aplicadas en producción.
- Tocar variables de entorno de producción.
- Aplicar migraciones a Railway directamente sin revisar.
- Agregar dependencias nuevas pesadas (>50KB minified) sin justificar.
- Codear features completas sin partir en submódulos verificables.
- Usar APIs externas reales en dev (OpenWA real, R2 real) — siempre por mock primero.
- Cambiar el modelo polimórfico stockables (`StockableType`).
- Conflar `lastUnitCost` con `basePrice` en producto.
- Saltar el banner amber de coste/venta en `InvoiceItemRow`.
- Eliminar el trigger insert-only de `inventory_movements` o `audit_log`.

---

## 11. Convenciones de commit

- Convencional commits: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`.
- Mensaje en español o inglés — consistencia dentro del commit.
- Body opcional con bullets de cambios concretos.
- Tests: jest unit en `apps/api` (cuando hay), supertest e2e para endpoints críticos. Vitest en frontend si aplica.

---

## 12. Cómo arrancar dev local

```bash
# Instalar dependencias
pnpm install

# Levantar Postgres local
docker compose up -d postgres

# Aplicar migraciones (si arrancás cold)
cd apps/api && pnpm prisma migrate deploy && cd ../..

# Seed inicial (5 users, password dev12345)
cd apps/api && pnpm prisma db seed && cd ../..

# Dev de todas las apps en paralelo (Next.js apps + API)
pnpm dev

# O solo API + Admin
pnpm -F @pos-tercos/api dev   # localhost:3001
pnpm -F @pos-tercos/admin dev # localhost:3004

# KDS Flutter (requiere Flutter SDK + emulador Android o device físico)
# cd apps/kds-flutter && flutter run

# Validar antes de cada commit
pnpm typecheck     # todos los packages TypeScript
pnpm lint          # eslint funcional (sin ignoreDuringBuilds)
```

**Users seed:**
- `dueno@dev.local` / `dev12345` (acceso total)
- `admin@dev.local` / `dev12345`
- `cajero@dev.local` / `dev12345`
- `cocinero@dev.local` / `dev12345`
- `atencion@dev.local` / `dev12345`

> En v2 no existe usuario `repartidor@dev.local` (rol REPARTIDOR eliminado del enum).

**OpenWA en dev:**
- Sin las vars `OPENWA_*`, el backend usa `MockWhatsAppAdapter` — loggea los mensajes a consola, no envía nada. Las transiciones de negocio funcionan igual.
- Para probar envío real: seguir `openwa-setup.md` y configurar `OPENWA_URL`, `OPENWA_API_KEY`, `OPENWA_SESSION_ID` en `apps/api/.env.local`.

---

## 13. Próxima tarea sugerida

**v1 lista para desplegar.** FASES 0-9 + 11-15 cerradas. Solo queda FASE 10 (repartidor propio) que está diferida hasta que el dueño quiera operar delivery in-house.

**Para inaugurar:** seguir `deploy.md` checklist completo:
1. Crear servicios en Railway (api + Postgres) y Vercel (5 frontends).
2. Configurar DNS Cloudflare con 8 records.
3. Comprar hardware: tablets POS/KDS, impresora Epson TM-T20III, cajón monedero, Raspberry Pi 4.
4. Setear todas las env vars (`deploy.md §1.2` y `§2.1`).
5. Aplicar migrations en prod (`prisma migrate deploy` corre en start command de Railway).
6. Smoke test 8 pasos (`deploy.md §6`).
7. Backup Postgres con GitHub Actions cron (`deploy.md §7`).

**Variables env críticas (v2):**
- API: `JWT_*`, `WEB_ORDER_TOKEN_SECRET`, `ANTHROPIC_API_KEY`, `STORAGE_PROVIDER=r2` + `R2_*`, `PRINTER_PROVIDER=escpos` + `PRINT_AGENT_URL/SECRET`, `OWNER_WHATSAPP_PHONE`, `BUSINESS_NAME`, `BUSINESS_ADDRESS_SHORT`, `PAYMENT_INSTRUCTIONS_NEQUI/TRANSFER`, `OPENWA_URL`, `OPENWA_API_KEY`, `OPENWA_SESSION_ID`.
- Frontends Next.js: `JWT_ACCESS_SECRET` (POS edge middleware), `API_INTERNAL_URL`, `NEXT_PUBLIC_API_WS_URL`.
- KDS Flutter: `API_BASE_URL`, `WS_URL` en `app_config.dart` (compiladas en el build).
- Print Agent (Pi): `PRINTER_DEVICE=/dev/usb/lp0`, `PRINT_AGENT_PORT=9120`, `PRINT_AGENT_SECRET` (matches API).
- **Eliminadas en v2:** `MAPBOX_TOKEN`, `RESTAURANT_LAT/LNG`, `DELIVERY_RADIUS_KM`, `NEXT_PUBLIC_MAPBOX_TOKEN`. (`NEXT_PUBLIC_BUSINESS_NAME` SIGUE viva en apps/web — layout y checkout la usan; `NEXT_PUBLIC_SITE_URL` también es de apps/web para SEO).

**Operación día a día (post-launch):**
- Backup automático nocturno (GH Actions → R2).
- Logs Railway + Vercel para debug.
- Audit log en `/audit` accesible solo para Dueño.
- Dashboard `/` admin: revenue del día + WoW% + pedidos pendientes + stock crítico.
- Sugerencias IA (`/purchase-suggestions`) — el cron horario detecta low-stock; el Dueño revisa, evalúa con IA si quiere y acepta/rechaza.
- WhatsApp automático vía OpenWA — el backend envía solo. Las instrucciones de pago salen al crear el pedido web; "pago recibido" se dispara en `confirmPayment`; "listo para retirar" lo dispara el cajero con "Marcar listo" (`POST /sales/:id/mark-ready` → `SalesService.markWebReady`). El cajero confirma el pago (`POST /sales/:id/confirm-payment`) cuando valida el comprobante.

**FASE 10 (repartidor): DESCARTADA.** No hay plans de delivery propio en v1.

---

## 14. Pendientes externos (snapshot 2026-05-04)

Documento canónico actualizado: `pendientes-externos-y-deploy.md`. Resumen ejecutivo:

| Item | Estado | Fase | Notas |
|---|---|---|---|
| `.env` local con secrets | ✅ | Hoy | `JWT_*`, `WEB_ORDER_TOKEN_SECRET` listos |
| PIN Admin Operativo dev (`654321`) | ✅ | Hoy | Dueño dev sigue en `123456`, cambiar opcional |
| Cron diario backup Postgres → `~/backups/tercos/` | ✅ | Hoy | 2 AM, gzip; verificar Full Disk Access para `cron` en macOS |
| OpenAI fallback (`OPENAI_API_KEY`) | ⏳ | FASE 4 (ya activa) | Recomendado cargar $5 USD para failover Anthropic |
| Cuenta Mapbox + token | ❌ ELIMINADO v2 | — | Delivery descartado; Mapbox ya no se usa |
| WhatsApp Meta WABA | ❌ DESCARTADO | — | Reemplazado por OpenWA self-hosted (sec 4.10) |
| OpenWA gateway self-hosted | ⏳ | v2 | Seguir `openwa-setup.md`. Requiere VPS o machine local + número WA separado |
| Cloudflare R2 bucket `pos-tercos-prod` | ✅ | FASE 15 | Account ID `7f706ea0b23a5d402bab2ef03602ce15`, Account API Token creado, credenciales en password manager |
| Railway backend | ⏸️ Pausado | FASE 15 | Crear servicios cuando arranque deploy. Eliminar los 5 servicios de prueba creados antes |
| Vercel frontends (Next.js apps) | ⏸️ Pausado | FASE 15 | Admin, POS, web, public-display. KDS Flutter va en Play Store o APK directo. |
| Dominio + DNS Cloudflare | ⏳ | FASE 15 | Recomendado: comprar `tercosburgers.co` en Cloudflare Registrar |
| Hardware local (impresora, cajón, tablet POS, tablet KDS Android, Pi) | ⏳ | FASE 15 | KDS ahora en tablet Android nativa (Flutter). ~$2.5M COP versión económica |
| Print Agent en Raspberry Pi | ⏳ | FASE 15 | Deploy systemd service tras hardware |
| DIAN factura electrónica | ❌ DESCARTADO v1 | — | No aplica hasta superar umbral DIAN o decisión de negocio |
| Pasarela pagos online (Wompi, MP) | ❌ DESCARTADO v1 | — | Flujo Nequi/transfer manual con verificación cajero alcanza |
