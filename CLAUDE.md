# POS Tercos — Guía para Claude Code

> **Documento canónico de estado.** Cualquier nuevo contexto/chat debe leer este archivo primero. Refleja todo lo construido y todas las decisiones arquitectónicas que NO se pueden violar.

---

## 0. Contexto del proyecto

POS para restaurante de comida rápida en Colombia. 1 punto de venta, 1 cajero por turno. Solo + Claude Code, target 14–18 semanas, 15 fases local-first.

**Documentos fuente** (leer en este orden si arrancás cold):

1. `CLAUDE.md` (este archivo) — estado vigente, decisiones, módulos vivos
2. `pos-spec.v1.md` — alcance v1 cerrado (qué entra, qué no)
3. `architecture.md` — arquitectura técnica completa, modelo de datos, API surface
4. `implementation-plan.md` — fases de implementación local-first (15 fases)
5. `kickoff-plan.md` — pendientes externos (Meta WABA, hardware, contador, etc.)
6. `testing-guide.md` — checklist e2e ~50 tests sec 1-11 (FASES 0-3)

---

## 1. Stack

- **Backend:** NestJS 11 + Prisma 6 + PostgreSQL 16 (Railway en prod, Docker en dev)
- **Frontends:** Next.js 15 App Router + React 19 + Tailwind v4 (Vercel en prod)
- **Monorepo:** Turborepo + pnpm workspaces
- **Auth:** JWT (access 15min en cookie+Bearer + refresh 7d httpOnly cookie con rotación)
- **Realtime:** WebSocket (KDS, repartidor, POS) + SSE (pantalla pública) — pendiente FASE 5+
- **IA:** Anthropic Claude Haiku 4.5 (primario) + OpenAI GPT-4o-mini (fallback) — vision para facturas
- **WhatsApp:** wa.me semi-automático con tracking — sin backend, sin Meta WABA, sin costo. Ver sec 4.10. Pendiente FASE 9.
- **Mapas:** Mapbox (geocoding + autocomplete + maps GL) — pendiente FASE 7
- **Storage:** Cloudflare R2 en prod, filesystem local en dev (`./tmp/uploads/...`)

---

## 2. Apps y packages

### Apps

| App | Path | Rol | Estado |
|---|---|---|---|
| API | `apps/api` | NestJS backend | FASE 0-9 + 11 + 12 + 13 + 14 backend ✅ |
| Admin | `apps/admin` | Next.js — gestión catálogo / inventario / facturas / auditoría / turnos / reportes (ventas/productos/operación) / promos / sugerencias IA / RRHH | FASE 0-4 + 11 + 12 + 13 + 14 UI ✅ |
| POS Cajero | `apps/pos` | Next.js PWA — venta + drawer pedidos web + WhatsApp wa.me + cierre turno + cambiar PIN | FASE 5.E + 7.E + 9 + 11 UI ✅ |
| KDS Cocina | `apps/kds` | Next.js PWA — comanda cocina + WhatsApp al "Marcar listo" | FASE 6.C + 9 UI ✅ |
| Pantalla Pública | `apps/public-display` | Next.js + SSE — orden listo | FASE 6.D UI ✅ |
| Web Pública | `apps/web` | Next.js — menú + checkout pickup/delivery + status tracking (cajero-driven via WhatsApp) | FASE 7.C-D + 8.B + 9 UI ✅ |
| Repartidor | `apps/repa` | Next.js PWA mobile — domicilios | placeholder |
| Print Agent | `apps/print-agent` | Node service local — ESC/POS | no creado aún |

### Packages compartidos

| Package | Path | Contenido | SOLO entra | NUNCA entra |
|---|---|---|---|---|
| Types | `packages/types` | Schemas Zod + tipos inferidos + enums | Zod, tipos, enums | Lógica, IO, deps pesadas |
| Domain | `packages/domain` | Funciones puras: `expandRecipe`, fuzzy `bestMatch`, prompts LLM, interfaces de adapters | Lógica pura | IO, HTTP, DB, side-effects |
| UI | `packages/ui` | Componentes visuales (Button, Dialog, LoginForm, Input, Label) | Componentes puros | Lógica de negocio, fetch, estado global |

**Build pipeline:**
- `types/` y `domain/` compilan a `dist/` CJS (`pnpm -F @pos-tercos/types build`).
- `ui/` se queda como source y se transpila vía `transpilePackages` en cada `next.config.ts`.
- Turbo con `dependsOn: ["^build"]` garantiza orden.

---

## 3. Reglas de código (OBLIGATORIAS)

### Generales

- **TypeScript strict** en todo el monorepo.
- **Zod** = single source of truth de validación. Backend infiere tipos desde Zod.
- **Prisma** ORM. Una migration por feature, revisable.
- **Idempotency keys** en POST que crean recursos críticos (ventas, movements, confirmaciones).
- **Audit log inmutable** (insert-only via trigger DB) para acciones sensibles.
- **Comentarios mínimos**. Solo "por qué" no evidente, nunca "qué" hace el código.
- **Adapter pattern** OBLIGATORIO para WhatsApp, IA, pagos, billing, delivery aggregator, storage.

### Backend (`apps/api`) — un módulo por dominio

```
apps/api/src/<dominio>/
├── <dominio>.module.ts
├── <dominio>.controller.ts    # SOLO routing. NUNCA lógica.
├── <dominio>.service.ts       # Toda la lógica. Inyecta otros services.
├── dto/                       # DTOs Zod desde @pos-tercos/types
└── <dominio>.service.spec.ts
```

