# POS Tercos — Guía para Claude Code

## Contexto del proyecto

POS para restaurante de comida rápida en Colombia. 1 punto de venta, 1 cajero por turno.

**Documentos fuente** (leer en este orden si arrancás cold):

1. `pos-spec.v1.md` — alcance v1 cerrado (qué entra, qué no)
2. `architecture.md` — arquitectura técnica completa, modelo de datos, API surface
3. `implementation-plan.md` — fases de implementación local-first (15 fases)
4. `kickoff-plan.md` — pendientes externos (Meta WABA, hardware, contador, etc.)

## Stack

- **Backend:** NestJS + Prisma + PostgreSQL (Railway en prod, Docker en dev)
- **Frontends:** Next.js 15 App Router (Vercel en prod)
- **Monorepo:** Turborepo + pnpm workspaces
- **Auth:** JWT (access 15min memoria + refresh 7d httpOnly cookie)
- **Realtime:** WebSocket (KDS, repartidor, POS) + SSE (pantalla pública)
- **IA:** Anthropic Claude Haiku 4.5 (primario) + OpenAI GPT-4o-mini (fallback)
- **WhatsApp:** Cloud API oficial Meta (mock en dev hasta aprobación)
- **Mapas:** Mapbox (geocoding + autocomplete + maps GL)
- **Storage:** Cloudflare R2 en prod, filesystem local en dev

## Apps planeadas

| App | Path | Rol |
|---|---|---|
| API | `apps/api` | NestJS backend |
| POS Cajero | `apps/pos` | Next.js PWA |
| KDS Cocina | `apps/kds` | Next.js PWA |
| Pantalla Pública | `apps/public-display` | Next.js + SSE |
| Web Pública | `apps/web` | Next.js |
| Admin | `apps/admin` | Next.js |
| Repartidor | `apps/repa` | Next.js PWA mobile |
| Print Agent | `apps/print-agent` | Node service local (impresora ESC/POS) |

## Packages compartidos

| Package | Path | Contenido |
|---|---|---|
| Types | `packages/types` | Schemas Zod + tipos TS compartidos |
| Domain | `packages/domain` | Lógica pura (`expandRecipe`, motor pricing, conversiones, prompts LLM) |
| UI | `packages/ui` | Componentes shadcn/ui compartidos |

## Reglas de código

- **TypeScript strict** en todo el monorepo.
- **Zod** como single source of truth de validación. Backend infiere desde Zod.
- **Prisma** como ORM. Una migration por feature, revisable.
- **Idempotency keys** obligatorias en endpoints POST que crean recursos críticos (ventas, movimientos de inventario, confirmaciones).
- **Audit log inmutable** para acciones sensibles (anulaciones, descuentos, ajustes inv, apertura cajón sin venta, edición de receta/precio).
- **Comentarios mínimos**. Solo cuando el "por qué" no es evidente. Nunca describir el "qué" del código.
- **Adapter pattern obligatorio** para WhatsApp, IA, pagos, billing, delivery aggregator.

## Anti-spaghetti — Reglas estrictas de organización

> Estas reglas son OBLIGATORIAS desde FASE 1. Cualquier código nuevo debe respetarlas. Si una regla parece imposible de cumplir, parar y discutir antes de violarla.

### Backend (`apps/api`) — Estructura por dominio

Cada dominio del negocio es un **módulo NestJS independiente** en `apps/api/src/<dominio>/`. La estructura interna es siempre la misma:

```
apps/api/src/<dominio>/
├── <dominio>.module.ts        # NestJS module declaration (imports, providers, controllers, exports)
├── <dominio>.controller.ts    # SOLO routing: recibe request, llama service, retorna response. NUNCA lógica.
├── <dominio>.service.ts       # Toda la lógica de negocio del dominio. Inyecta otros services.
├── dto/
│   ├── create-<x>.dto.ts      # Zod schemas + tipos inferidos importados de @pos-tercos/types
│   └── update-<x>.dto.ts
├── guards/                    # Guards específicos del dominio (si aplica)
└── <dominio>.service.spec.ts  # Unit tests del service
```

