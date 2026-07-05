# Auditoría + Ajustes — Estado de traspaso (2026-07-04)

> **Propósito:** documento canónico para retomar el trabajo en un contexto nuevo sin perder
> hilo. Rama activa: `chore/remove-turnero-kds`. Deploy objetivo: ~1 semana (NO hoy),
> "garantizando todo el funcionamiento". El #3 (cuentas abiertas) es requisito de lanzamiento.
> WhatsApp (#11) es lo último. **La seguridad se dejó apartada a propósito** (ver §4): el foco
> pedido es código + funcionalidad.
>
> **Regla de higiene:** al construir cada pendiente, no dejar código muerto. Al final del doc
> (§6) hay un checklist de limpieza. Verificar SIEMPRE con `pnpm typecheck` (13/13), tests
> unit (domain/pos) y e2e (`cd apps/api && pnpm test:e2e`) antes de dar algo por cerrado.

---

## 0. Estado global verificado (2026-07-05 — post auditoría de ESTABILIDAD PROD, ver §1.E)

| Verificación | Resultado |
|---|---|
| `pnpm typecheck` (monorepo) | ✅ 13/13 |
| `pnpm -F @pos-tercos/domain test` | ✅ 161/161 |
| `pnpm -F @pos-tercos/pos test` | ✅ 40/40 |
| `cd apps/api && pnpm test:e2e` | ✅ 22/22 suites · 179 tests |
| `pnpm lint` | ✅ limpio |
| **`pnpm build` (PRODUCCIÓN, 9 tareas: API + 6 apps + packages)** | ✅ **9/9** (primera vez que se corre — atrapó 1 bug real) |
| Drift Prisma (migraciones vs schema) | ✅ solo renombres de índices + drift documentado de `receipt_seq` — `migrate deploy` no se afecta |

> **DB de dev NO migrada (P3005 conocido):** la DB `pos_tercos_dev` no tiene aplicadas las
> migraciones del módulo cortesías/kitchen ni las nuevas. Las migraciones se validan en
> `pos_tercos_test` (el `global-setup` de e2e recrea+migra) y se aplican en prod vía
> `prisma migrate deploy`. NO correr `migrate deploy` contra dev (falla P3005); si se necesita
> dev, aplicar el SQL directo.

---

## 1. AUDITORÍA — hallazgos y estado

La auditoría inicial se corrió con agentes en paralelo. Cobertura **completa** en: seguridad del API,
y correctness del núcleo de ventas. Cobertura **incompleta** (agentes cortados por límite de sesión):
FIFO/COGS profundo, reportes, shifts/treasury, inventario/crons, barrido de código muerto, frontends.

### 1.A — Bugs funcionales / financieros (foco actual)

| ID | Hallazgo | Archivo:línea (al detectarse) | Sev | Estado |
|---|---|---|---|---|
| B7 | Cortesías: `salePrice` ignora `comboPrice` y `size.priceModifier` | `apps/api/src/cortesias/cortesias.service.ts:92-93` | MEDIA | ✅ **ARREGLADO** — ahora espeja `computeLine` (combo→comboPrice + priceModifier del talle) |
| B1 | `confirmPayment` cobra con snapshot stale de total/items si se edita la venta en paralelo | `sales.service.ts` | ALTA | ✅ **ARREGLADO (2026-07-05)** — items/total se re-leen DENTRO de la tx SERIALIZABLE; si la suma de partes no cuadra con el total fresco → 400 |
| B2 | Dos `editItems` concurrentes: el retry de serialización re-aplica deltas de stock stale | `sales-edit.service.ts` | ALTA | ✅ **ARREGLADO (2026-07-05)** — TODAS las lecturas (venta + items) van dentro del closure del retry; cada reintento recomputa deltas frescos |
| B3 | `P2002` de `sales.idempotency_key` no capturado → 500 | `sales.service.ts` | MEDIA | ✅ **ARREGLADO (2026-07-05)** — `isIdempotencyKeyConflict` + devolución de la venta ganadora (e2e con creates concurrentes) |
| B4 | Venta puede asociarse a caja recién cerrada → efectivo fuera de todo arqueo | `sales.service.ts` | MEDIA | ✅ **ARREGLADO (2026-07-05)** — `resolvePaymentShift` re-resuelve la caja si la original cerró (cuentas abiertas cruzan cajas) + la tx re-verifica `status='OPEN'` antes de cobrar |
| B5 | `syncOffline` no validaba consistencia interna del payload ni método vs settings | `sales-offline.service.ts` | MEDIA | ✅ **ARREGLADO (2026-07-05)** — `assertPayloadConsistent` (líneas + header + efectivo≥total → 400 a la bandeja); método deshabilitado → audit `OFFLINE_SYNC_DISCREPANCY` (no bloquea) |
| B6 | Sync offline multi-día: venta de ayer colgada de la caja de HOY | `sales-offline.service.ts` | MEDIA | ✅ **CERRADO (2026-07-05)** — no se bloquea (la venta ya ocurrió y no hay caja histórica), pero queda audit `OFFLINE_SYNC_DISCREPANCY {kind:'cross_day_shift'}` para conciliar el arqueo |
| B8 | `catch {}` mudos en las auditorías antifraude del sync offline | `sales-offline.service.ts` | BAJA | ✅ **ARREGLADO (2026-07-05)** — logger.error en ambos catches |
| B9 | `GET /sales` con `from/to/limit` inválidos → 500 | `sales.controller.ts` | BAJA | ✅ **ARREGLADO (2026-07-05)** — validación explícita → 400 (e2e) |

**Todos los bugs de la auditoría (B1-B9) quedaron cerrados.** B1-B4 se plegaron al bloque de
ventas como estaba planeado; B5/B6/B8/B9 en el hardening #10.

### 1.B — Verificado OK en la auditoría (revisado, sin problema)

- Doble cobro/void/refund/mark-ready/cancel/aprobación-cortesía: todos con guard `updateMany WHERE status=…` dentro de la tx + abort si `count===0`.
- Reverso de void lee movements DENTRO de la tx (incluye ediciones previas) y revierte por neto respetando CHECK `delta<>0`.
- Stock negativo online: `assertStockSufficient` dentro de tx SERIALIZABLE con retry 40001.
- Pagos divididos: tolerancia `0.005` (no `===` de floats); cada línea con `roundMoney` canónico.
- Pureza de `packages/domain`: sin `Date.now`/`new Date()`/`Math.random`/`process.env`.
- Cleanups de efectos POS: `SessionKeeper` y `useWebOrdersSocket` limpian bien; POS usa `usePolling`.

### 1.C — Auditoría dedicada ✅ COMPLETADA (2026-07-05, 6 agentes en paralelo + verificación + fixes)

Se corrió la pasada completa que había quedado cortada. **ARREGLADO y verificado (todo con
typecheck + tests + e2e en verde):**

| Área | Hallazgo | Sev | Fix |
|---|---|---|---|
| Shifts | `close()` corría en READ COMMITTED sin lock: un cobro concurrente entre el cómputo del esperado y el update a CLOSED dejaba sobrante falso | ALTA | `close()` ahora es tx SERIALIZABLE + advisory lock + guard `updateMany WHERE OPEN` + retry 40001 (SSI aborta al perdedor contra el cobro serializable) |
| Sales | Void/reembolso de una venta cuya caja YA cerró: la plata salía del cajón de HOY sin registro → faltante falso en la caja actual | ALTA | `resolveRefundMovementShift` + `createRefundMovements`: movimiento OUT por parte de pago (method-aware) en la caja ABIERTA actual; sin caja abierta se bloquea. 2 e2e nuevos |
| Reconciliación | `unmatched_sale` comparaba contra `periodTo` = medianoche del último día del CSV → TODA venta de la tarde/noche del último día escapaba del flag de "sin respaldo bancario" | ALTA | Ventana por días CALENDARIO locales (`localDayStart(from)` … `+24h` del último día) |
| Reportes | `getTopProducts` y `getProductMargins` sumaban `lineTotal` sin restar el descuento manual SOBRE EL TOTAL (#5b) → revenue/margen inflados y sin conciliar con el P&G | MEDIA | Prorrateo del `orderDiscountAmount` por peso de línea en ambos |
| Reportes | `voidCount` del summary contaba por `createdAt` (el resto usa `paidAt`) | BAJA | Cambiado a `paidAt` |
| FIFO | La reversa de cortesía re-inyectaba el faltante como lote fantasma cuando la cortesía sobre-consumió → `remaining` FIFO > stock DB | MEDIA | Sin shortfall (igual que el void; el replay cubre toda la historia). Test actualizado |
| FIFO | Tanda de producción sin consumos registrados creaba lote a **$0** (violaba "nunca $0") | MEDIA | `totalConsumedQty<=0` → lote `unitCost=null` (unknownQty). Test nuevo |
| FIFO | Batch de producción malformado (sin +N) descartaba también los consumos → inventario FIFO inflado | BAJA | Los consumos huérfanos se aplican como consumos sueltos. Test nuevo |
| Crons | Dedupe del scan de sugerencias no atómico y el endpoint manual del Dueño NO pasaba por el guard `scanning` → PENDING duplicadas si coincidía con el cron | MEDIA | Guard compartido en `runScan()` (cron + manual) |
| Admin | `IngredientForm`/`SubproductForm`: el await corría FUERA de `startTransition` → `pending` no cubría la red → doble-click creaba duplicados | ALTA | Estado `submitting` que cubre la llamada + guard + validación `portionSize > 0` |
| Admin | `SlideEditModal`: blob URL sin revoke + `busy` colgado tras guardar | MEDIA | `revokeObjectURL` en re-pick y unmount + `finally` |
| Admin/Cocina | Errores tragados (`IncidentsPanel`, `IncidenciasView`, `ChecklistItemsPanel`): fallo de red se veía como "sin datos" | MEDIA | Error visible + guard de doble-toggle |
| Reglas | Imports profundos sin barrel (AdminSidebar, workers/semana, dashboard, kitchen-admin) | BAJA | Barrels creados/usados |
| Código muerto | `pos/DayHistoryModal.tsx` y `cocina/lib/api-server.ts` huérfanos | BAJA | Borrados |
| Docs código | Comentarios stale (`assertStockSufficient` "habría que SERIALIZABLE", cron ":15") | INFO | Corregidos |

**DOCUMENTADO / ACEPTADO (sin cambio de código, con razón):**
- Cerrada la caja del día no se puede cobrar hasta el `reopen` del Dueño — diseño deliberado (una caja/día); los mensajes de error guían.
- `grossMargin = revenue − cogs` NO resta waste/cortesía/reembolso: son líneas separadas del P&G que el frontend muestra aparte (decisión de presentación).
- `getProductMargins` expande la receta VIGENTE (drift si la receta cambió post-venta) — aproximación documentada en el código; el P&G global no la sufre.
- `byMethod.count` cuenta PAGOS (no ventas) — semántica documentada; una dividida aporta a cada método.
- Guards de crons por instancia (single-replica en Railway); merma sin idempotency-key (la UI deshabilita el botón); doble INITIAL concurrente (op única de admin); treasury suma `payrollPayment` legacy (solo histórico, vigilar si se migran datos); movimientos de tesorería con `occurredAt` < ancla no entran al saldo (visible en listado); dos producciones en el MISMO ms sin orden topológico (impracticable con producción manual; caería en unknownQty, nunca $0).
- Endpoints sin caller de frontend (`check-receipt-gaps`, `sweep-orphans`, `send-daily-digest`, `sweep-stale-pending`, `status-log`, `open-drawer/*`, `tracks/reorder`) — triggers manuales del Dueño / superficie documentada; se conservan.
- Componentes >200 líneas en admin (24, encabezados por styleguide 615 y páginas de invoices) — deuda preexistente, sin bugs asociados; recortar cuando se toquen.

### 1.E — Auditoría de ESTABILIDAD PROD ✅ (2026-07-05, segunda pasada: 4 agentes adversariales sobre el código nuevo + builds + config)

Revisión adversarial del código escrito en esta rama (que no había tenido ojos frescos) +
verificaciones nunca corridas (builds de producción, drift Prisma, barrido env vars vs deploy.md).
**Todo lo listado quedó ARREGLADO y re-verificado** (typecheck 13/13, domain 161, pos 40,
e2e 22/179, lint, builds 9/9):

| Sev | Hallazgo | Fix |
|---|---|---|
| CRÍTICO | Cobrar una CUENTA ABIERTA estando offline encolaba una venta offline VACÍA con el total del tab (la cuenta seguía viva → duplicado + descuadre) | `runConfirmCheckout` rechaza `offline && sale` con mensaje claro |
| ALTA | **El build de producción de admin estaba ROTO** por el cambio de barrel de ayer (AdminSidebar 'use client' → barrel de cortesías → server.ts/next/headers). typecheck NO lo veía | Deep import restaurado con comentario de excepción; **CI ahora corre `pnpm build`** para que nunca vuelva a pasar |
| ALTA | `sendToKitchen` concurrente (doble click / dos terminales) imprimía la MISMA tanda dos veces → cocina preparaba doble | Guard optimista por fila (`updateMany WHERE sentToKitchenQty=<leído>`) + retry de serialización |
| ALTA | Doble-click en "Cuenta" creaba DOS cuentas abiertas (key idempotente nueva por click, sin ref síncrona) | `submittingRef` síncrono (mismo patrón que el checkout) |
| ALTA | Mi fix de conciliación de ayer amplió la ventana pero NO el fetch: en UTC-5 las ventas de 19:00-24:00 del último día del extracto seguían escapando del flag | Ventana calculada ANTES del fetch; candidatos cargados hasta `max(periodTo+24h, finVentanaLocal)` |
| ALTA (deploy) | `CORS_ORIGINS` es crash-al-boot en prod y NO estaba en deploy.md; deploy.md documentaba OpenWA (no Kapso), decía que cocina estaba "eliminada", faltaban `BUSINESS_NIT/PHONE`, `NEXT_PUBLIC_SITE_URL` | deploy.md corregido completo; `assert-env` ahora exige `CORS_ORIGINS`+`STORAGE_PROVIDER` en prod y WARNea features silenciosas (`OWNER_WHATSAPP_PHONE`, `PRINTER_PROVIDER`, `TZ`, `KAPSO_*`); `.env.example` reescrito (estaba lleno de vars muertas de Mapbox); `apps/cocina/vercel.json` creado |
| MEDIA | `addCashMovement`/update/delete corrían READ COMMITTED → un movimiento podía colarse ENTRE el cómputo del esperado y el CLOSED del cierre (mismo bug que el cobro, flanco que quedó abierto ayer) | Los 3 ahora en tx SERIALIZABLE con re-check y retry |
| MEDIA | Cuenta abierta quedaba CONGELADA para edición si la caja que la creó cerraba (pero sí se podía cobrar) — rompía el propósito del feature | `editItems` permite editar tabs `PENDIENTE_PAGO` con caja original cerrada |
| MEDIA | Void/reembolso de venta histórica SIN filas en sale_payments no registraba la salida de plata (OUT vacío → faltante falso) | Fallback: un OUT por el total con el método resumen |
| MEDIA | Descuento manual "activo" seguía mostrado al caer la red aunque NO aplica offline (total oscilaba en silencio) | Banner rojo explícito "Sin conexión: el descuento NO aplica" |
| MEDIA | Cobrar/editar una cuenta desde el panel usaba el snapshot de la lista (hasta 15s viejo) | Refetch de la venta al abrir el modal (backend igual re-valida) |
| MEDIA | Split abierto + caída de red dejaba el cobro clavado en un flujo online inalcanzable | El split se cierra solo al pasar a offline |
| BAJAS (9) | `discountReason` colgado al quitar descuento; positivos extra en batch FIFO corrupto dropeados; `BUSINESS_NAME=""` → variable de template vacía (Meta rechazaría TODO); decimales con coma en DiscountModal; huérfanos re-inyectados por el modal; promos del panel sin refresh; `listSales` sin timeout (clavaba el polling); comentario mentiroso de voidCount; defensa en profundidad `openTab`→COUNTER | Todos arreglados |

**Aceptado sin cambio (documentado):** `open()` puede timeoutear esperando el advisory lock de un cierre lento (>5s, error recuperable); `unknownQty` residual en cortesía reversada que sobre-consumió (sin impacto: REVERSED no suma al reporte); premisa de `localDayStart` con CSVs mixtos UTC/local (extractos reales son date-only); gaps de `receipt_seq` por diseño (comentado en código).

### 1.D — SEGURIDAD (APARTADA por decisión del usuario — retomar después)

Documentado completo pero NO se está trabajando ahora. Resumen de lo confirmado:
- **[MEDIA] Print-agent** `apps/print-agent/src/main.ts` — ✅ **YA ARREGLADO** (bind 127.0.0.1 sin secret; timing-safe con secret). Único de seguridad tocado.
- [MEDIA] `/ingredients` GET filtra `lastUnitCost` a roles no-admin (inconsistente con products). PENDIENTE.
- [BAJA] Brute-force PIN de aprobación (throttle solo por IP). PENDIENTE.
- [BAJA] `reject` de facturas sin Zod. PENDIENTE.
- [BAJA] Upload de audio del display sin magic-byte. PENDIENTE.
- [BAJA] Leak de Blob URL en `SlideEditModal.tsx:35` (createObjectURL sin revoke). PENDIENTE.

---

## 2. AJUSTES NUEVOS (los 13 del usuario) — estado

### ✅ HECHOS y verificados

**#4 — Ver porciones aunque esté en kilos.**
Decisión: PORCIÓN CANÓNICA POR INSUMO/SUBPRODUCTO (un tamaño por ítem).
- Schema: `portionSize Decimal?` en `ingredients` y `subproducts`. Migración `20260704130000_portion_size`.
- Types: `IngredientSchema`/`SubproductSchema`/`Create*` + `StockableSchema` (campos `portionSize` y `portions` = `currentStock/portionSize`, 2 dec, null si no hay porción; `portionsOf` guardea 0/neg/NaN).
- API: mappers en `inventory.service.ts` (`ingredientToStockable`/`subproductToStockable`; reventa directa siempre `portions:null`), `ingredients.service.ts`, `subproducts.service.ts`.
- UI: `IngredientForm`, `SubproductForm` (input opcional), `StockTable` admin (col Porciones), cocina `InventarioView` (badge porciones).

**#5 — Cortesías/descuentos sin aprobación, solo notificar.**
Decisión: auto-aprobar + reversa admin (preserva exactitud de inventario).
- Cortesías nacen `APPROVED` en `create` → descuentan stock a FIFO en la MISMA tx + `void ownerNotifications.alert('cortesia_given', …)`.
- Admin **anula**: `POST /cortesias/:id/reverse` → status `REVERSED` (nuevo enum, migración `20260704120000_cortesia_reversed_status`) + movimientos compensatorios (`sourceType='cortesia_reversal'`) que devuelven la cantidad exacta por neto. Guard TOCTOU (updateMany WHERE status='APPROVED').
- Reporte COGS filtra `status='APPROVED'` → REVERSED sale del costo (verificado e2e con `given-summary`).
- Flujo legacy `resolve()` (PENDING→APPROVED/REJECTED) preservado para filas históricas.
- Bug B7 (`salePrice`) arreglado de paso.
- Audit: `CORTESIA_REVERSED` (+ labels en admin action-labels/bitácora). Alert kind `cortesia_given`.
- UI admin `CortesiasPanel`: tab "Registradas" default + botón "Anular". POS copy "registra/regala".
- ⚠️ **Limitación conocida (ver §3):** la reversa devuelve cantidad OK pero re-inyecta al FIFO a costo `null`.

**#6 — Producción de cocina con evidencia, sin aprobar.**
La producción YA era inmediata; se agregó solo la evidencia (foto).
- Schema: `evidence_key` en `inventory_movements`. Migración `20260704140000_production_evidence`. Se guarda en el movement +N (delta>0 PRODUCTION).
- Types: `RecordProduction.evidenceKey`, `ProductionRun.evidenceUrl`, `ProductionEvidenceUpload`, `InventoryMovement.evidenceUrl`.
- API: `POST /subproducts/production/evidence` (Multer, `@KitchenAccess`, magic-byte, 8MB) → `storage.put('production')`; `GET /subproducts/production/:runId/evidence` sirve la foto. `getEvidence`/`uploadEvidence` en `production.service.ts`.
- UI: cocina `ProduceModal` (file picker `capture=environment`); admin `MovementsTable` muestra link "📷 Evidencia".

**#7 — Conteo de inventario del cocinero CON aprobación del admin.**
- Schema: `status CountStatus(PENDING/APPROVED/REJECTED)` + `resolved_by_id/at`, `resolver_note` en `stock_counts`. Migración `20260704150000_stock_count_approval` (default APPROVED → conteos previos/admin quedan inmediatos).
- Lógica: `StockCountsService.register(input, userId, {autoApprove})`. Admin=`true` (inmediato, como antes). Cocinero (`/kitchen/count`)=`false` → PENDING, NO ajusta.
- `approve()`: aplica `delta = difference` GUARDADA al momento del conteo (NO recalcula vs ledger actual → preserva ventas/producción entremedio). **Supersede** (rechaza) los otros PENDING del mismo stockable dentro de la tx (fix del doble-conteo, ver §3). `reject()` no ajusta.
- API admin: `GET /inventory/counts/pending`, `POST /inventory/counts/:id/approve|reject`.
- UI: cocina `CountForm` (copy "pendiente de aprobación"); admin `PendingCountsPanel` en `/inventory/counts`.
- Audit: `STOCK_COUNT_APPROVED`, `STOCK_COUNT_REJECTED`.

### ✅ BLOQUE DE VENTAS — HECHO (2026-07-05) y verificado

Implementado en una sola pasada (migración `20260705100000_open_tabs_and_manual_discounts` +
suite e2e nueva `open-tabs-discounts.e2e-spec.ts`, 9 tests):

- **#3 — Cuentas abiertas + comanda incremental. HECHO.**
  - `sales.is_open_tab` (COUNTER, requiere `customerName`; Zod superRefine). Vive en
    PENDIENTE_PAGO indefinidamente: **exenta del sweep** (`StaleSalesSweepService` filtra
    `isOpenTab:false`, e2e lo cubre).
  - **Comanda incremental por tanda**: `sale_items.sent_to_kitchen_qty` + `sent_to_kitchen_at`.
    `POST /sales/:id/send-to-kitchen` estampa lo pendiente y devuelve AMBAS variantes de
    comanda ESC/POS (cocina/completa) SOLO con lo nuevo; tanda 2+ sale rotulada "ADICIÓN".
    `editItems` preserva lo enviado por huella de línea (carry-over, e2e).
  - La "regla de cocina" no hacía falta invertirla: la cuenta abierta vive en PENDIENTE_PAGO,
    donde `editItems` ya permite editar todo. Al COBRAR la cuenta, `sendTabToKitchen` imprime
    solo lo pendiente (no re-imprime lo ya enviado).
  - Caja cruzada: si la caja original cerró, el cobro re-cuelga la venta de la caja abierta
    del que cobra (`resolvePaymentShift`); sin caja abierta → 400.
  - POS: botón "Cuenta" en el carrito (crea + manda tanda 1 + limpia), panel de pedidos con
    acciones Cobrar / Agregar-editar / A cocina (badge de pendientes) / Cancelar.
- **#5b — Descuento manual. HECHO.**
  - Por línea (`sale_items.manual_discount_kind/value`, monto en `line_discount`) y sobre el
    total (`sales.order_discount_kind/value/amount`); FIJO y %; CHECKs en DB.
  - **EXCLUYENTE con promos** (server y POS espejan la regla vía
    `manualDiscountAmount` puro en `@pos-tercos/domain/common`). Motivo obligatorio
    (`sales.discount_reason`), audit `SALE_MANUAL_DISCOUNT` + alerta WhatsApp al dueño
    (`buildManualDiscountAlertMessage`, kind `manual_discount`).
  - `discount_total = Σ line_discount + order_discount_amount` → recibo ESC/POS y reportes
    (byMethod lee sale_payments) no necesitaron cambios.
  - Split "por productos" se deshabilita si hay descuento SOBRE EL TOTAL (las líneas no lo
    reflejan); offline los descuentos manuales se ocultan/ignoran (el sync no los representa).
  - `editItems` acepta setear/quitar el descuento sobre el total (e2e).
- **#1 — Nombre de cliente COUNTER. HECHO.** Input "Cliente" en el carrito → `customerName`
  (sale en comanda y recibo).
- **#2 — Panel de pedidos en la vista principal. HECHO.** `OrdersPanel` (izquierda, ≥lg):
  cuentas abiertas con acciones + últimos pedidos del día con estado; polling 15s +
  evento `pos:orders-changed`.
- **#8 — Comanda de cancelación grande. HECHO.** El render `cancelled` ya existía; ahora se
  dispara donde importa: al ANULAR una venta pagada (VoidModal) y al cancelar una cuenta
  abierta con tandas ya enviadas (OrdersPanel).
- **B1-B4 cerrados** (ver §1.A).

**#9 — Garantizar FIFO. ✅ CERRADO (2026-07-05).**
- Limitación §3.1 cerrada: la anulación de cortesía devuelve la base de costo REAL (draws
  registrados en el replay + `returnDraws` compartido con el void; sin lotes fantasma).
- Auditoría dedicada de `run-ledger.ts` corrida (§1.C): 3 bugs MEDIA/BAJA arreglados
  (lote $0 en producción sin consumos, shortfall fantasma, batch malformado) + bordes
  verificados OK (desempate causal, reversos parciales, unknownQty, sub-subproductos).
  `run-ledger.test.ts` quedó en 32 tests (154 domain total).

**#10 — Sin fugas financieras. ✅ CERRADO (2026-07-05).**
- B5/B6/B8/B9 + auditoría §1.C completa (reportes, shifts/treasury/payables, inventario,
  crons, frontends, código muerto) con TODOS los hallazgos ALTA/MEDIA arreglados y los
  aceptados documentados (ver §1.C).

**#13 — Abuso del pedido web / saturación WhatsApp.** `POST /web/orders` es público y cada pedido dispara un WhatsApp → spam posible (dentro del rate 30/min o rotando IP → costo/baneo WhatsApp + ventas basura). Parte seguridad → apartada; parte diseño → con #11.

**#11 — Repensar pedidos-cliente + WhatsApp automatizado.** CHARLA con el usuario ANTES de codear. Al final de todo.

**#12 — Viabilidad de despliegue.** Smoke test integral + decisión. Depende de #3, #9, #10.

---

## 3. LIMITACIONES / DEUDA TÉCNICA CONOCIDA (documentar, no olvidar)

1. ~~**[FIFO] Reversa de cortesía re-inyecta a costo desconocido**~~ ✅ **CERRADA (2026-07-05)** —
   el ledger registra los draws de la cortesía y la reversa devuelve la base de costo real
   (ver §2 #9). Solo datos LEGACY (reversas hechas antes del fix) siguen entrando como lote
   de costo desconocido — correcto: nunca se asume $0.

2. **DB de dev sin migrar (P3005)** — ver §0.

3. **[Cuentas abiertas] Quitar una línea YA enviada a cocina no imprime corrección** — la
   comanda incremental solo expresa ADICIONES. Si el cajero quita/achica una línea ya
   enviada de una cuenta abierta, debe avisar a cocina de voz (o la comanda "PEDIDO
   MODIFICADO" del flujo de ventas pagadas). Documentado en `sales-edit.service.ts`.

4. **[Offline] Descuentos manuales no disponibles offline** — el payload de sync no los
   representa (y B5 ahora exige consistencia aritmética). La UI los oculta sin red. Si se
   quisieran offline, extender `SyncOfflineSaleSchema` con los campos de descuento.

---

## 4. DECISIONES CERRADAS (no re-litigar)

- #4 porción: canónica POR INSUMO (no por producto/receta).
- #5 cortesías: auto-aprobar + reversa admin (no "solo registrar sin tocar stock", que rompería inventario).
- #5 "descuento" ≠ cortesía: descuento manual es flujo APARTE a construir (#5b).
- #5b: línea+total, fijo+%, EXCLUYENTE de promos.
- #7 conteo: PENDIENTE hasta aprobación del admin (el conteo sí necesita validarse).
- #6 producción: evidencia opcional, sin aprobación (ya era inmediata).
- Seguridad: apartada por ahora, foco en código/funcionalidad.
- Modelo: trabajar con Fable 5; lo que requiera Opus 4.8, dejarlo PENDIENTE y omitirlo (no cambiar de modelo).

---

## 5. MIGRACIONES NUEVAS de esta tanda (aplican en test/prod vía `prisma migrate deploy`)

```
apps/api/prisma/migrations/
├── 20260704120000_cortesia_reversed_status/   # enum CortesiaStatus += REVERSED
├── 20260704130000_portion_size/               # ingredients+subproducts.portion_size
├── 20260704140000_production_evidence/         # inventory_movements.evidence_key
├── 20260704150000_stock_count_approval/        # stock_counts.status + resolver cols + enum CountStatus
└── 20260705100000_open_tabs_and_manual_discounts/  # sales.is_open_tab + descuento manual (sales + sale_items) + sale_items.sent_to_kitchen_qty/_at + CHECKs
```

---

## 6. CHECKLIST ANTI-CÓDIGO-MUERTO (verificar al cerrar cada bloque)

- [x] Bloque de ventas: el sweep respeta `isOpenTab` (e2e) y el CheckoutModal ya no cancela al
      cerrarse (la venta se crea recién al confirmar; no hay cancel-on-close que ajustar).
- [ ] `resolve()` legacy de cortesías (`cortesias.service.ts`): sigue vivo para filas PENDING históricas.
      Si se confirma que NO hay filas PENDING en prod tras el deploy, evaluar eliminarlo (endpoints
      `approve`/`reject` de cortesías quedarían muertos). Por ahora se conserva.
- [ ] Enum `CortesiaStatus.PENDING`/`REJECTED`: quedan solo por compat legacy. No usar en flujos nuevos.
- [x] #9 (FIFO): limitación §3.1 resuelta (reversa de cortesía con base de costo real).
- [x] Barrido de código muerto (§1.C, 2026-07-05): 0 exports muertos en types/domain, 0 deps
      huérfanas; 2 archivos huérfanos borrados; endpoints sin caller = triggers manuales
      documentados (se conservan). Componentes >200 en admin = deuda listada sin bugs.
- [ ] Verificación obligatoria antes de dar por cerrado cualquier item:
      `pnpm typecheck` + `pnpm -F @pos-tercos/domain test` + `pnpm -F @pos-tercos/pos test` +
      `cd apps/api && pnpm test:e2e` + `pnpm lint`.

---

## 7. ORDEN SUGERIDO para el contexto nuevo (actualizado 2026-07-05)

1. ~~**Bloque de ventas**~~ ✅ HECHO — #3 + #5b + #1 + #2 + #8 + B1-B4.
2. ~~**Hardening B5/B6/B8/B9 + limitación FIFO §3.1**~~ ✅ HECHO.
3. ~~**Auditoría §1.C completa (#9/#10)**~~ ✅ HECHA (2026-07-05) — 6 áreas auditadas con
   agentes, todos los ALTA/MEDIA arreglados, aceptados documentados (ver §1.C).
4. **#11 WhatsApp — RESUELTO por código (2026-07-05):** Kapso (Cloud API oficial) reemplaza
   a OpenWA; Fases A+B codeadas (adapter + templates + toggle `WHATSAPP_TEMPLATES_ENABLED`).
   El go-live es 100% operativo: **checklist paso a paso en `kapso-setup.md` (sección
   "CHECKLIST GO-LIVE")** — chip +57 → registrar número → 5 templates → env vars → smoke.
   **#13 (anti-abuso del pedido web) sigue pendiente de charla** antes de codear.
5. **#12** (smoke test integral + viabilidad deploy). Nota: el código está verificado por
   suites (179 e2e); falta el smoke MANUAL con las apps corriendo (login→vender→cuenta
   abierta→descuento→cierre de caja) y decidir fecha de deploy.
6. (Después, si se retoma) **Seguridad** §1.D — sigue apartada a propósito.