**Dominios vivos hoy:** `auth`, `users`, `prisma`, `health`, `ingredients`, `subproducts`, `products`, `recipes`, `inventory`, `audit`, `suppliers`, `invoices`, `sales`, `kds`, `shifts`, `promotions`, `web-orders`, `web-menu`, `public-display`, `reports`, `purchase-suggestions`, `workers`, `adapters/llm`, `adapters/storage`, `adapters/printer`, `adapters/cash-drawer`, `adapters/maps`, `common`. (WhatsApp wa.me NO crea módulo backend — es helper en `@pos-tercos/domain/whatsapp` + endpoint `POST /sales/:id/whatsapp-clicked` en SalesController.)

**Dominios pendientes:** `delivery`.

**Reglas backend:**
- ❌ NUNCA `PrismaService` en controller. Solo en service.
- ❌ NUNCA lógica de negocio en controller.
- ❌ NUNCA acceder a entidades de otro dominio directamente con Prisma — pedirle al `<X>Service` inyectado.
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
- Detección de ciclos (`RecipeCycleError`) + `MAX_DEPTH = 10`.
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
- En prod se reemplaza por `R2StorageAdapter` (FASE 14).

Inyectado vía token `STORAGE_PROVIDER` en `StorageModule.@Global()`.

### 4.9 Build pipeline

- Cambios en `packages/types` o `packages/domain` requieren `pnpm -F <pkg> build` (o el `^build` lo gatilla turbo).
- `apps/api` levanta en puerto `3001`. `apps/admin` en `3004`. Ambos vía `pnpm dev`.
- En `next.config.ts` rewrites: `/api/* → http://localhost:3001/*` para que el admin cliente pegue cookies httpOnly.

### 4.10 WhatsApp wa.me semi-automático con tracking (decisión 2026-05-04)

**Cambio drástico vs plan original:** se elimina por completo el módulo WhatsApp del backend. NO hay `WhatsAppProvider`, NO hay adapter Meta, NO hay mock dev inbox, NO hay templates aprobadas, NO hay tokens de Meta. Razón: presupuesto del usuario ≤$10 USD/mes, WABA mínimo viable arranca en ~$30 USD/mes.

**Flujo nuevo (todo frontend, cero costo):**

1. **Cliente hace pedido web** → sale queda en `PENDIENTE_PAGO` y aparece en POS drawer marcado como **"Sin aceptar"**.
2. **Cajero presiona "Aceptar y contactar"** en POS drawer:
   - El mismo click ABRE WhatsApp Web (en su computadora) con la conversación al cliente y mensaje pre-llenado pidiendo comprobante.
   - El click registra `POST /sales/:id/whatsapp-clicked?stage=accepted` en backend → audit log.
3. **Cliente envía comprobante por WhatsApp** (foto Nequi/transferencia). El cajero recibe en WhatsApp normal del local.
4. **Cajero verifica comprobante** y presiona **"Confirmar pago"** en POS:
   - Sale pasa a `PAGADO` (flujo actual sin cambios).
   - El mismo click ABRE WhatsApp con mensaje pre-llenado "tu pedido fue confirmado, lo estamos preparando".
   - El click registra `POST /sales/:id/whatsapp-clicked?stage=confirmed`.
5. **Cocinero presiona "Marcar listo"** en KDS:
   - Sale pasa a `LISTO_DESPACHO` (flujo actual sin cambios).
   - El mismo click ABRE WhatsApp con mensaje pre-llenado "tu pedido está listo para retirar".
   - Solo aplica a `WEB_PICKUP`/`WEB_DELIVERY`. Para `COUNTER` no abre nada.
   - Registra `POST /sales/:id/whatsapp-clicked?stage=ready`.

**Reglas duras de la decisión:**
- ❌ NO existe el botón "Avisar cliente" como acción separada — siempre va **acoplado** al click de transición de status (Aceptar / Confirmar pago / Marcar listo). UX casi-obligatoria: para hacer la transición de status, abre WhatsApp como side-effect del mismo click.
- ❌ NO existe el botón "Ya pagué" del cliente en `/checkout/success/[id]` — se elimina porque el flujo es cajero-driven via WhatsApp. El sale arranca esperando "aceptación + contacto WhatsApp" del cajero.
- ✅ El mensaje sale del WhatsApp del comercio hacia el cliente (negocio→cliente, nunca al revés). Cliente puede responder normal (comprobantes, dudas) y le llega al WhatsApp del local.
- ✅ Tracking obligatorio: cada click registra audit log para reportes ("% de pedidos con WhatsApp enviado en cada stage").
- ✅ Operador usa **WhatsApp Web/Desktop en el computador del POS**. El click `target="_blank"` abre `https://wa.me/<phone>?text=<encoded>` en pestaña nueva — WhatsApp Web ya logueado lo intercepta.

**Implementación (cuando lleguemos a FASE 9):**

- Helper puro `@pos-tercos/domain/whatsapp/build-link.ts`:
  - `buildAcceptedLink(sale, businessName)` — pide comprobante.
  - `buildConfirmedLink(sale, businessName)` — confirma pago, va a cocina.
  - `buildReadyLink(sale, businessName, businessAddressShort)` — listo para retirar.
