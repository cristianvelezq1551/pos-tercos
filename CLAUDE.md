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
- **WhatsApp:** Cloud API oficial Meta (mock en dev hasta aprobación) — pendiente FASE 9
- **Mapas:** Mapbox (geocoding + autocomplete + maps GL) — pendiente FASE 7
- **Storage:** Cloudflare R2 en prod, filesystem local en dev (`./tmp/uploads/...`)

---

## 2. Apps y packages

### Apps

| App | Path | Rol | Estado |
|---|---|---|---|
| API | `apps/api` | NestJS backend | FASE 0-7 + 11 backend ✅ |
| Admin | `apps/admin` | Next.js — gestión catálogo / inventario / facturas / auditoría / turnos / reportes | FASE 0-4 + 11 UI ✅ |
| POS Cajero | `apps/pos` | Next.js PWA — venta + drawer pedidos web + cierre turno + cambiar PIN | FASE 5.E + 7.E + 11 UI ✅ |
| KDS Cocina | `apps/kds` | Next.js PWA — comanda cocina | FASE 6.C UI ✅ |
| Pantalla Pública | `apps/public-display` | Next.js + SSE — orden listo | FASE 6.D UI ✅ |
| Web Pública | `apps/web` | Next.js — menú + checkout pickup/delivery + status tracking | FASE 7.C-D UI ✅ |
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

**Dominios vivos hoy:** `auth`, `users`, `prisma`, `health`, `ingredients`, `subproducts`, `products`, `recipes`, `inventory`, `audit`, `suppliers`, `invoices`, `adapters/llm`, `adapters/storage`, `common`.

**Dominios pendientes:** `sales`, `kds`, `delivery`, `shifts`, `promotions`, `purchase-suggestions`, `reports`, `workers`, `whatsapp`.

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

---

## 5. Schema DB (24 tablas + 10 enums + 1 sequence)

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
- `PromotionType` (FASE 5) — PERCENT_OFF, BOGO, FIXED_OFF, COMBO_OFF (v1 solo PERCENT_OFF)

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
20. `promotions` (FASE 5) — discount_pct [0..1), days_of_week_mask 1..127, time_start/end HH:MM:SS validado por regex
21. `promotion_products` (FASE 5) — N:M, PRIMARY KEY composite
22. `idempotency_keys` (FASE 5) — cache de respuestas para POSTs idempotentes, TTL 7d
23. `approval_pins` (FASE 5) — PIN hash por usuario; trigger valida que role IN (ADMIN_OPERATIVO, DUENO)
24. `_prisma_migrations`

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

### Commits en `main` (62 hasta hoy)

```
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

### Pendientes — FASES 8, 9, 10, 12, 13, 14, 15

Numeración canónica desde `fase5e-y-pendientes.md` sec 3:

- **FASE 8** — Mapbox + validación 3km: geocoding + autocomplete address + cálculo de distancia haversine + bloqueo > 3km.
- **FASE 9** — WhatsApp con Mock + Dev Inbox: adapter Meta Cloud API + `apps/api/tmp/whatsapp/` mock log + dashboard inbox.
- **FASE 10** — Repartidor (DIFERIDA por decisión del usuario): `apps/repa`, asignación, GPS captura, transitions delivery.
- **FASE 12** — Auto-pedido IA + Promociones avanzadas (UI completa).
- **FASE 13** — Reportes y Dashboard.
- **FASE 14** — Trabajadores RRHH ligero (asistencia, comisiones) + persistencia de reconciliation reports.
- **FASE 15** — PWA + offline + hardening final + Print Agent ESC/POS local.

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

FASE 4 ajustes + FASE 11 cerradas. **Próximo: FASE 8 — Mapbox + validación 3km.**

Per `pendientes-externos-y-deploy.md` el orden de fases pendientes (sin app de domiciliario por decisión del usuario) es: **8 → 12 → 9 → 13 → 14 → 15 → 10 (diferida)**.

Plan FASE 8 completo en `fase5e-y-pendientes.md` sec 3.3. Resumen:
- Adapter `MapsProvider` interface en `@pos-tercos/domain` con `geocode(address) → {lat,lng}` y `reverseGeocode(lat,lng) → address`. Implementación `MapboxMapsAdapter` en `apps/api/src/adapters/maps/`. `MOCK` adapter para tests sin token.
- Función pura `haversine(lat1,lng1,lat2,lng2): km` en `@pos-tercos/domain/geo/`. Constantes `RESTAURANT_LAT/LNG/RADIUS_KM` desde env.
- Endpoint público `GET /web/geocode?address=` con throttle agresivo (10/60s) — devuelve `{lat,lng,formattedAddress, withinDeliveryRadius}`.
- `CreateWebOrderSchema` extiende: si `type=WEB_DELIVERY`, requiere `deliveryLat` + `deliveryLng` además del address. Backend valida 3km vía haversine antes de crear el sale; rechaza con 400.
- `apps/web/checkout` UX: agregar `MapboxAutocomplete` que llama `/web/geocode` on-blur, banner verde/amber si está/no en zona.
- Decisiones a confirmar antes de 8.A:
  - Mapbox vs Google Places (recomiendo Mapbox por free tier y SDK liviano).
  - Manejo de fuera-de-zona en checkout: bloquear submit o ofrecer pickup como fallback?
  - Geocode rate limit: por IP o por sesión (cookie temporal sin auth)?
  - Mock dev: JSONs de direcciones fake o adapter "always-success"?

---

## 14. Pendientes externos (kickoff-plan)

- Aprobación Meta WABA (WhatsApp Business). Mock vigente en dev.
- Compra hardware (impresoras térmicas, lector códigos, tablets KDS).
- Onboarding contador (DIAN, facturación electrónica si aplica).
- Cuenta Cloudflare R2 para prod.
- Cuenta Mapbox (token público + secret).
- Decisión proveedor pagos (Wompi, Mercado Pago, etc.) para FASE 5+.
