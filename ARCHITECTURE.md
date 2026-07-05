# Arquitectura — POS Tercos

> Visión arquitectónica del monorepo. Para el estado vivo de cada módulo ver
> `estado-del-sistema.md`; para reglas de código y decisiones canónicas ver `CLAUDE.md`.
>
> ⚠️ **2026-06-27 (CLAUDE.md §7.v10): turnero + KDS ELIMINADOS.** Toda mención de
> `apps/kds-flutter`, `/ws/kds`, la pantalla de turno y el turnero en este doc es
> **histórica**. Hoy: COUNTER termina en PAGADO; el pedido web se marca "listo"
> desde el POS (`/sales/:id/mark-ready`); `apps/public-display` es solo productos
> + publicidad + música; no hay app de cocina (la futura será web).

POS para restaurante de comida rápida en Colombia: 1 punto de venta, 1 cajero por turno,
pedidos web pickup y notificaciones WhatsApp automáticas.

---

## 1. Visión general

Monorepo **Turborepo + pnpm workspaces** con 7 apps y 4 packages compartidos.

| App | Path | Qué es |
|---|---|---|
| API | `apps/api` | Backend NestJS 11 + Prisma 6 + PostgreSQL 16 |
| Admin | `apps/admin` | Next.js — catálogo, inventario, facturas IA, reportes, finanzas, nómina, auditoría |
| POS | `apps/pos` | Next.js PWA offline-first — venta, caja, pedidos web, turnero |
| Web pública | `apps/web` | Next.js — menú + checkout WEB_PICKUP + tracking (sin auth) |
| Pantalla pública | `apps/public-display` | Next.js + SSE — turnero kiosko (sin auth) |
| KDS | `apps/kds-flutter` | Flutter nativo (tablet Android) — comanda de cocina |
| Print Agent | `apps/print-agent` | Node local — impresora ESC/POS Epson + cajón monedero |

| Package | Contenido | Regla |
|---|---|---|
| `packages/types` | Schemas Zod + tipos inferidos + enums | Fuente única de validación. Sin lógica ni IO |
| `packages/domain` | Funciones puras: recetas, FIFO, disponibilidad, promos, recibos, mensajes WA, prompts LLM | Cero IO/HTTP/DB. 100+ tests Vitest |
| `packages/ui` | Componentes visuales (Button, Dialog, LoginForm…) | Sin fetch ni lógica de negocio |
| `packages/brand` | Identidad visual compartida (assets, marca) | Solo estático |

### Diagrama de comunicación

```
            navegadores                              local del negocio
 ┌──────────┬──────────┬──────────┬──────────┐   ┌──────────────────────┐
 │  admin   │   pos    │   web    │ display  │   │  kds-flutter (tablet)│
 │  :3004   │  :3002   │  :3000   │  :3005   │   │  HTTP + WS directo   │
 └────┬─────┴────┬─────┴────┬─────┴────┬─────┘   └──────────┬───────────┘
      │ rewrites Next: /api/* → API    │ SSE                │
      │ (cookies httpOnly)  + WS /ws/pos                    │ /ws/kds
      ▼          ▼          ▼          ▼                    ▼
 ┌─────────────────────────────────────────────────────────────────┐
 │                      apps/api (NestJS :3001)                    │
 │   guards JWT · Zod pipes · services por dominio · crons         │
 └───┬───────────┬───────────────┬─────────────────┬───────────────┘
     │ Prisma    │ HTTP          │ HTTP            │ HTTP (vision)
     ▼           ▼               ▼                 ▼
 PostgreSQL   print-agent    OpenWA gateway    LLM (Anthropic
   16         :9120 local    (WhatsApp         Haiku primario,
              ESC/POS +      self-hosted)      OpenAI fallback)
              cajón RJ-11                      + Storage R2/local
```

- Los frontends Next.js **nunca** llaman al API cross-origin: cada `next.config.ts`
  reescribe `/api/* → API` para que viajen las cookies httpOnly.
- Realtime: socket.io en `/ws/kds` (cocina) y `/ws/pos` (pedidos web al cajero);
  SSE en `/public-display/stream` (turnero, uno-a-muchos sin auth).
