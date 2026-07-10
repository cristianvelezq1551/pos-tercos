# Unificación POS (cajero) + Admin — Plan por fases

> **Estado:** planificado. Rama de trabajo `feat/unify-pos-admin` sobre el checkpoint `fc9810d` (rollback = `git checkout main` o `git reset --hard fc9810d`).
> **Doc canónico de esta iniciativa.** Actualizar al cerrar cada fase.

---

## 0. Objetivo y principios

Fusionar la experiencia de **cajero** (`apps/pos`) dentro de **`apps/admin`** para que un `ADMIN_OPERATIVO` use caja + gestión con **un solo login** y **navegación instantánea** entre ambos "modos". El `DUENO` no ve ni inicializa nada de caja.

### Decisiones de producto (del dueño)
1. **DUEÑO:** cero caja. No se registra Service Worker, no se monta el motor offline, no se abre socket, no aparece ninguna ruta de caja.
2. **ADMIN_OPERATIVO:** launcher para elegir **Caja** o **Gestión** + switch persistente para saltar entre los dos.
3. **Roles finales:** solo `ADMIN_OPERATIVO`, `DUENO`, `COCINERO`. Se eliminan `CAJERO` y `TRABAJADOR` — **pero al FINAL** (Fase 6), no antes.

### Principios duros de ejecución
- **Aditivo primero.** Se construye `/caja` DENTRO de admin sin tocar `apps/pos`. La app de cajero **sigue viva y desplegada** como fallback durante todo el desarrollo.
- **La app de cajero NO se borra** hasta pasar las pruebas profundas (Fase 5). El rol `CAJERO` **NO se elimina** hasta la Fase 6.
- **Nunca romper el admin online.** Las páginas de gestión (finanzas, reportes) JAMÁS se sirven desde caché offline. El SW solo cachea `/caja/*`.
- Cada fase deja el árbol **verde** (`pnpm typecheck` + `pnpm lint` + tests de la fase) y es independientemente reversible.

### Estrategia técnica (por qué una sola app)
El backend NO distingue admin de pos por lógica de negocio, solo por `X-Client-App` + nombre de cookie (`jwt-auth.guard.ts`, `auth.controller.ts`). El único hardcode de `pos_access` fuera de eso es el fallback de cookie del gateway WS (`pos.gateway.ts`), y el handshake real usa token explícito. Al eliminar CAJERO, el aislamiento de sesión entre admin y pos deja de tener sentido → fusionar es limpio. Lo único delicado es el **offline/PWA**, que hoy es global en el POS y hay que **acotar al segmento `/caja`**.

---

## 1. Supuestos (confirmar con el dueño antes de Fase 2)

| # | Supuesto | Default asumido | Impacto si cambia |
|---|---|---|---|
| S1 | La caja debe seguir **offline-first / PWA instalable** | **SÍ** | Si no, se elimina toda la Fase 3 y el motor offline; mucho más simple |
| S2 | Reasignación de roles existentes en Fase 6 | CAJERO→ADMIN_OPERATIVO, TRABAJADOR→COCINERO | Afecta la migración de enum |
| S3 | Dominio final | Unificar en `admin.tercos.co`; `pos.tercos.co` queda como alias→`/caja` un tiempo | Afecta deploy (Fase 6) |

---

## 2. Arquitectura destino (una app)

```
apps/admin/src/app/
├── (authenticated)/
│   ├── layout.tsx           # shell admin (SIN infra de caja)
│   ├── page.tsx             # DUEÑO → Inicio | OPERATIVO → launcher
│   ├── ...rutas de gestión de hoy...
│   └── caja/                # ← NUEVO segmento (todo lo del POS)
│       ├── layout.tsx       # monta OfflineProvider + socket + gates + SW-register
│       │                    #   SOLO si role===ADMIN_OPERATIVO
│       ├── page.tsx         # vender (OrdersPanel + Catalog + Cart)
│       ├── historial/…
│       ├── arqueos/…
│       ├── shift/open/…
│       └── configuracion/…  # impresoras
└── login | unauthorized     # únicos slugs compartidos
```