- Endpoint backend: `POST /sales/:id/whatsapp-clicked` body `{stage: 'accepted'|'confirmed'|'ready'}`. Audit `WHATSAPP_LINK_OPENED` con metadata.
- UI cambios:
  - **POS `WebOrdersDrawer`**: pedidos PENDIENTE_PAGO sin click previo de "accepted" muestran badge "Sin aceptar" rojo + botón principal **"Aceptar y contactar"** (en vez del actual "Confirmar pago" directo). Click → llama `whatsapp-clicked?stage=accepted` + abre wa.me en tab nueva.
  - **POS `ConfirmWebPaymentModal`**: al hacer click "Confirmar pago" exitoso, además de cerrar modal y refrescar, llama `whatsapp-clicked?stage=confirmed` + abre wa.me.
  - **KDS `OrderCard`**: botón "Marcar listo" para sales WEB_*, además de transición, llama `whatsapp-clicked?stage=ready` + abre wa.me. Para COUNTER se mantiene igual sin WhatsApp.
- Variable env nueva (opcional): `NEXT_PUBLIC_BUSINESS_ADDRESS_SHORT="Cra 43A # 11-12, Medellín"` — texto que aparece en mensaje "Te esperamos en X".

**Estado actual (2026-05-04, FASE 9 ✅ implementada en `ee4a9f3 1bba4ea 990c9a3 44ed21b`):**

- Helper puro vivo en `@pos-tercos/domain/whatsapp/` con 16/16 tests.
- Endpoint vivo `POST /sales/:id/whatsapp-clicked` (audit-only).
- POS drawer: row con 2 botones "📱 Aceptar y contactar" (emerald) + "Confirmar pago" (ghost).
- POS modal: post-confirm exitoso abre wa.me automático.
- KDS: post `Marcar listo` para WEB_* abre wa.me automático.
- Web checkout/success: botón "Ya pagué" REMOVIDO. Banner blue explica que el local contactará por WA.
- Configurar antes de prod: `NEXT_PUBLIC_BUSINESS_NAME` y opcional `NEXT_PUBLIC_BUSINESS_ADDRESS_SHORT` en `apps/pos/.env.local` y `apps/kds/.env.local`.

**Lo que NO va al sistema:**
- Cron `fifteen-min-warning` queda eliminado de scope (era plan en FASE 9 original).
- Recordatorio post-listo manual: si el dueño quiere implementar después, agrega un botón ad-hoc en KDS o POS, no es parte de este ciclo.

**Por qué tracking sí:** vos quisiste métricas. El audit log responde "¿qué % de pedidos efectivamente recibió WhatsApp?" — útil para detectar cajeros que olvidan hacer click. Reporte va en FASE 13.

---

## 5. Schema DB (28 tablas + 12 enums + 1 sequence)

### Enums Prisma
- `UserRole` — CAJERO, COCINERO, REPARTIDOR, ADMIN_OPERATIVO, DUENO, TRABAJADOR
- `RepartidorAvailability` — DISPONIBLE, OCUPADO, OFFLINE
- `InventoryMovementType` — PURCHASE, SALE, MANUAL_ADJUSTMENT, WASTE, INITIAL
- `StockableType` — INGREDIENT, PRODUCT
- `InvoiceStatus` — PENDING_REVIEW, CONFIRMED, REJECTED
- `SaleType` (FASE 5) — COUNTER, WEB_PICKUP, WEB_DELIVERY
- `SaleStatus` (FASE 5) — PENDIENTE_PAGO, PAGADO, EN_PREPARACION, LISTO_DESPACHO, ASIGNADO, EN_RUTA, ENTREGADO, CANCELADO_NO_PAGO, CANCELADO_SIN_REEMBOLSO, INTENTO_FALLIDO, DEVUELTO, EN_DISPUTA, VOID
- `PaymentMethod` (FASE 5) — CASH, NEQUI, DAVIPLATA, QR_BANCOLOMBIA, TRANSFER
- `ShiftStatus` (FASE 5) — OPEN, CLOSED, RECONCILED
- `PromotionType` (FASE 5 + 12.A) — PERCENT_OFF, BOGO, FIXED_OFF, COMBO_OFF (los 4 implementados en motor + DB + UI)
- `PurchaseSuggestionStatus` (FASE 12.C) — PENDING, EVALUATED, ACCEPTED, REJECTED, STALE
- `WorkerCommissionType` (FASE 14.B) — PERCENT_OF_SHIFT, FIXED_PER_SALE

### Sequences
- `receipt_seq` (FASE 5) — monotónica, default de `sales.receipt_number`. Saltos detectables vía cron.