- El KDS Flutter no pasa por rewrites: pega HTTP + WS directo al API con
  `handshake.auth.token` (no es browser, no usa cookies).

## 2. Capas y reglas

### Backend — un módulo por dominio (`apps/api/src/<dominio>/`)

```
<dominio>.controller.ts   # SOLO routing + Zod pipe. Nunca lógica ni Prisma.
<dominio>.service.ts      # Toda la lógica. Inyecta otros services (nunca Prisma ajeno).
dto/                      # DTOs Zod desde @pos-tercos/types
```

- Validación de input siempre con Zod en el controller; respuestas con DTOs
  explícitos, nunca entidades Prisma crudas.
- Acciones sensibles registradas vía `AuditService.log(...)` desde el service.
- Dominios vivos: auth, users, catálogo (ingredients/subproducts/products/recipes),
  inventory, sales, kds, shifts, promotions, web-orders, web-menu, public-display,
  reports, purchase-suggestions, workers, fixed-costs, notifications, approvals,
  suppliers, invoices, audit, common y `adapters/*`.

### Frontend — feature-based (`apps/<next>/src/`)

```
app/                  # Pages thin, composición. SIN lógica.
features/<feature>/   # components/ hooks/ api/ (fetch tipado Zod) server.ts index.ts
lib/                  # transversales (api-server, auth-config)
```

- Nunca `fetch()` directo en componentes — siempre vía `features/<x>/api/`.
- Server Components por defecto; `'use client'` solo con necesidad real.
- Imports entre features solo por su `index.ts`.

### packages/domain — pureza obligatoria

Lógica de negocio compartida (expansión de recetas, costeo FIFO, disponibilidad,
motor de promociones, render de recibos HTML/ESC-POS, mensajes WhatsApp, prompts LLM)
vive como **funciones puras sin IO**. El backend y los frontends la consumen igual:
así el POS offline calcula disponibilidad con la misma función que el servidor.

### Adapter pattern para todo lo externo

Interfaces en `@pos-tercos/domain`, implementaciones en `apps/api/src/adapters/<provider>/`,
inyectadas por token DI con **factory por env var** y **mock por defecto en dev**:

| Puerto | Impl. dev | Impl. prod | Selector |
|---|---|---|---|
| `LLMProvider` | — (key requerida) | Anthropic Haiku + OpenAI fallback | `LLM_PROVIDER` |
| `StorageProvider` | Filesystem `./tmp/uploads` | Cloudflare R2 | `STORAGE_PROVIDER=r2` |
| `PrinterProvider` | Dump HTML a disco | ESC/POS vía print-agent | `PRINTER_PROVIDER=escpos` |
| `CashDrawerProvider` | Log | Kick RJ-11 vía print-agent | `PRINTER_PROVIDER=escpos` |
| `WhatsAppProvider` | `MockWhatsAppAdapter` (loggea) | `OpenWaWhatsAppAdapter` | presencia de `OPENWA_*` |

## 3. Decisiones arquitectónicas clave

Resumen — el detalle canónico está en `CLAUDE.md §4` (y §7.v3–7.v4):

- **Stockables polimórficos** (§4.1): movimientos, facturas y supplier-products apuntan a
  INGREDIENT, PRODUCT (reventa directa) o SUBPRODUCT vía `entity_type` + XOR de FKs con
  CHECK en DB. Insumos, mercadería y preparados comparten el mismo lifecycle de stock.
- **Ledger insert-only** (§4.4): `inventory_movements` y `audit_log` tienen trigger
  Postgres que bloquea UPDATE/DELETE. Toda corrección es un movimiento compensatorio.
- **COGS FIFO real**: `CogsService` recorre los movimientos en orden cronológico
  manteniendo colas FIFO por entidad; las tandas de producción materializan lotes de
  subproductos con costo derivado de los insumos consumidos. Alimenta P&G, márgenes
  y valorización de inventario.
- **Idempotencia**: POSTs críticos (ventas, producciones, confirmaciones) exigen
  `Idempotency-Key`; las respuestas se cachean 7 días (`idempotency_keys`). El cobro
  (`confirmPayment`) es TOCTOU-safe (update condicionado por status dentro de la tx).