**Dominios planeados (un módulo c/u):** `auth`, `users`, `products`, `recipes`, `inventory`, `suppliers`, `invoices`, `sales`, `kds`, `delivery`, `shifts`, `audit`, `promotions`, `purchase-suggestions`, `reports`, `workers`, `whatsapp`, `prisma` (shared).

**Reglas obligatorias backend:**

- ❌ **NUNCA** importar `PrismaService` en un controller. Solo en services.
- ❌ **NUNCA** poner lógica de negocio en controllers. Controller = parsear input + llamar service + serializar output.
- ❌ **NUNCA** acceder a entidades de otro dominio directamente con Prisma. Si `sales.service` necesita un `product`, lo pide al `products.service` inyectado.
- ❌ **NUNCA** hacer side-effects desde un getter (ej. en una query que cambia estado).
- ❌ **NUNCA** mezclar lógica de adapters externos (WhatsApp, IA) con lógica de dominio. Los adapters viven en `apps/api/src/adapters/<provider>/` detrás de interfaces de `@pos-tercos/types`.
- ✅ **SIEMPRE** validar input con Zod en controllers via `@nestjs/zod` o pipe propio.
- ✅ **SIEMPRE** retornar DTOs explícitos (no entidades Prisma crudas) — define `<X>Response` schema en `@pos-tercos/types`.
- ✅ **SIEMPRE** propagar `Idempotency-Key` cuando aplique al endpoint.
- ✅ **SIEMPRE** registrar acciones sensibles en `AuditService.log(...)` desde el service.
- ✅ Tests: cada service tiene su `.spec.ts` con casos de happy path + edge cases.

### Frontend (`apps/<next>`) — Estructura por feature

Cada Next.js app sigue **feature-based folder structure**. Las páginas (`app/`) son thin — la lógica vive en `features/`.

```
apps/<app>/src/
├── app/                       # Solo Next.js App Router pages + layouts. Pages thin.
│   └── <route>/
│       └── page.tsx           # Composición de features. SIN lógica.
├── features/<feature>/        # Lógica del feature (ej. checkout, kds-board, sales-panel)
│   ├── components/            # Componentes específicos de ese feature
│   ├── hooks/                 # Custom hooks
│   ├── api/                   # Calls al backend (fetch wrappers tipados)
│   ├── types.ts               # Tipos locales del feature (cuando no aplica @pos-tercos/types)
│   └── index.ts               # Barrel export controlado
├── lib/                       # Utilidades transversales (formatters, http client, etc.)
└── styles/                    # Estilos globales
```

**Reglas obligatorias frontend:**

- ❌ **NUNCA** poner lógica de negocio en componentes. Va en `features/<x>/hooks/` o servicios del backend.
- ❌ **NUNCA** hacer `fetch()` directo en un componente. Pasar por `features/<x>/api/`.
- ❌ **NUNCA** importar de `app/<route>/...` desde otro lugar. Las pages son consumers, no dependencias.
- ❌ **NUNCA** marcar `'use client'` sin necesidad real. Server Components por defecto.
- ❌ **NUNCA** importar de un feature ajeno por path interno. Solo a través de su `index.ts` (barrel).
- ✅ **SIEMPRE** componentes <200 líneas. Si crece, partir.
- ✅ **SIEMPRE** importar tipos de `@pos-tercos/types` cuando hay contrato compartido con backend.
- ✅ **SIEMPRE** usar `@pos-tercos/ui` para componentes visuales reusables. Si el componente es local al feature, vive en `features/<x>/components/`.

### Packages compartidos — qué entra en cada uno

| Package | SOLO entra | NUNCA entra |
|---|---|---|
| `@pos-tercos/types` | Zod schemas, tipos inferidos, enums compartidos | Lógica, IO, deps de runtime pesadas |
| `@pos-tercos/domain` | Funciones puras: `expandRecipe`, motor pricing, conversiones unidades, cálculo Haversine, prompts LLM | IO, llamadas HTTP, acceso DB, side-effects |
| `@pos-tercos/ui` | Componentes visuales puros | Lógica de negocio, calls al backend, estado global |