### Tablas
1. `users`
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
16. `sales` (FASE 5) — receipt_number (default nextval), type, status, totals, payment, cashier, shift, delivery (NULL hasta FASE 7), idempotency_key UNIQUE
17. `sale_items` (FASE 5) — product_id (no polimórfico), size_id NULL, modifiers_json snapshot, applied_promotion_id, line_subtotal/discount/total con CHECK
18. `sale_status_log` (FASE 5) — insert-only via trigger; trazabilidad de cambios de status
19. `shifts` (FASE 5) — apertura completa; cierre + reconciliación quedan para FASE 11
20. `promotions` (FASE 5 + 12.B) — `type` enum + `discount_pct` (NULL para FIXED/BOGO) + `discount_fixed` + `bogo_buy_qty` + `bogo_get_qty` + 4 CHECK constraints per-type defensivos
21. `promotion_products` (FASE 5) — N:M, PRIMARY KEY composite
22. `idempotency_keys` (FASE 5) — cache de respuestas para POSTs idempotentes, TTL 7d
23. `approval_pins` (FASE 5) — PIN hash por usuario; trigger valida que role IN (ADMIN_OPERATIVO, DUENO)
24. `purchase_suggestions` (FASE 12.C) — polimórfico (entity_type + ingredient_id xor product_id), snapshot stock/threshold/qty/cost, `llm_rationale` + `llm_model` + `llm_evaluated_at`, status + resolved_by/at/note, CHECK polimórfico + `suggested_qty > 0`
25. `worker_attendance` (FASE 14.B) — userId + checkIn + checkOut nullable + hoursWorked Decimal calculado, CHECK checkOut > checkIn
26. `worker_commissions` (FASE 14.B) — userId + type enum + percent / fixedAmount + appliedAt, histórico inmutable. CHECK per-type
27. `payment_reconciliations` (FASE 14.D) — snapshot del módulo FASE 11.E con counts + reportJson completo + importedById
28. `_prisma_migrations`

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
- `GET /public-display/state` — `@Public()`, snapshot `{ current, next[≤3], asOf }`. Filtra `type=COUNTER` + ventana 30 min
- `GET /public-display/stream` — `@Public()`, SSE con NestJS `@Sse()`. Reconnect automático nativo del browser (`EventSource`)

### Web pública pedidos (FASE 7)
- `GET /web/menu` — `@Public()`, Throttle 60/60s. `PublicMenuResponse {products, categories, asOf}`. Subset SAFE del producto (sin `lastUnitCost`/`thresholdMin`/`directResale`)
- `POST /web/orders` — `@Public()`, Throttle 30/60s. `CreateWebOrder {type WEB_*, items, customerName, customerPhone (E.164 +57XXXXXXXXXX), deliveryAddress?, notes?}`. Header `Idempotency-Key` opcional. Retorna `{order, token, tokenExpiresAt, paymentInstructions}`. Reusa `SalesService.create` (motor de promos + expandRecipe + idempotency cache). Reglas: WEB_DELIVERY exige `deliveryAddress`; phone E.164 obligatorio.
- `GET /web/orders/:id?token=` — `@Public()`, Throttle 120/60s. `PublicWebOrder` (subset sin paymentMethod/cashier/shift/idempotencyKey). Token HMAC SHA256 firmado, TTL 24h, valida `expectedSaleId` match (timing-safe).
- `POST /web/orders/:id/mark-paid?token=` — `@Public()`, Throttle 10/60s. NO cambia status. Audit `SALE_STATUS_CHANGED` con `metadata.stage='customer-paid-claimed'`. Retorna `PublicWebOrder` con `customerPaidAt` poblado.
- `WS /ws/pos` (socket.io, namespace `/ws/pos`, room `pos.web-orders`) — auth tri-modal idéntica a `/ws/kds`. Role gate `CashierAccess`. Eventos: `web-order.created`, `web-order.customer-paid`, `web-order.cancelled` (este último reservado para FASE 9+).
- Confirmación de pago de orden web reusa `POST /sales/:id/confirm-payment` (FASE 5). El cajero hace doble-validación digital normal y el sale pasa a PAGADO.

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

### WhatsApp tracking (FASE 9)
- `POST /sales/:id/whatsapp-clicked` body `{stage: 'accepted' | 'confirmed' | 'ready'}` — Cajero/Cocinero/Admin/Dueño. Audit-only (no cambia status). Coherencia stage↔status: accepted estricto (solo PENDIENTE_PAGO), confirmed permisivo, ready estricto (LISTO_DESPACHO+). Audit `WHATSAPP_LINK_OPENED` con `metadata.{stage, receiptNumber, saleStatus, hasPhone}`.

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

- Light theme. Sidebar fijo 240px desktop, oculto <1024px.
- Primary: blue-600 / Stock crítico: amber-600 / Destructive: red-600 / Success: green-600.
- Tablas: light borders, hover row, no zebra, `tabular-nums` en columnas numéricas.
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

## 7.ter KDS UI vigente (FASE 6.C)

### Rutas

```
/login                                   # roles permitidos: COCINERO, ADMIN_OPERATIVO, DUENO
/unauthorized
/                                        # OrdersGrid (server-fetch initial → WS live)
```

### Estructura

```
apps/kds/src/
├── app/
│   ├── (authenticated)/
│   │   ├── layout.tsx                   # KdsTopbar + main; oscuro (gray-900)
│   │   └── page.tsx                     # SSR: getKitchenQueueServer + getAccessTokenServer en paralelo
│   ├── login/page.tsx
│   └── unauthorized/page.tsx
├── components/KdsTopbar.tsx              # badge rojo "KDS" sobre fondo dark
├── features/auth/                        # replicado de pos + getAccessTokenServer (extra)
├── features/orders/
│   ├── api/{list,transitions}.ts         # GET /kds/orders, POST /:id/start, /ready
│   ├── server.ts                         # getKitchenQueueServer (SSR)
│   ├── hooks/useElapsed.ts               # cronómetro 1s tick, isLate >= 10 min
│   ├── hooks/useKDSSocket.ts             # socket.io-client + auth.token + dedupe + sort por paidAt
│   └── components/{OrderCard,OrdersGrid}.tsx
├── lib/{api-server,auth-config}.ts       # KDS_ALLOWED_ROLES = [COCINERO, ADMIN_OPERATIVO, DUENO]
└── middleware.ts
```