- **Aislamiento del offline al segmento:** el `OfflineProvider`, el socket `/ws/pos`, los chimes y los gates de turno se montan en `caja/layout.tsx`, no en el layout raíz. Fuera de `/caja` no existe nada de esto.
- **Gate del segmento:** `caja/layout.tsx` exige `ADMIN_OPERATIVO` (el dueño se redirige a `/`). Enforcement real sigue en el backend (`@CashierAccess`, que en Fase 6 pasa a `{ADMIN_OPERATIVO, DUENO}`).
- **Cookie única:** `admin_*`. El WS toma su token de `getAccessTokenServer()` leyendo `admin_access`; el handshake por `auth.token` no depende del nombre de cookie.

---

## 3. Fases

> Cada fase: **Objetivo · Cambios · Archivos · Tests · Done · Rollback.**

### Fase 1 — Andamiaje del segmento `/caja` (aditivo, cero cambio de comportamiento)
- **Objetivo:** que exista `/caja` en admin, gateado a ADMIN_OPERATIVO, renderizando un placeholder. Sin tocar `apps/pos`.
- **Cambios:**
  - Agregar deps a `apps/admin`: `idb`, `socket.io-client`, `zustand` (ya usadas por el POS).
  - Crear `caja/layout.tsx` (guard `requireOperativoServer()`) + `caja/page.tsx` placeholder.
  - Añadir al sidebar/topbar de admin un acceso "Caja" visible solo para ADMIN_OPERATIVO (usa el flag inverso de `onlyDueno`).
- **Archivos:** `apps/admin/package.json`, `apps/admin/src/app/(authenticated)/caja/{layout,page}.tsx`, `apps/admin/src/features/auth/server.ts` (nuevo `requireOperativoServer`).
- **Tests:**
  - `pnpm -F @pos-tercos/admin typecheck` + `pnpm lint` verdes.
  - Manual: DUEÑO en `/caja` → redirige a `/`. ADMIN_OPERATIVO ve el placeholder.
  - Admin de hoy intacto (ninguna ruta existente cambia).
- **Done:** `/caja` responde gateado; admin sin regresiones.
- **Rollback:** borrar el segmento + revertir `package.json`.

### Fase 2 — Portar las features del POS a `caja/` (paridad funcional online)
- **Objetivo:** vender, cobrar (simple/dividido), historial, anular, arqueos, cierre de caja, pedidos web — todo funcionando dentro de admin, **en modo online**. Offline se agrega en Fase 3.
- **Sub-pasos (cada uno verde + commiteado):**
  - **2a** ✅ deps (`idb`, `socket.io-client`, `zustand`) en admin.
  - **2b** ✅ libs compartidas: `audio`, `use-polling`, `socket-auth` (+ `ws-token`), `errors`, `startOfTodayIso` en `dates`.
  - **2c** ✅ motor `offline` portado (auto-contenido; base de todo).
  - **2d** ✅ port masivo: `catalog`, `sales`, `web-orders`, `printing` (mismo nombre) + `cortesias→caja-cortesias` y `shifts→caja-shifts` (renombradas; admin ya tiene las suyas de la vista dueño — NO se tocan). `logInfo` agregado. 139 archivos, verde. **Aún sin cablear.**
  - **2e** ✅ **cableado**: `app/caja/*` FUERA de `(authenticated)` (pantalla completa, sin sidebar) — rutas vender/historial/cierre/arqueos(+detalle)/shift·open/configuracion + `caja/layout` monta OfflineProvider + CortesiaWatchProvider + SessionKeeper + OfflineStatusBar + CajaTopbar (CajaNav + web-orders socket + badge). `getAccessTokenServer(admin_access)`. Fixups de ruta en features. typecheck+lint verdes. **Falta verificación en runtime (dev).**
  - **2f** ✅ Vitest en admin (config + setup + deps) + **9 tests / 63 casos** restaurados del POS (split, totals, denominations, shift-summary, checkout-validation, drain-policy, useCheckoutFlow, VoidModal, OfflineReviewTray). `pnpm -F admin test` verde. Integrado a `pnpm test` (turbo).
