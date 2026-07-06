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
7. `openwa-setup.md` — guía para levantar el gateway OpenWA self-hosted
8. `probar-backend-sin-apps.md` — flujo para testear el backend (venta web + WhatsApp) sin abrir las apps

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
| POS Cajero | `apps/pos` | Next.js PWA (manifest + SW offline) — venta + drawer pedidos web (con "Marcar listo") + cierre turno | FASE 5.E + 7.E + 11 + 15.D UI ✅ |
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

### Promociones (FASE 5.C + 12.B)
- `GET /promotions[?only_active=true]` — Cajero+ leen para tachados POS; Admin/Dueño escriben.
- `GET /promotions/:id` — Cajero+
- `POST /promotions` — Admin/Dueño. Body `CreatePromotion` validado por `superRefine` per-type (PERCENT_OFF, FIXED_OFF, BOGO, COMBO_OFF). CHECK constraints DB defensivos (`chk_promo_pct/fixed/bogo/combo`).
- `PATCH /promotions/:id` — Admin/Dueño. Solo permite cambiar campos meta (name, days, time, dates, isActive, productIds). Campos per-tipo son inmutables.
- `DELETE /promotions/:id` — Admin/Dueño. Soft delete (isActive=false).

### Sugerencias de compra (FASE 12.C-12.D)
- `GET /purchase-suggestions[?status=&limit=]` — Admin/Dueño. `status` acepta CSV (`PENDING,EVALUATED`).
- `GET /purchase-suggestions/:id` — Admin/Dueño.
- `POST /purchase-suggestions/:id/accept` — Admin/Dueño. Body `{note?: string}`. Solo desde PENDING/EVALUATED.
- `POST /purchase-suggestions/:id/reject` — Admin/Dueño. Body `{note?: string}`.
- `POST /purchase-suggestions/:id/evaluate` — Dueño-only. LLM (Anthropic Haiku 4.5 primary, OpenAI fallback) escribe `llmRationale` + `llmModel`. Cuesta ~$0.0001/eval.
- `POST /purchase-suggestions/admin/scan` — Dueño-only. Trigger manual del scan horario.
- `POST /purchase-suggestions/admin/evaluate-all-pending` — Dueño-only. Batch sobre PENDING.
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

### B.4b sigue DIFERIDA

La apertura de caja offline NO se implementó: respeta la decisión documentada en `offline-fase-b.md` (2026-05-24). Condición para retomarla: verificar el núcleo offline en build de producción y/o que el negocio realmente arranque jornadas sin internet.

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
- `openShift` sin red: mensaje claro (apertura offline sigue DIFERIDA — B.4b).

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
- **WEB_PICKUP:** `PENDIENTE_PAGO → PAGADO → LISTO_DESPACHO` (terminal). El cajero marca **"Marcar listo para retirar"** desde el modal de Pedidos web → `POST /sales/:id/mark-ready` (`SalesService.markWebReady`, TOCTOU-safe) → dispara el WhatsApp `pickup_ready`. **Listo = fin** (no hay "Entregar"/ENTREGADO en el flujo web nuevo).

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
- `runLedgerFifo` registra los draws de cada cortesía (`sourceType='cortesia'`) y los movimientos `cortesia_reversal` (delta>0) devuelven las unidades con su costo ORIGINAL (reverso FIFO, helper `returnDraws` compartido con el void de ventas) + netean `cortesia`/`cortesiaCostBySource`. Sin lotes fantasma (el faltante NO se re-inyecta — el replay cubre toda la historia).

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