### Decisiones de UX/auth aplicadas

- **Auth WS cross-origin**: cookie httpOnly del POS dominio (:3003) NO se envía cross-origin a la API (:3001). SSR lee la cookie con `getAccessTokenServer()` y la pasa al cliente como prop `wsToken` → `socket.io-client.handshake.auth.token`. Token TTL 15 min — si expira, el WS se desconecta y el badge muestra "Error WS"; reload trae token fresco. (Refresh automático queda como TODO para FASE 14 hardening.)
- Socket conecta directo a `http://localhost:3001/ws/kds` (configurable con `NEXT_PUBLIC_API_WS_URL`). No usa rewrite — Next.js no proxea WebSockets confiable.
- Cards con cronómetro live (1s tick) + ring rojo + ⚠ cuando `elapsed >= 10 min` (escalation visual sin bloqueante).
- Botones grandes h-14 ("Iniciar" azul / "Marcar listo" verde) — pensado para tap en tablet en la cocina.
- ConnectionBadge top-right del grid: `bg-emerald-500` live / `bg-amber-500` connecting / `bg-red-500` error.

---

## 7.5 Web Pública UI vigente (FASE 7.C-D)

### Rutas

```
/                                        # SIN auth, menú + carrito
/checkout                                # form 1-página pickup/delivery
/checkout/success/[id]?token=            # tracking + payment instructions + "ya pagué"
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
│   ├── api/{create-order, get-order, mark-paid}.ts
│   ├── server.ts                         # getWebOrderServer + buildPaymentInstructions (espeja API)
│   └── components/{CheckoutForm, OrderStatusView, OrderStatusPoller (hook), PaymentInstructionsView}.tsx
└── lib/{api-server, format}.ts           # publicFetch + COP Intl
```

### Decisiones de UX aplicadas

- Sin auth, sin login. El cliente es anónimo.
- Carrito en localStorage (`pos-tercos-web-cart`), survive a navigation/reload. Hydration flag para evitar SSR mismatch.
- Checkout 1-página con toggle pickup/delivery (decisión confirmada: simpler que multi-step para 1 mesa, 1 ítem promedio).
- Phone input con prefijo `+57` locked + 10 dígitos (E.164 estricto, alineado con backend).
- Idempotency-Key uuid v4 generado al submit del checkout (no al abrir el modal — el form vive más).
- Token HMAC siempre en URL `?token=`, NO en localStorage. Cliente puede compartir/recuperar URL.
- Status poller cada 5s (NO SSE) — rate-limit holgado (120/60s) y evita conexiones colgadas en pestañas inactivas. Detiene en estados terminales (ENTREGADO, CANCELADO_*, VOID, DEVUELTO, EN_DISPUTA).
- `paymentInstructions` se reconstruye server-side en el web app (lee `NEXT_PUBLIC_PAYMENT_NEQUI/TRANSFER`) — sobrevive a reload, devices distintos, share del URL.
- Banner status tonal: amber pending / blue cooking / emerald ready / gray done / red failed.
- "Ya pagué" deshabilitado tras claim — feedback "esperando verificación del cajero".

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
│   ├── globals.css                       # cursor:none, bg-gray-950, hide scrollbars
│   ├── layout.tsx                        # viewport maximumScale=1, userScalable=false
│   └── page.tsx                          # dynamic='force-dynamic' + SSR fetch initial
└── features/display/
    ├── server.ts                         # getInitialDisplayState (sin auth, fallback EMPTY_STATE)
    ├── hooks/useDisplayStream.ts         # EventSource → reconnect nativo + backoff browser-managed
    └── components/Display.tsx            # current section gigante + next section abajo + ConnectionDot
```

### Decisiones de UX aplicadas

- **Modo kiosko**: `cursor: none`, `overflow: hidden`, viewport sin user-scalable. Pensado para Chrome/Edge en modo kiosko en tablet Android (FASE 14).
- **EventSource > socket.io**: SSE es uno-a-muchos read-only. Reconnect nativo del browser, no requiere lib cliente, sin handshake.
- Bg `gray-950` (casi negro) para alto contraste.
- Empty state amigable: "Estamos preparando tu pedido…" cuando `current === null`.
- ConnectionDot top-right pequeño (debugging visual, no UX): emerald/amber/red.
- Render gigante: `text-9xl md:text-[14rem]` para que se lea desde la entrada del local.

---

## 8. Estado del proyecto (commits y FASES)

### Commits en `main` (86 hasta hoy)

```
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

### FASE 6 — KDS + Pantalla Pública · ✅ COMPLETADA

Particionada en 5 sub-sprints. Plan completo en `fase5e-y-pendientes.md` sec 3.1.