- **Cambios:**
  - Copiar features del POS a admin: `sales/` (cart-store, checkout, split, void, comanda), `shifts/` (open/close/arqueos/cash-movements/StaleShiftGate), `web-orders/` (socket + drawer), `cortesias/`, `printing/`, `catalog` de venta.
  - `caja/layout.tsx` monta: socket `/ws/pos` (solo operativo), `CortesiaWatchProvider`, `ComandaFailureAlert`, `SessionKeeper` (comportamiento del POS: 2×401→login), badges de caja.
  - Auth/WS: `getAccessTokenServer` (admin) lee `admin_access`; `fetchWsToken` ya usa `/api/auth/ws-token`. El gateway (`pos.gateway.ts`) no requiere cambios (handshake por token; ya admite ADMIN_OPERATIVO/DUENO).
  - Gates de turno por-ruta bajo `caja/` (redirect a `/caja/shift/open`).
- **Archivos:** nuevo `apps/admin/src/features/{sales,shifts,web-orders,cortesias,printing}/…` (portados, adaptando imports a `@pos-tercos/*` y rutas `/caja/*`).
- **Tests:**
  - **Vitest (portar del POS):** replicar `totals`, `split`, `denominations`, `shift-summary` en admin (`pnpm -F @pos-tercos/admin test`). Deben pasar idénticos a los 63 del POS.
  - **E2E API (sin cambios):** las suites de sales/shifts/split/void siguen verdes (no tocamos backend).
  - **Manual:** con `admin@dev.local` (ADMIN_OPERATIVO): abrir caja → vender → cobrar CASH y dividido → imprimir → historial → anular con PIN → arqueo → cerrar caja. Confirmar pedido web (socket vivo).
  - **Regresión:** el POS (`apps/pos`) sigue funcionando en paralelo con `cajero@dev.local`.
- **Done:** paridad online completa en `/caja`; POS intacto.
- **Rollback:** borrar `caja/` + features portadas.

### Fase 3 — Motor offline + Service Worker ACOTADO a `/caja`
- **Objetivo:** caja offline-first (IndexedDB, cola, sync, Web Locks) e instalable, **sin cachear jamás rutas de gestión**.
- **Cambios:**
  - Portar `features/offline/*` y montar `OfflineProvider` + `OfflineStatusBar` en `caja/layout.tsx` (nunca en el layout raíz).
  - Portar `public/sw.js` **modificado**: la lista blanca de navegaciones cacheables = **solo `/caja/*`**; cualquier otra navegación (finanzas, reportes) va **siempre a red** y NO se cachea ni se sirve offline. Warm-up = rutas `/caja/*`.
  - Registro del SW **condicional**: solo si `role===ADMIN_OPERATIVO` y en el árbol de caja. En dev, des-registrar (como hoy).
  - Manifest instalable con `start_url: /caja` (o launcher).
  - IndexedDB: bumpear versión / limpiar snapshot viejo (evita parse de `role:'CAJERO'` cacheado).
- **Archivos:** `apps/admin/public/sw.js`, `apps/admin/public/manifest.json`, `apps/admin/public/offline.html`, `apps/admin/src/features/offline/*`, registro en `caja/` (client component).
- **Tests:**
  - **Manual offline (crítico):** en `/caja` cortar red → vender (numeración `OFF-N`) → volver online → sync drena la cola. Apertura de caja offline.
  - **Aislamiento del SW (crítico):** offline, navegar a `/finanzas/estado` → NO debe servir versión cacheada (debe fallar/── a red), confirmando que datos financieros nunca quedan stale.
  - **Playwright:** portar `apps/pos/e2e/offline.spec.ts` apuntando a `/caja`.
  - `pnpm typecheck` + `lint` verdes.
- **Done:** caja offline OK; gestión nunca cacheada; POS intacto.
- **Rollback:** quitar registro del SW + OfflineProvider del `caja/layout`.

### Fase 4 — Launcher + gating fino del DUEÑO
- **Objetivo:** UX final de entrada y garantía de que el dueño no inicializa nada de caja.
- **Cambios:**
  - `(authenticated)/page.tsx`: DUEÑO → Inicio (dashboard). ADMIN_OPERATIVO → launcher (Caja / Gestión) + switch persistente en el topbar.
  - Verificar que para DUEÑO: sin SW, sin socket, sin OfflineProvider, sin rutas de caja (todo condicionado por rol y por segmento).