- **Caja única por negocio**: una sola caja OPEN a la vez; una caja stale de un día
  anterior bloquea ventas hasta cerrarse. `expectedCash = apertura + ventas CASH
  + entradas − salidas`, con arqueo por denominación y conteo ciego.
- **Turnos por caja**: `turn_number` se asigna **al pagar** y resetea con cada caja.
  La cocina marca listo → cola FIFO por `ready_at` → el cajero llama manualmente el
  número a la pantalla pública (flash + campana por `callSeq`).
- **POS offline-first**: PWA con IndexedDB (sesión + catálogo + ledger de
  disponibilidad + cola de ventas). Venta offline = recibo provisional OFF-N + sync
  FIFO idempotente al volver la red, con bandeja de revisión y bloqueo del cierre de
  caja si hay cola pendiente.
- **WhatsApp saliente automático** (§4.10): el backend envía solo (OpenWA self-hosted)
  — instrucciones de pago al crear el pedido web, "pago recibido", "listo para retirar",
  cancelación; más alertas al dueño (descuadres, digest diario). Idempotente por flags
  `notified_*`, fire-and-forget (un fallo de WA nunca revierte negocio), todo
  registrado en `whatsapp_messages`.

## 4. Flujo de una venta (end-to-end)

**COUNTER:** el cajero arma el carrito en el POS (promos del motor puro de domain) →
`POST /sales` con Idempotency-Key → `POST /sales/:id/confirm-payment` valida monto,
asigna `turn_number`, descuenta stock (subproductos + insumos directos vía
`expandRecipeOneLevel`, con guard de stock en la tx) → emite `order.created` al KDS →
imprime recibo ESC/POS y abre cajón vía print-agent → la cocina marca "listo"
(`ready_at`) → el cajero llama el turno a la pantalla pública y entrega.

**WEB_PICKUP:** el cliente arma pedido en `apps/web` → `POST /web/orders` crea la venta
`PENDIENTE_PAGO` (sin turno) y dispara WhatsApp con instrucciones de pago → el POS
recibe `web-order.created` por `/ws/pos` → el cajero valida el comprobante y confirma
(`confirm-payment`: asocia turno + caja, notifica "pago recibido", manda a cocina) →
mismo camino KDS → al "listo" el cliente recibe "listo para retirar" por WhatsApp; el
tracking web (token HMAC en URL) refleja cada estado.

## 5. Puertos y deploys

**Dev local** (Postgres en Docker; `pnpm dev` levanta todo):

| Servicio | Puerto |
|---|---|
| `apps/api` | 3001 |
| `apps/pos` | 3002 |
| `apps/admin` | 3004 |
| `apps/web` | 3000 |
| `apps/public-display` | 3005 |
| `apps/print-agent` | 9120 (el 9100 colisiona con Flutter DevTools) |
| KDS Flutter | emulador/tablet (`flutter run`) |

**Prod** (según `deploy.md`):

- **Railway**: `apps/api` (start = `prisma migrate deploy && start`) + PostgreSQL 16.
- **Vercel**: admin / pos / web / public-display, cada uno con su subdominio
  (`admin.tercos.co`, `pos.tercos.co`, `tercos.co`, `display.tercos.co`).
- **KDS Flutter**: APK directo en la tablet Android (no se despliega en Vercel).
- **Print Agent**: Raspberry Pi en el local (systemd), alcanzable desde Railway vía
  Cloudflare Tunnel o Tailscale; impresora Epson TM-T20III por USB + cajón por RJ-11.
- **Cloudflare**: DNS + R2 (`pos-tercos-prod`) para imágenes/facturas.
- **OpenWA**: gateway self-hosted (VPS o máquina local) con número WA propio.
- `TZ=America/Bogota` en Railway (el reset diario de turnos usa hora local del server).

---

> **Más detalle:** `estado-del-sistema.md` (qué hace cada módulo, estado verificado) y
> `CLAUDE.md` (reglas de código, decisiones que no se pueden violar, historial de fases).
>
> La antigua plantilla de arquitectura Flutter (CrediClub) que vivía en este archivo se
> movió a `apps/kds-flutter/ARCHITECTURE-flutter-template.md` — solo aplica como guía de
> Clean Architecture para el KDS Flutter, no describe el POS.
