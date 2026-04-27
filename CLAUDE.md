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

## Convenciones

- **Commits:** convencional commits (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`).
- **Mensajes en español o inglés** — consistencia dentro del commit.
- **Tests:** jest unit en `apps/api`, supertest e2e para endpoints críticos. Vitest en frontend si aplica.

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

**Próxima: FASE 1 — Auth y roles**

Submódulos previstos:
- [ ] 1.1 Schema Prisma `users` + enum role
- [ ] 1.2 Migration inicial
- [ ] 1.3 Endpoints `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/me`
- [ ] 1.4 JWT (access 15min + refresh 7d httpOnly)
- [ ] 1.5 Guards `JwtAuthGuard`, `RolesGuard`
- [ ] 1.6 Decoradores de rol
- [ ] 1.7 Seed con 1 user por rol
- [ ] 1.8 Login UI común en `packages/ui`
- [ ] 1.9 Middleware Next.js que protege rutas según rol

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