- [x] **6.A backend KDS** (`1b06ffd`): deps `@nestjs/websockets` + `@nestjs/platform-socket.io` + `socket.io`. `packages/types/kds`: `KitchenStatusEnum`, `KitchenOrderSchema` (alias Sale), `KdsEventSchema`, constantes `KDS_NAMESPACE='/ws/kds'` + `KDS_QUEUE_ROOM='kitchen.queue'`. Decorator `KitchenAccess()`. `KdsModule` (forwardRef SalesModule) con: `KdsGateway` (auth tri-modal: handshake.auth.token | Authorization Bearer | cookie pos_access; verify JWT con JwtService; role gate; join room; emit), `KdsService` con `getQueue` (PAGADO + EN_PREPARACION FIFO) + `start`/`ready` (transitions con sale_status_log + audit `SALE_STATUS_CHANGED`), `KdsController` con `GET /kds/orders` + `POST /:id/start` + `POST /:id/ready`. Hook `SalesService.confirmPayment` → `kdsGateway.emit('order.created')`.
- [x] **6.B SSE pantalla pública** (`67dd921`): `packages/types/public-display`: `PublicDisplayOrder` (saleId/receiptNumber/customerName/at — minimal seguro) + `PublicDisplayState` ({current, next[≤3], asOf}). `PublicDisplayModule` `@Global()` sin auth deps. `PublicDisplayService.getState` (current = última transición LISTO_DESPACHO de COUNTER en últimos 30 min vía sale_status_log; next = top 2 PAGADO/EN_PREPARACION FIFO). `notify()` → RxJS Subject; `stream()` con `concat(initial, updates)` emite snapshot completo. `PublicDisplayController` `@Public()` con `GET /state` + `@Sse('/stream')`. Hooks: `confirmPayment` y `KdsService.transition` llaman `publicDisplay.notify()` cuando type=COUNTER.
- [x] **6.C apps/kds UI** (`83c186e`): scaffold replica POS con middleware Edge + `KDS_ALLOWED_ROLES = [COCINERO, ADMIN_OPERATIVO, DUENO]`. Layout dark (gray-900) + KdsTopbar rojo. `features/orders` con `useKDSSocket` (socket.io-client cross-origin :3003→:3001 con `handshake.auth.token` desde SSR), `useElapsed` (1s tick, ⚠ red ring >= 10 min), `OrderCard` con #receipt grande + items + botones h-14 ("Iniciar" azul / "Marcar listo" verde), `OrdersGrid` responsive con ConnectionBadge live.
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

### FASE 8 — Mapbox + validación 3km · ✅ COMPLETADA (2 sub-sprints)

- [x] **8.A** (`0a4b09a`) — backend Mapbox + haversine + 3km validation:
  - `packages/domain/src/maps/`: `MapsProvider` interface + `GeoPoint`/`GeocodeResult` + `haversineKm` puro + `withinRadius`.
  - `apps/api/src/adapters/maps/`: `MapboxMapsAdapter` (real geocoding), `MockMapsAdapter` (deterministic offset por hash, sin token), `MapsModule` `@Global()` con factory auto-fallback (si no hay `MAPBOX_TOKEN` → mock).
  - `WebGeoController` `@Public() Throttle(30/60s)`: `GET /web/geocode?address=` retorna `{lat, lng, formattedAddress, withinDeliveryRadius}`. Restaurant lat/lng + radius desde env (`RESTAURANT_LAT/LNG`, `DELIVERY_RADIUS_KM=3`).
  - `WebOrdersService.create`: si `type=WEB_DELIVERY`, valida `haversineKm(restaurant, delivery) <= radius` antes de crear (rechaza con 400 + mensaje claro).
- [x] **8.B** (`417204d`) — apps/web checkout con autocomplete:
  - `DeliveryAddressInput`: debounced geocode (700ms) + status banners (verde dentro de zona / amber fuera de zona / red error) + CTA "Cambiar a pickup" cuando está fuera.
  - `CheckoutForm`: cuando `type=delivery`, exige geocode válido y dentro de radius antes de submit. Pasa `deliveryLat/Lng` al backend.

  **Decisiones tomadas en FASE 8 (no re-discutir):**
  - Mapbox > Google Places (free tier mejor + SDK liviano). Token público (`pk.`) técnicamente sirve server-side.
  - Manejo fuera-de-zona: bloquear submit + ofrecer pickup como alternativa (banner amber + CTA), no error fatal.
  - Mock dev: deterministic offset por hash del address. Pensado para devs sin token.
  - Cliente del web app NUNCA llama Mapbox directo — siempre vía `/web/geocode` (throttle + auth boundary). Token Mapbox queda solo en backend.

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

### FASE 9 — WhatsApp wa.me semi-automático · ✅ COMPLETADA (4 sub-sprints)

Decisión completa en sec 4.10. Costo $0/mes. Sin Meta WABA, sin backend
que envíe mensajes — el browser del cajero/cocinero abre wa.me deep
links que WhatsApp Web/App ya logueado intercepta.

Touchpoints donde se abre WhatsApp al cliente (3 únicos, todos acoplados
al click de transición de status — sin botones extra):

| Stage | Quién | Trigger | Tipos | Mensaje |
|---|---|---|---|---|
| `accepted` | Cajero (POS drawer) | Click "Aceptar y contactar" | WEB_PICKUP, WEB_DELIVERY | Pide comprobante de pago |
| `confirmed` | Cajero (POS modal) | Post `/sales/:id/confirm-payment` | WEB_PICKUP, WEB_DELIVERY | "Pago verificado ✅, ya está en cocina" |
| `ready` | Cocinero (KDS) | Post `/kds/orders/:id/ready` | WEB_PICKUP, WEB_DELIVERY | Pickup: "listo para retirar en X". Delivery: "salió, llega en ~20 min" |