### Naming

- **Filenames:** `kebab-case` (`sales.service.ts`, `expand-recipe.ts`).
- **Components React:** `PascalCase` (`SalesPanel.tsx`). Filename igual: `SalesPanel.tsx`.
- **Functions/vars:** `camelCase`.
- **Constants top-level:** `SCREAMING_SNAKE`.
- **Zod schemas:** sufijo `Schema` (`CreateSaleSchema`).
- **Tipos inferidos:** sin sufijo (`type CreateSale = z.infer<typeof CreateSaleSchema>`).
- **Servicios NestJS:** sufijo `Service`. Controllers: sufijo `Controller`.

### Forbidden globalmente

- ❌ Funciones >50 líneas (refactor obligatorio).
- ❌ Archivos `utils.ts` que se vuelvan basurero. Si un util tiene nombre genérico ("helpers"), va a un módulo específico.
- ❌ Importaciones cíclicas entre packages (validar en review).
- ❌ "God modules": módulo NestJS con +5 controllers o +10 services. Partir antes.
- ❌ Estado global compartido entre features (Zustand store gigante). Cada feature tiene su propio store si lo necesita.
- ❌ `any` sin justificación documentada en comentario.
- ❌ Magic numbers. Constantes con nombre.

### Cómo validar antes de cada commit

```bash
pnpm lint        # eslint clean
pnpm typecheck   # tsc clean
pnpm test        # tests passing (cuando haya)
```

Cualquier commit que rompa una de estas debe revertirse o arreglarse antes del push.

## Convenciones