- **Archivos:** `apps/admin/src/app/(authenticated)/page.tsx`, topbar/launcher nuevos.
- **Tests:**
  - **Manual:** login DUEÑO → nunca ve caja; DevTools → **no** hay SW registrado ni socket abierto. Login OPERATIVO → launcher + switch fluido.
  - Assert automatizado (Playwright): en sesión DUEÑO, `navigator.serviceWorker.getRegistrations()` vacío.
- **Done:** requisitos 1 y 2 cumplidos.
- **Rollback:** revertir `page.tsx`/launcher.

### Fase 5 — PRUEBAS PROFUNDAS (compuerta antes de borrar nada)
- **Objetivo:** confianza total en la caja fusionada, corriendo **en paralelo** con el POS viejo (que sigue disponible).
- **Suite:**
  - **E2E API completo** verde (todas las suites actuales, backend sin cambios).
  - **Vitest admin** (lógica de plata portada) verde.
  - **Playwright en admin/caja:** smoke (login→vender→cobrar→cerrar), web-order, offline (portados desde `apps/pos/e2e/`).
  - **Manual en hardware:** impresora Epson (comanda + factura), cajón monedero, arqueo por denominación, cuenta dividida, cuentas abiertas, cortesías, edición de venta pagada.
  - **Convivencia:** confirmar que ambos (POS viejo + `/caja` nuevo) operan sobre el mismo backend sin pisarse (caja única: no abrir dos cajas del mismo día de negocio).
  - **Checklist de operación real:** un turno completo de prueba usando SOLO `/caja`.
- **Done:** toda la suite verde + turno real de prueba OK.
- **Rollback:** ninguno; si algo falla se corrige antes de Fase 6.

### Fase 6 — Cutover: eliminar CAJERO+TRABAJADOR y jubilar `apps/pos` (SOLO tras Fase 5 verde)
- **Objetivo:** simplificar el modelo de roles y retirar la app duplicada.
- **Cambios (backend/roles):**
  - Migración de enum estilo `20260521223612_remove_delivery_repartidor`: **primero reasignar filas** (S2), luego recrear `UserRole` sin CAJERO/TRABAJADOR.
  - `packages/types/src/auth.ts`: enum + labels + validación Zod.
  - `CashierAccess` → `{ADMIN_OPERATIVO, DUENO}`; limpiar `KitchenOrCashierAccess`/`InternalAccess` (sin uso).
  - `reports.service.ts:35` (filtro anomalías) y `pos.gateway.ts:20` (ALLOWED_ROLES): quitar CAJERO.
  - Seed (`seed.ts`, `seed-users.ts`): reasignar `cajero@`/`trabajador@`.
  - UI usuarios: `ROLE_OPTIONS`, default del form, texto de `unauthorized`.
- **Cambios (borrar app):**
  - Eliminar `apps/pos` (o mantener temporalmente detrás de un flag).
  - Deploy: consolidar en `admin.tercos.co`; `pos.tercos.co` → alias/redirect a `/caja` (S3).
- **Tests:**
  - Migrar ~20 suites e2e API de `role:'CAJERO'`→`'ADMIN_OPERATIVO'` y `payroll-weekly` de `'TRABAJADOR'`→rol válido.
  - Actualizar/retirar e2e del POS (`apps/pos/e2e/*` usan `cajero@dev.local`).
  - Verificar que un JWT viejo con `CAJERO` fuerza re-login (validación Zod del payload).
  - Suite completa verde.
- **Done:** roles reducidos a 3, `apps/pos` retirada, deploy consolidado.
- **Rollback:** revertir la rama; restaurar `apps/pos` y el enum desde `main`.

---

## 4. Matriz de riesgos → mitigación

| Riesgo | Mitigación |
|---|---|
| SW cachea páginas de gestión → dato financiero stale | Lista blanca de caché = solo `/caja/*`; gestión siempre a red (Fase 3, test de aislamiento) |
| Dueño inicializa infra de caja | Todo montado en `caja/layout` + condicionado a `role===ADMIN_OPERATIVO` (Fase 4, assert Playwright) |
| Romper el POS vivo durante el build | Fases 1-5 son aditivas; `apps/pos` no se toca hasta Fase 6 |
| Cookie única rompe el WS | Handshake por token explícito (no depende del nombre de cookie); solo ajustar el SSR-token a `admin_access` |
| Migración de enum falla por filas CAJERO/TRABAJADOR | Reasignar filas ANTES del cast (Fase 6, patrón `remove_delivery_repartidor`) |
| Snapshot offline viejo con `role:'CAJERO'` | Bumpear versión IndexedDB / limpiar en deploy (Fase 3) |
| ~20 suites e2e con `role:'CAJERO'` | Migración mecánica en Fase 6, con la suite como red de seguridad |