**No se notifica al cliente en**: COUNTER (cajero entrega en mano),
sale creada (cliente recién la hizo), transiciones intermedias
(EN_PREPARACION, ASIGNADO, EN_RUTA — el cliente las ve en el poller),
cancelaciones (cajero matiza el mensaje manualmente).

- [x] **9.A** (`ee4a9f3`) — Helper puro `@pos-tercos/domain/whatsapp/`:
  - `WhatsAppStage = 'accepted' | 'confirmed' | 'ready'` + `WhatsAppSaleSnapshot` + `WhatsAppBuildOptions` (businessName + businessAddressShort opcional).
  - 3 builders + dispatcher `buildLinkForStage`. Phone normalization (acepta `+57XXX`, `57XXX`, `XXX` 10 dígitos → prepend 57). Greeting solo primer nombre. Format COP minimalista (sin Intl, mantiene domain tree-shakable).
  - PICKUP vs DELIVERY: copy distinto en `ready` (incluye dirección o "salió a entrega ~20 min").
  - 16/16 tests unit pasan.
  - Audit action nuevo: `WHATSAPP_LINK_OPENED`.

- [x] **9.B** (`1bba4ea`) — Endpoint backend `POST /sales/:id/whatsapp-clicked`:
  - Body Zod `{stage}`. Audit-only, no cambia status del sale.
  - Coherencia stage↔status: `accepted` requiere PENDIENTE_PAGO (estricto), `confirmed` permisivo (tolera doble click), `ready` requiere LISTO_DESPACHO+.
  - Roles: CAJERO + COCINERO + ADMIN + DUEÑO en un solo endpoint (no fragmentamos por stage para mantener UI simple).

- [x] **9.C** (`990c9a3`) — UI POS:
  - `apps/pos/.../web-orders/api/whatsapp.ts` — fire-and-forget audit (no bloquea apertura wa.me).
  - `apps/pos/.../web-orders/lib/whatsapp.ts` — `openWhatsAppForSale(sale, stage)` con feedback `{opened, reason}`. `businessName` desde `NEXT_PUBLIC_BUSINESS_NAME`.
  - `WebOrdersDrawer`: row con grid 2 columnas — primary "📱 Aceptar y contactar" (emerald) + secondary "Confirmar pago" (ghost). Hint inline + banner si popup blocked.
  - `ConfirmWebPaymentModal`: post-confirm exitoso llama `openWhatsAppForSale(paid, 'confirmed')`. No bloquea si popup blocked (sale ya pagada).

- [x] **9.D** (`44ed21b`) — KDS + remoción "Ya pagué" del web:
  - `apps/kds/.../orders/lib/whatsapp.ts` — `openWhatsAppReady(sale)` solo para WEB_*. Audit fire-and-forget, no bloquea transición.
  - `OrderCard.handleReady`: post `readyOrder()` llama `openWhatsAppReady(order)`. Click único del cocinero notifica al cliente.
  - `apps/web/.../OrderStatusView`: removido botón "Ya pagué" + input referencia + estado claimed + llamada a `markOrderPaid`. Reemplazado por banner blue "¿Qué sigue? Te contactamos por WhatsApp para pedirte el comprobante".

  **Decisiones tomadas en FASE 9 (no re-discutir):**
  - WhatsApp se abre **acoplado** a transiciones de status (mismo click). Sin botón "Avisar cliente" separado. Si el cajero no quiere mandar mensaje, cierra la tab — no hay penalización.
  - Cliente NO tiene botón "Ya pagué" — el flujo es cajero-driven via WA. Reduce confusión y elimina un estado intermedio (`customerPaidAt` ya no se setea desde web; queda en DB pero nadie lo escribe — eventualmente removible en hardening).
  - `confirmed` tolera doble click sin error (cajero puede re-confirmar y reabrir wa.me con mensaje nuevo). `accepted` y `ready` validan estricto.
  - Audit fire-and-forget desde UI: si falla, igual abre wa.me. La transición de status es lo que importa.
  - `window.open(_blank, noopener,noreferrer)` desde click handler — popup blocker no debería bloquear; si bloquea, banner amber explica al cajero que permita popups.
  - Endpoint `POST /web/orders/:id/mark-paid` queda colgado en el backend pero ya no se llama desde la UI. Mantener disponible (no breaking) pero documentado como deprecated.
  - `customerPaidAt` field y evento WS `web-order.customer-paid` quedan funcionales pero sin escritor. Limpieza queda como TODO menor.

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

### Pendientes — FASES 10, 15

Numeración canónica desde `fase5e-y-pendientes.md` sec 3:

- **FASE 10** — Repartidor (DIFERIDA por decisión del usuario): `apps/repa`, asignación, GPS captura, transitions delivery.
- **FASE 15** — PWA + offline + hardening final + Print Agent ESC/POS local. Incluye: aplicar migrations 14.B y 14.D contra DB de prod (`pnpm prisma migrate deploy`), normalizar `report_json` en `payment_reconciliations` si crece.

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
- Usar APIs externas reales en dev (Meta WhatsApp real, R2 real) — siempre por mock primero.
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

# Seed inicial (6 users, password dev12345)
cd apps/api && pnpm prisma db seed && cd ../..

# Dev de todas las apps en paralelo
pnpm dev

# O solo API + Admin
pnpm -F @pos-tercos/api dev   # localhost:3001
pnpm -F @pos-tercos/admin dev # localhost:3004

