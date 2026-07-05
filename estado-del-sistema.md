# Estado del sistema — POS Tercos

> **Generado: 2026-06-10** (rama `refactor/v2-reorientacion`, tras la sesión de auditoría §7.v5 de CLAUDE.md).
> Documenta qué hace y cómo funciona cada módulo de cada app, su estado real verificado contra el código, y el inventario de trabajo pendiente.
> ⚠️ **2026-06-27 (CLAUDE.md §7.v10): turnero + KDS ELIMINADOS.** Lo que este doc lista como `kds` / `public-display` (turnero) / POS feature `turn` es **histórico**: hoy COUNTER termina en PAGADO, el pedido web se marca "listo" desde el POS (`/sales/:id/mark-ready`), `public-display` es solo productos+publicidad+música, y no hay app de cocina.
> ⚠️ Varios docs de planificación de la raíz (`fase5e-y-pendientes.md`, `fase4-ajustes-pendientes.md`, `implementation-plan.md`) describen como "pendiente" trabajo que **ya está hecho** — ver §10. La fuente canónica de estado sigue siendo `CLAUDE.md`.

---

## 1. apps/api — Backend NestJS (puerto 3001)

| Módulo | Qué hace | Cómo funciona | Estado |
|---|---|---|---|
| **auth** | Login/logout y sesiones por app (admin/pos con cookies separadas) | JWT access 24h + refresh 7d con rotación; cookies httpOnly `admin_*`/`pos_*`; guards globales + decoradores `@Public/@AdminAccess/@OnlyDueno/@CashierAccess/@KitchenAccess` | ✅ |
| **users** | Gestión de empleados (Dueño-only) | CRUD + reset de contraseña, PIN propio, cambio de salario y terminación de empleo — las acciones financieras exigen PIN; todo auditado | ✅ |
| **ingredients / subproducts / products** | Catálogo: insumos, intermedios de cocina y vendibles | CRUD con soft-delete; products soporta combos, variantes (sizes con receta propia), modifiers, reventa directa, imágenes (R2/local), "86" manual (`sold-out`) y snapshot offline para el POS | ✅ |
| **recipes** | Grafo de recetas polimórfico | `PUT /products\|subproducts/:id/recipe`; expansión vía funciones puras de domain (`expandRecipe` recursiva para costos, `expandRecipeOneLevel` para consumo); costo expandido con FIFO | ✅ |
| **inventory** | Ledger de stock insert-only + conteo físico | Movimientos polimórficos (INGREDIENT/PRODUCT/SUBPRODUCT) con trigger anti UPDATE/DELETE; ajustes manuales; **conteo físico ciclado** (`/inventory/count-tasks`, `/inventory/counts`) que crea ajustes compensatorios | ✅ |
| **production** (en subproducts) | Producir tandas de subproductos | `POST /subproducts/:id/produce` consume insumos según receta, SERIALIZABLE + retry, idempotente, stock negativo imposible | ✅ |
| **sales** | Motor de ventas (COUNTER + WEB_PICKUP) | Partido en 4 servicios: `SalesService` (create/confirm/void/cancel/list), `SalesConsumptionService` (consumo ÚNICO online/offline + guard de stock), `SalesOfflineService` (sync-offline idempotente), `SalesReceiptService` (ESC/POS + cajón). Promos aplicadas por el motor puro de domain. TOCTOU-safe en el cobro | ✅ |
| **kds** | Cola de cocina + WS | `GET /kds/orders` + start/ready; gateway socket.io `/ws/kds` con auth tri-modal; al "listo" notifica al cliente y alimenta la cola de llamado | ✅ |
| **shifts** | Caja única del negocio | Apertura/cierre con `expectedCash` (apertura + ventas CASH + movimientos de efectivo), arqueo por denominación, caja stale bloquea ventas, reopen por admin, análisis IA del descuadre, **alerta WhatsApp al dueño si descuadra ≥$5.000** | ✅ |
| **promotions** | 4 tipos de descuento automático | PERCENT/FIXED/BOGO/COMBO con días+horario+vigencia; gana el mayor descuento absoluto; campos por tipo inmutables | ✅ |
| **web-orders / web-menu** | Pedidos web públicos | Menú SAFE throttled; creación con token HMAC 24h + instrucciones de pago automáticas por WhatsApp; WS `/ws/pos` notifica al cajero | ✅ |
| **public-display** | Turnero kiosko | SSE `@Public` con `{currentTurn, callSeq}`; cola de listos FIFO por `ready_at`; llamado manual del cajero (incl. número arbitrario) | ✅ |
| **reports** | Analytics completo | Dashboard, series de ventas, top products, heatmap, **COGS FIFO real** (P&G/márgenes/valorización), **uso y mermas valorizado**, anomalías 2σ por cajero, reconciliación CSV con histórico, estado financiero mensual + break-even + IA, cockpit cash-based, resumen IA diario, **digest diario WhatsApp al dueño (cron 21:30)** | ✅ |
| **purchase-suggestions** | Auto-pedido con IA | Cron horario detecta low-stock; evaluación LLM on-demand; accept/reject; envío del pedido al proveedor por WhatsApp | ✅ |
| **workers** | Nómina v2 | payType MONTHLY/DAILY + descansos cíclicos, días/ajustes con PIN, períodos quincenales (4 sub-pagos/mes), pagos con comprobante. (Las comisiones se eliminaron a propósito) | ✅ |
| **fixed-costs** | Costos fijos del negocio | CRUD Dueño-only + pago mensual/anual con comprobante; alimenta el P&G | ✅ |
| **notifications** | WhatsApp saliente | `NotificationService` (cliente: instrucciones/pago recibido/listo/cancelado — idempotente por flags, fire-and-forget) + `OwnerNotificationService` (**alertas antifraude/costos al dueño**) | ✅ |
| **approvals** | PIN de aprobación 6 dígitos | Self-service con contraseña; verificación bcrypt; exigido en void, cajón sin venta, salarios, pagos. Reset de PIN ajeno: existe en users (`POST /users/:id/pin`, Dueño) | ✅ |
| **adapters/** | Puertos a servicios externos | LLM (Anthropic Haiku primario + OpenAI fallback), Storage (local/R2), Printer + CashDrawer (local-dump / ESC/POS via print-agent), WhatsApp (mock / OpenWA) — todos con factory por env var, mock por defecto en dev | ✅ (por diseño: dev usa mocks) |
| **common** | Transversales | ZodValidationPipe, IdempotencyService (TTL 7d + purge 3AM), MIME por magic bytes, `assertRequiredEnv` al arranque | ✅ |

## 2. apps/admin — Panel de administración (puerto 3004)

Todas las áreas están ✅ completas y funcionales: dashboard en vivo (solo Dueño), CRUDs de catálogo con recetas y costos, inventario (existencias + movimientos + ajustes + **conteo físico**), facturas con IA (foto → extracción → confirmación → stock + pago con comprobante), proveedores con histórico, promociones, sugerencias IA, 7 reportes (ventas, productos, operación, **costos/margen real FIFO**, **uso y mermas**, anomalías, reconciliación), finanzas (estado mensual + cockpit de pagos + costos fijos), nómina (períodos + panel por empleado), turnos con detalle e IA, bitácora + auditoría, usuarios.

Detalles de pulido detectados (menores, no bloqueantes):
- `InvoiceUploader` modo manual sin hints visuales que guíen la carga ([InvoiceUploader.tsx:51](apps/admin/src/features/invoices/components/InvoiceUploader.tsx#L51)).
- `FinanceCockpit`: los pendientes no distinguen urgencia por fecha de vencimiento.
- Historial de reconciliación no muestra el detalle de matches por fila en la lista.
- `/styleguide` conserva labels hex de la paleta clara vieja (fuente de verdad: `tokens.css`).

## 3. apps/pos — POS del cajero (PWA, puerto 3002)

| Feature | Qué hace | Estado |
|---|---|---|
| **auth** | Login + SessionKeeper (refresh 6h + foco) | ✅ |
| **shifts** | Abrir/cerrar caja, movimientos de efectivo, arqueo por denominación con conteo ciego, Z-report, gate de caja stale | ✅ |
| **catalog** | Grid con disponibilidad en vivo (86 + stock por receta), picker de sizes/modifiers | ✅ |
| **sales** | Carrito Zustand → cobro (CASH con vuelto / digital con doble verificación) → recibo ESC/POS → cajón → anulación con PIN (solo PAGADO no iniciado) → historial del día | ✅ |
| **web-orders** | Modal con pedidos web en vivo (WS + resync REST), confirmar pago, rechazar | ✅ |
| **turn** | Panel de llamado: cola de listos, re-llamar, llamado manual, entrega, campana | ✅ |
| **offline** | IndexedDB (sesión+catálogo+ledger+cola), venta encolada con recibo provisional OFF-N, disponibilidad offline con la misma función pura del backend, sync FIFO idempotente con máx. 3 reintentos automáticos, bandeja de revisión (reintentar/descartar), bloqueo de cierre con cola pendiente | ✅ (excepto **B.4b**: abrir caja offline — diferida a propósito) |

## 4. apps/web — Menú público + checkout (puerto 3000)

Catálogo público con imágenes y disponibilidad, carrito persistido en localStorage, checkout WEB_PICKUP de 1 página (teléfono +57 estricto, idempotency key), tracking por token HMAC en URL con poller y timeline de 4 pasos. ✅ Completa.

## 5. apps/public-display — Turnero kiosko (puerto 3005)

SSE con debounce + dedupe por `callSeq`, backoff exponencial 3s→60s (nunca deja de reintentar), fallback a poll si el stream queda stale, carrusel de promos, turno gigante con flash + campana, wake lock, guards de kiosko. ✅ Completa.

## 6. apps/kds-flutter — Comanda de cocina (tablet Android)

Clean Architecture (domain/data/presentation, Riverpod + Freezed + Dio + GoRouter):
- **BoardScreen**: órdenes en vivo por WS `/ws/kds` + polling de respaldo 30s, cronómetros, re-alertas con TTS (>3 min sin iniciar, >10 min sin terminar), iniciar/marcar listo. ✅
- **ProductionScreen**: registrar tandas de subproductos desde la tablet (la "Sesión 4" que CLAUDE.md §7.v4 lista como pendiente **ya está implementada**). ✅
- **Login** con token en memoria. ✅
- ⚠️ Deuda real: **cero tests Dart** (solo el placeholder `widget_test.dart`).

## 7. apps/print-agent — Servicio local de impresión (puerto 9120)

HTTP local con auth opcional: `POST /print` acepta bytes ESC/POS ya renderizados (online) **o** `ReceiptData` crudo que renderiza localmente (recibos offline); `POST /drawer-open`; 3 drivers auto-detectados (spooler Windows, libusb, device file) + dump a disco en dev. Validación Zod del input. ✅ Completa.

## 8. packages

- **types**: schemas Zod = fuente única de validación (≈30 dominios). ✅
- **domain**: funciones puras sin IO — recetas, costos, FIFO, disponibilidad, promociones, recibos (HTML + ESC/POS), mensajes WhatsApp (cliente + alertas dueño), prompts LLM, redondeo canónico (`roundMoney`/`roundCost`). **102 tests Vitest.** ✅
- **ui / brand**: componentes visuales puros + identidad. Sin tests (bajo riesgo). ✅

---

## 9. Trabajo a medias / pendiente — REAL y verificado

| # | Item | Dónde | Tamaño |
|---|---|---|---|
| 1 | **B.4b — abrir caja offline** (jornada que ARRANCA sin red). Diferida a propósito 2026-05-24: exige mover el gate de turno de SSR a cliente. Retomarla solo si el negocio realmente arranca jornadas sin internet | `offline-fase-b.md` | M |
| 2 | **Tests del KDS Flutter** (0 reales) — la tablet de cocina no tiene red de seguridad ante refactors | `apps/kds-flutter/test/` | M |
| 3 | **Services backend gigantes**: `WorkersService` (~840 líneas), `PurchaseSuggestionsService` (~750), `RecipesService` (~740), `CogsService.runLedger` (orquestador FIFO de ~260 líneas en una función) | `apps/api/src/{workers,purchase-suggestions,recipes,reports}` | M-L |
| 4 | ~~Auth duplicada admin/pos~~ — **verificado 2026-06-10: NO es deuda real.** Lo idéntico son ~95 líneas parametrizadas por `X-Client-App` (login/logout/me/SessionKeeper); LoginScreen y LogoutButton difieren a propósito (diseño por app) y server.ts por cookie. Un package compartido no paga su costo. | — | — |
| 5 | **Reconciliación CSV: hardening por proveedor** (delimitadores/encoding variantes) — nota en código | `reconciliation.service.ts:240` | S |
| 7 | **`ARCHITECTURE.md` es la plantilla Flutter de CrediClub**, no describe el POS — confunde a cualquiera que llegue nuevo | raíz | S |
| 8 | **`/styleguide`** con labels hex de la paleta vieja | `apps/admin/src/app/styleguide` | S |
| 9 | Pulido admin menor (hints del uploader manual, urgencia en cockpit, detalle de matches en historial de reconciliación) | §2 de este doc | S |
| 10 | **TOCTOU de stock bajo READ_COMMITTED**: aceptado explícitamente para 1 caja; si algún día hay 2+ cajas concurrentes, llevar el cobro a SERIALIZABLE (como ya hace producción) | `sales-consumption.service.ts` (assertStockSufficient) | M |
| 11 | Docs de planificación viejos sin marcar como históricos (ver §10) | raíz | S |

## 10. Falsos pendientes (docs viejos que dicen "pendiente" pero el código lo tiene)

Verificado contra el código el 2026-06-10 — **NO volver a planear esto**:

- `fase5e-y-pendientes.md` lista FASES 8-15 como futuras → **todas cerradas** (8 se eliminó en v2 junto con delivery; 9 fue reemplazada por OpenWA; 11-15 completas).
- `fase4-ajustes-pendientes.md` lista 18 ajustes → **hechos** (commits 4adj.A-H + 2.16; solo 2.17 "tests FASE 4" se cubrió parcialmente después con las suites e2e).
- `costeo-fifo-design.md` D1-D5 "decisiones abiertas" → **resueltas e implementadas** (CogsService + capture de unit_cost + reversión por sourceId).
- `offline-fase-b.md` B.0-B.5 "pendiente de implementar" → **implementadas** (commits B.0a→B.5); solo B.4b sigue diferida.
- CLAUDE.md §7.v4 "Sesión 4 (KDS Flutter producción)" → **ya existe** (`ProductionScreen` + controller + use case).
- CLAUDE.md §6 "whatsapp-metrics puede necesitar leer de whatsapp_messages" → **ya lee de `whatsapp_messages`**.
- Docstring "promociones stub" en SalesService → era comentario obsoleto, corregido (el motor está cableado).

## 11. Candidatos para próximas mejoras

**Refactors (orden sugerido):** partir `WorkersService` y `CogsService.runLedger` → tests Dart del KDS → dedupe de auth admin/pos → reescribir `ARCHITECTURE.md` (o borrarla y apuntar a CLAUDE.md + este doc).

**Funcionalidades con valor de negocio:**
1. **Pronóstico de producción**: con el heatmap + histórico, sugerir cuántas tandas de cada subproducto producir por día.
2. **Modificadores con consumo de inventario**: "doble carne" hoy no descuenta la porción extra (fuga de inventario típica de comida rápida).
3. **Vencimientos por lote**: el FIFO ya modela lotes; agregar `expiryDate` opcional → alerta "vence en 3 días".
4. **Clientes frecuentes**: contador de compras por `customerPhone` + beneficio por WhatsApp.
5. **Export CSV/PDF de reportes** para el contador.