---

## 4.bis Auditoría post-2e (3 agentes: integración / código muerto / runtime)

**Veredicto: bien integrada.** La caja pega al MISMO backend vía el proxy `/api/*` de admin, con cookies `admin_*`, rutas `/caja/*`, y gate operativo antes de montar providers. No es un sistema paralelo. Sin defecto crítico.

**Corregido en el acto:**
- 🐛 `caja-shifts/OpenShiftForm.tsx:38,103` — `window.location.assign('/')` iba al dashboard; → `/caja` (afectaba camino offline + botón "Ir a vender"). Mi grep de 2e solo cazó el `router.replace`, no los `window.location.assign`.
- 🧹 Código muerto: `caja-shifts/api/getCurrent.ts` (`getCurrentShift`, sin consumidor — se usan las variantes SSR) eliminado + limpiado de 2 barrels.

**Diferido (documentado, no bloquea):**
- **Env vars** (dev OK por default): `NEXT_PUBLIC_API_WS_URL` (socket `/ws/pos`, cae a `localhost:3001`) y `NEXT_PUBLIC_PRINT_AGENT_URL` (`localhost:9120`) no están en admin → **setear en `.env`/deploy** para tablet/prod (en la misma máquina de dev funcionan).
- **SW/manifest no portados** → la cola offline encola pero el app-shell no carga sin red. **Es la Fase 3** (SW acotado a `/caja`). Hasta entonces la caja offline-first está a medio cablear (online 100% OK).
- **Duplicación con features previas de admin** (MEDIA, deuda de diseño, no bug): `shifts/ShiftSessionDetailView` (dueño) vs `caja-shifts/ArqueoDetail` (cajero) renderizan el mismo `GET /shifts/:id/detail`; dos clientes de `/payment-methods` (config vs habilitados); dos clientes de `/cortesias` (dueño con wrapper `request()` vs cajero con `fetch` crudo). Audiencias distintas → aceptable por ahora; consolidar si divergen.
- **Barrels mixtos** (BAJA, footgun latente heredado del POS): `caja-shifts/index.ts` y `web-orders/index.ts` re-exportan helpers SSR (`next/headers`) junto a componentes client. Hoy OK (todos los importadores son server components); romperá el build de prod el día que un `'use client'` importe del barrel. Split pendiente.
- **Tests no portados** (MEDIA): 9 tests de lógica pura del POS (`split`, `totals`, `denominations`, `shift-summary`, `checkout-validation`, `drain-policy`, etc.) quedaron sin red en admin → **Fase 2f** (configurar vitest + restaurarlos).
- **CAJERO fuera de `/caja`**: el middleware de admin (`ADMIN_ALLOWED_ROLES`) + `requireOperativoServer` dejan la caja solo para ADMIN_OPERATIVO. Es intencional (el rol CAJERO sigue usando `apps/pos` hasta Fase 6). No es regresión.

## 5. Estado de avance

- [x] Fase 0 — checkpoint `fc9810d` pusheado a `main`; rama `feat/unify-pos-admin` creada.
- [x] Fase 1 — andamiaje `/caja` (ruta gateada a ADMIN_OPERATIVO + entrada sidebar `onlyOperativo`). Sin deps nuevas (se agregan en Fase 2 al portar features). typecheck+lint verdes.
- [x] Fase 2 — paridad online ✅ (2a-2f: deps+libs+offline+port+cableado+**vitest 63 tests**). Falta solo verificación manual en runtime (dev).
- [ ] Fase 3 — offline + SW acotado
- [ ] Fase 4 — launcher + gating dueño
- [ ] Fase 5 — pruebas profundas
- [ ] Fase 6 — cutover (roles + borrar `apps/pos`)