# Validar antes de cada commit
pnpm typecheck     # 12/12 packages
pnpm lint
```

**Users seed:**
- `dueno@dev.local` / `dev12345` (acceso total)
- `admin@dev.local` / `dev12345`
- `cajero@dev.local` / `dev12345`
- `cocinero@dev.local` / `dev12345`
- `repartidor@dev.local` / `dev12345`
- `atencion@dev.local` / `dev12345`

---

## 13. Próxima tarea sugerida

FASE 14 cerrada. **Próximo: FASE 15 — PWA + offline + hardening + Print Agent.**

Per `pendientes-externos-y-deploy.md` el orden de fases pendientes (sin app de domiciliario por decisión del usuario) es: **15 → 10 (diferida)**.

Plan FASE 15 (preview):

- **PWA**: agregar `manifest.json` + service worker en POS, KDS, public-display, web. Offline cache para catálogo + última lista de pedidos. Modo kiosko en pantalla pública.
- **Hardware local**: instalar Print Agent (Node service local en :9100) en Raspberry Pi del local. Driver ESC/POS para Epson TM-T20III. Reemplazar `LocalFsPrinterAdapter` por `RaspberryPiPrinterAdapter`. Drawer físico vía RJ-11.
- **Hardening prod**:
  - Aplicar migrations pendientes de FASE 14 (`20260504220000_fase14b_workers`, `20260504220500_fase14d_payment_reconciliations`) contra DB de Railway.
  - Refresh automático de JWT en KDS WS (TODO documentado desde FASE 6).
  - Token Mapbox real con restricciones por dominio (hoy es público sin restricción).
  - R2 bucket production setup + `R2StorageAdapter` reemplaza `LocalFilesystemStorageAdapter`.
  - Cron diario de `IdempotencyService.purgeExpired` validar funciona en prod.
- **Deploy**:
  - Railway: backend + Postgres + R2 wired. Variables env desde `pendientes-externos-y-deploy.md`.
  - Vercel: 5 frontends (admin, pos, kds, public-display, web). Domains custom.
  - DNS Cloudflare: A records, SSL, CDN.

Variables env críticas para revisar antes de prod:
- `NEXT_PUBLIC_BUSINESS_NAME` y `NEXT_PUBLIC_BUSINESS_ADDRESS_SHORT` (apps/pos, apps/kds).
- `RESTAURANT_LAT`, `RESTAURANT_LNG`, `DELIVERY_RADIUS_KM` (apps/api).
- `MAPBOX_TOKEN` (apps/api), `NEXT_PUBLIC_MAPBOX_TOKEN` (apps/web).
- `PAYMENT_INSTRUCTIONS_NEQUI`, `PAYMENT_INSTRUCTIONS_TRANSFER` (apps/api).
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `WEB_ORDER_TOKEN_SECRET` (apps/api).
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` (apps/api).

---

## 14. Pendientes externos (snapshot 2026-05-04)

Documento canónico actualizado: `pendientes-externos-y-deploy.md`. Resumen ejecutivo:

| Item | Estado | Fase | Notas |
|---|---|---|---|
| `.env` local con secrets | ✅ | Hoy | `JWT_*`, `WEB_ORDER_TOKEN_SECRET`, `RESTAURANT_LAT/LNG` listos |
| PIN Admin Operativo dev (`654321`) | ✅ | Hoy | Dueño dev sigue en `123456`, cambiar opcional |
| Cron diario backup Postgres → `~/backups/tercos/` | ✅ | Hoy | 2 AM, gzip; verificar Full Disk Access para `cron` en macOS |
| OpenAI fallback (`OPENAI_API_KEY`) | ⏳ | FASE 4 (ya activa) | Recomendado cargar $5 USD para failover Anthropic |
| Cuenta Mapbox + token público | ✅ | FASE 8 | Token verificado responde Medellín correcto. Variable `NEXT_PUBLIC_MAPBOX_TOKEN` y `MAPBOX_TOKEN` (mismo token, sin secret) |
| WhatsApp Meta WABA | ❌ DESCARTADO | — | Reemplazado por wa.me semi-automático (sec 4.10). Costo $0/mes vs $470k WABA |
| Cloudflare R2 bucket `pos-tercos-prod` | ✅ | FASE 15 | Account ID `7f706ea0b23a5d402bab2ef03602ce15`, Account API Token creado, credenciales en password manager |
| Railway backend | ⏸️ Pausado | FASE 15 | Crear servicios cuando arranque deploy. Eliminar los 5 servicios de prueba creados antes |
| Vercel frontends (5 proyectos) | ⏸️ Pausado | FASE 15 | Crear cuando arranque deploy |
| Dominio + DNS Cloudflare | ⏳ | FASE 15 | Recomendado: comprar `tercosburgers.co` en Cloudflare Registrar |
| Hardware local (impresora, cajón, tablet, Pi) | ⏳ | FASE 15 | Comprar 2-3 sem antes de inaugurar. ~$2.5M COP versión económica |
| Print Agent en Raspberry Pi | ⏳ | FASE 15 | Deploy systemd service tras hardware |
| DIAN factura electrónica | ❌ DESCARTADO v1 | — | No aplica hasta superar umbral DIAN o decisión de negocio |
| Pasarela pagos online (Wompi, MP) | ❌ DESCARTADO v1 | — | Flujo Nequi/transfer manual con verificación cajero alcanza |
