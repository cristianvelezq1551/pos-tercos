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
| API | `apps/api` | NestJS backend | FASE 0-5 backend ✅ |
| Admin | `apps/admin` | Next.js — gestión catálogo / inventario / facturas / auditoría | FASE 0-4 UI ✅ |
| POS Cajero | `apps/pos` | Next.js PWA — venta en mostrador | FASE 5.E UI ✅ |
| KDS Cocina | `apps/kds` | Next.js PWA — comanda cocina | placeholder |
| Pantalla Pública | `apps/public-display` | Next.js + SSE — orden listo | placeholder |
| Web Pública | `apps/web` | Next.js — landing + menú | placeholder |
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

## 8. Estado del proyecto (commits y FASES)

### Commits en `main` (37 hasta hoy)

```
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

### Pendientes — FASES 6 a 15
- **FASE 6** — KDS + pantalla pública: `apps/kds`, `apps/public-display`, WebSocket gateway, SSE, estados pedido, tiempos.
- **FASE 7** — Domicilios + Mapbox + repartidores: `apps/repa`, geocoding, asignación.
- **FASE 8** — Turnos / cierre Z / arqueo.
- **FASE 9** — WhatsApp Cloud API (mock + bot menu + status updates).
- **FASE 10** — Promociones + cupones.
- **FASE 11** — Sugerencias de compra (purchase-suggestions service).
- **FASE 12** — Web pública + SEO + menú.
- **FASE 13** — Reportes (ventas, costos, margen, mermas).
- **FASE 14** — Hardening prod (R2, Railway deploy, Vercel, observability, backups).
- **FASE 15** — Print agent ESC/POS local + integración impresoras térmicas.

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

FASE 5 cerrada. **Próximo: FASE 6 — KDS + pantalla pública.**

Plan completo en `fase5e-y-pendientes.md` sec 3. Resumen:
- `apps/kds` (puerto 3003) — comanda cocina con WebSocket. Lista pedidos en estados `PAGADO` (in queue) → `EN_PREPARACION` → `LISTO_DESPACHO`. Cocinero marca transiciones desde la UI; los eventos llegan en tiempo real a otros KDS y a la pantalla pública.
- `apps/public-display` (puerto 3005) — pantalla TV con SSE. Muestra "Listos para retirar" (ventas con `status=LISTO_DESPACHO` filtradas por `type=COUNTER`) por turno o nombre del cliente.
- Backend nuevo:
  - `KdsModule` con `KdsGateway` (WS namespace `/kds`, auth via cookie/Bearer), endpoints `POST /kds/orders/:id/start` y `POST /kds/orders/:id/ready` (transiciones de status con audit + emit event).
  - `PublicDisplayModule` con SSE controller `GET /public-display/stream` (sin auth, hardening con CORS estricto).
  - Trigger en `confirmPayment` → emit a KDS namespace.
- Decisiones a tomar antes de arrancar 6.A:
  - Auth en WS gateway (cookie httpOnly + handshake check vs token via header).
  - Pantalla pública: `@Public()` + filtros server-side para no exponer info sensible.
  - Reintentos en cliente WS (lib propia o `socket.io-client`).

---

## 14. Pendientes externos (kickoff-plan)

- Aprobación Meta WABA (WhatsApp Business). Mock vigente en dev.
- Compra hardware (impresoras térmicas, lector códigos, tablets KDS).
- Onboarding contador (DIAN, facturación electrónica si aplica).
- Cuenta Cloudflare R2 para prod.
- Cuenta Mapbox (token público + secret).
- Decisión proveedor pagos (Wompi, Mercado Pago, etc.) para FASE 5+.