- **Commits:** convencional commits (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`).
- **Mensajes en español o inglés** — consistencia dentro del commit.
- **Tests:** jest unit en `apps/api`, supertest e2e para endpoints críticos. Vitest en frontend si aplica.

## Skills de Claude Code instaladas en este proyecto

Project-scoped en `.claude/skills/`. Activan al reiniciar Claude Code.

| Skill | Cuándo invocarla |
|---|---|
| `ui-ux-pro-max` | Cualquier decisión de UI: design system, color, tipografía, layout, accesibilidad, refactor visual de componentes. Aplica al armar pantallas de POS, KDS, Admin, Web, etc. |
| `vercel-react-best-practices` | Antes de mergear cualquier código React/Next.js: 70 reglas de performance de Vercel (memo, suspense, bundle, fetch, etc.). |
| `find-skills` | Si aparece una necesidad de tooling (linting nuevo, generador, etc.) y dudás si existe skill que la cubra. |

## NO hacer sin preguntarme

- Cambiar el alcance de v1 (definido en `pos-spec.v1.md`).
- Borrar migraciones aplicadas en producción.
- Tocar variables de entorno de producción.
- Aplicar migraciones a Railway directamente sin revisar.
- Agregar dependencias nuevas pesadas (>50KB minified) sin justificar.
- Codear features completas sin partir en submódulos verificables.
- Usar APIs externas reales en dev (ej. Meta WhatsApp real, R2 real) — siempre por mock primero.

## Sprint actual

> Editar al inicio de cada fase con la fase vigente y los checkpoints.

**FASE 0 — Setup base (✅ COMPLETADA)**

- [x] 0.1 Monorepo Turborepo + pnpm workspaces
- [x] 0.2 NestJS api + Prisma + Postgres en Docker (`/healthz` con DB ping)
- [x] 0.3 Next.js apps placeholder (web, pos, kds, admin, public-display, repa)
- [x] 0.4 `packages/types` (Zod queda para FASE 1)
- [x] 0.5 `packages/ui` con `Button` (cva + clsx + tailwind-merge), validado en admin
- [x] 0.6 `packages/domain` (placeholder)
- [x] 0.7 Prettier + ESLint 9 flat config (typescript-eslint), `pnpm lint` clean
- [x] 0.8 GitHub repo privado pushed → https://github.com/cristianvelezq1551/pos-tercos
- [x] 0.9 `CLAUDE.md` raíz

**Verificación FASE 0:**
- `pnpm typecheck` → 10 packages OK
- `pnpm lint` → 0 errores 0 warnings
- `docker compose up -d postgres` + `cd apps/api && pnpm dev` → `curl localhost:3001/healthz` → `{"status":"ok","checks":{"db":"ok"}}`
- `cd apps/admin && pnpm dev` → `localhost:3004` renderiza placeholder + 4 buttons importados de `@pos-tercos/ui`

**FASE 2 — Catálogo (productos / subproductos / insumos / recetas) · en curso**

- [x] 2.1 Schema Prisma + 11 CHECK constraints
- [x] 2.2 Migration `catalog_recipe_tree`
- [x] 2.3 CRUD endpoints (4 módulos: ingredients, subproducts, products, recipes)
- [x] 2.4 `expandRecipe` puro en `@pos-tercos/domain` con detección de ciclos + max depth
- [ ] 2.5 UI Admin productos
- [ ] 2.6 UI Admin editor de receta (árbol)
- [ ] 2.7 UI Admin subproductos
- [x] 2.8 UI Admin insumos (lista + crear + editar + desactivar)
- [x] 2.9 Endpoint `GET /products/:id/expanded-cost`

**Admin shell construido en esta tanda (canónico para el resto de pantallas):**
```
apps/admin/src/
├── app/
│   ├── layout.tsx (root, sin shell)
│   ├── login/page.tsx (sin shell)
│   ├── unauthorized/page.tsx (sin shell)
│   └── (authenticated)/                     ← route group
│       ├── layout.tsx                       ← envuelve con AdminShell
│       ├── page.tsx                         ← dashboard + 4 stat cards
│       └── ingredients/
│           ├── page.tsx                     ← lista (Server Component)
│           ├── new/page.tsx                 ← crear (form client)
│           └── [id]/page.tsx                ← editar (form client + initial data SSR)
├── components/
│   ├── AdminShell.tsx                       ← sidebar + topbar wrapper
│   ├── AdminSidebar.tsx                     ← nav agrupada por sección
│   └── AdminTopbar.tsx                      ← user avatar + logout
├── features/auth/                           ← FASE 1
├── features/ingredients/
│   ├── api/client.ts                        ← fetch wrappers tipados con Zod parse
│   ├── components/IngredientsTable.tsx      ← table + empty state
│   ├── components/IngredientForm.tsx        ← create + edit + deactivate
│   └── index.ts                             ← barrel
└── lib/
    ├── api-server.ts                        ← serverFetchJson + ApiError
    └── auth-config.ts (FASE 1)
```

**Design system aplicado (decisión + skill ui-ux-pro-max):**
- Light theme por default
- Sidebar fijo 240px en desktop, oculto en <1024px
- Color primary: blue-600 / Stock crítico: amber-600 / Destructive: red-600 / Success: green-600
- Tablas: light borders, hover row, no zebra, `tabular-nums` en columnas numéricas
- Empty state explícito en lista vacía con CTA

**Endpoints disponibles:**
- `GET/POST/PATCH/DELETE /ingredients` (admin para writes)
- `GET/POST/PATCH/DELETE /subproducts`
- `GET/POST/PATCH/DELETE /products`
- `GET/PUT /products/:id/recipe`
- `GET/PUT /subproducts/:id/recipe`
- `GET /products/:id/expanded-cost`

**Verificación e2e (flujo Hamburguesa Nashville → pollo cocido → pollo crudo + sal):**
Para 1 hamburguesa con `quantityNeta=1000g pollo, mermaPct=5%, yield=7`:
- Pollo crudo: `1000/(1-0.05)/7 = 150.376g` ✅
- Sal: `5/0.95/7 = 0.752g` ✅
- Cycle prevention (subproducto se referencia) → 400 ✅
- RBAC (cajero crear ingredient) → 403 ✅

**Verificación 2.1+2.2:**
- 10 tablas en DB: users, refresh_tokens, products, product_sizes, product_modifiers, combo_components, subproducts, ingredients, recipe_edges, _prisma_migrations
- 5 CHECK constraints en recipe_edges + constraints en products, ingredients, subproducts, combo_components
- INSERT de datos inválidos rechazados con error claro (5/5 tests)
- `pnpm typecheck` 12/12 OK
- `pnpm lint` clean

---

**FASE 1 — Auth y roles (✅ COMPLETADA)**

- [x] 1.1 Schema Prisma `users` + `refresh_tokens` + enums `UserRole`, `RepartidorAvailability`
- [x] 1.2 Migration inicial `init_users_auth`
- [x] 1.3 Endpoints `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/me`
- [x] 1.4 JWT access 15min en cookie+Bearer + refresh 7d en httpOnly cookie con rotación
- [x] 1.5 Guards `JwtAuthGuard` (Bearer o cookie), `RolesGuard` registrados como APP_GUARD globales
- [x] 1.6 Decoradores `@Public`, `@Roles`, `@OnlyDueno`, `@AdminAccess`, `@CashierAccess`, `@CurrentUser`
- [x] 1.7 Seed con 6 users (1 por rol), password dev: `dev12345`
- [x] 1.8 Login UI común en `packages/ui` (LoginForm + Input + Label primitivos)
- [x] 1.9 Middleware Next.js (Edge runtime) verifica JWT + rol con `jose`. Cableado en `apps/admin` (canónico). Las otras 5 apps replicarán cuando llegue su FASE.

**Verificación FASE 1 backend (curl):**
- POST /auth/login con `dueno@dev.local`/`dev12345` → 200 con `accessToken` + cookies `pos_access` y `pos_refresh`
- GET /auth/me sin token → 401
- GET /auth/me con Bearer o con cookie → user payload
- POST /auth/refresh con cookie → nuevo access (rotación de refresh)
- POST /auth/logout → 204 + cookies cleared
- POST /auth/refresh tras logout → 401

**Verificación FASE 1 frontend (admin localhost:3004):**
- `GET /` sin cookie → 307 redirect a `/login`
- `/login` renderiza `<LoginForm />` de `@pos-tercos/ui`
- POST `/api/auth/login` (proxy a la api via `next.config rewrites`) setea las 2 cookies httpOnly
- `/` con cookies de DUENO → 200 con info de sesión + botón Cerrar sesión
- `/` con cookies de CAJERO (rol no permitido en admin) → 307 a `/unauthorized`
- `/unauthorized` muestra mensaje de acceso denegado

**Patrón frontend (anti-spaghetti) cableado en `apps/admin`, replicable en las otras 5 apps:**
```
apps/admin/src/
├── app/
│   ├── login/page.tsx                ← thin Suspense + LoginScreen
│   ├── unauthorized/page.tsx
│   └── page.tsx                      ← Server Component, getCurrentUserServer()
├── features/auth/
│   ├── api/{login,me,logout}.ts      ← fetch wrappers tipados (Zod parse)
│   ├── components/LoginScreen.tsx    ← 'use client', usa LoginForm de UI
│   ├── components/LogoutButton.tsx
│   ├── server.ts                     ← getCurrentUserServer() para SSR
│   └── index.ts                      ← barrel
├── lib/auth-config.ts                ← ADMIN_ALLOWED_ROLES = [ADMIN_OPERATIVO, DUENO]
├── middleware.ts                     ← jose JWT verify + role check (Edge runtime)
└── next.config.ts                    ← rewrite /api/* → http://localhost:3001/*
```

**Estructura backend siguiendo reglas anti-spaghetti:**
```
apps/api/src/
├── auth/
│   ├── auth.module.ts / auth.controller.ts / auth.service.ts
│   ├── decorators/{public,roles,current-user}.decorator.ts
│   ├── guards/{jwt-auth,roles}.guard.ts
│   └── dto/login.dto.ts
├── users/users.{module,service}.ts
├── prisma/prisma.{module,service}.ts (global)
├── common/zod-validation.pipe.ts
└── health/health.controller.ts (uses @Public)
```

## Cómo arrancar

```bash
# Instalar dependencias
pnpm install

# Levantar Postgres local
docker compose up -d postgres

# Dev de todas las apps en paralelo
pnpm dev

# Tests
pnpm test
```
