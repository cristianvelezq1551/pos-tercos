# Auditoría pre-QA completa + Checklist por fases — 2026-07-20

> Rama `feat/unify-pos-admin`. Auditoría con 9 agentes (diff sin commitear, unificación POS→admin,
> backend crítico, prod-readiness, web+cocina, FIFO/COGS, módulos financieros, invariantes de dinero,
> mapa funcionalidad↔tests) + validaciones ejecutadas. Contexto: **apps/pos NO va a producción**;
> el POS vive en apps/admin (`/caja`).
>
> **Validaciones ground-truth del día:** typecheck 13/13 ✅ · lint 0 ✅ · unit 426/426 ✅ ·
> e2e 306/307 (la falla es un test dependiente del calendario, ver F4.1).

---

## Resumen ejecutivo

- **El motor puro está sólido**: `runLedgerFifo` (FIFO, reversos con costo original, producción,
  deudas de stock sin doble conteo, snapshots equivalentes) y el ciclo transaccional de venta
  (TOCTOU, serializable+retry, split, void, cierre) pasaron una revisión hostil sin hallazgos.
- **Los bugs graves están en las costuras**: la caché del ledger (COGS histórico ≈ $0 intermitente),
  el diff sin commitear de delivery fee (3 bugs), el cutover de roles CAJERO→admin sin ejecutar,
  y divergencias preview↔server en promos (activeTo timezone, COMBO_OFF).
- **Tests**: excelentes en el core transaccional; **cero cobertura** en purchase-suggestions,
  camino IA de facturas, reportes financieros del dueño, retry WhatsApp y apps/cocina.

---

## FASE 0 — Bloqueantes de dinero y cutover ✅ IMPLEMENTADA (2026-07-21)

> Nada de esto es opcional: o el cliente paga mal, o el dueño lee números falsos, o nadie puede vender.
>
> **Estado:** los 8 ítems implementados. Verificado: typecheck 13/13, lint 0, unit (domain 265
> +6, admin 65 +2, pos 65 +2), e2e web-delivery 26/26 (+3 nuevos) + cogs/ledger/promos/sales-edit
> sin regresión. Decisión del dueño en 0.5: reasignar CAJERO→ADMIN_OPERATIVO (NO gate por sección);
> el DUEÑO NO opera caja (se mantiene requireOperativoServer). Falta commitear.

- [x] **0.1 Caché del ledger COGS sirve incremental a reportes históricos → COGS del mes pasado ≈ $0 intermitente.**
  FIX: el modo full/incremental se resuelve ANTES de consultar la caché (`cogs.service.ts:85-125`).
  Verificado por razonamiento + suites cogs/ledger-snapshot verdes. Pendiente (follow-up): e2e
  dedicado de "caché templada + rango histórico" — requiere una fila Sale real pre-corte que el
  suite de snapshot hoy no tiene (usa movimientos crudos sin paidAt).

- [x] **0.2 `editItems` pierde el `deliveryFee` → 500 al editar un domicilio con envío.**
  FIX: `sales-edit.service.ts` suma `Number(existing.deliveryFee)` al total. E2E web-delivery: "editar
  los ítems preserva el envío en el total".

- [x] **0.3 Re-asignar el fee ("Cambiar") nunca re-avisa al cliente.**
  FIX: `setDeliveryFee` libera `notified_payment_instructions` en el mismo `updateMany` cuando el fee
  CAMBIA → el notify re-dispara con el total nuevo; mismo fee = no reenvía. E2E: reenvío + idempotencia.

- [x] **0.4 La web muestra instrucciones de pago con el total viejo.**
  FIX: `OrderStatusView.tsx` usa `order.paymentInstructions ?? paymentInstructions` (poller fresco,
  SSR de fallback). El GET `/web/orders/:id` ya reconstruye el texto con `order.total` fresco.

- [x] **0.5 Cutover de roles CAJERO→admin.** DECISIÓN: reasignar CAJERO→ADMIN_OPERATIVO; DUEÑO NO opera
  caja. FIX: migración `20260721000000_reassign_cajero_to_operativo` (UPDATE idempotente) + form default
  ADMIN_OPERATIVO + CAJERO fuera de `ROLE_OPTIONS` + seed dev. `ADMIN_ALLOWED_ROLES` y
  `requireOperativoServer` quedan como están (correctos con la decisión).

- [x] **0.6 Promo con `activeTo` NO aplica su último día (backend vs preview).**
  FIX: `PromotionDef.activeFrom/activeTo` pasan de `Date` a `YYYY-MM-DD` string; el motor compara contra
  el día calendario LOCAL de la venta (lexicográfico, TZ-independiente). E2E domain: 6 casos de borde.

- [x] **0.7 COMBO_OFF: el backend lo cobra, el preview del POS no lo muestra.**
  FIX: `CartLine.isCombo` traqueado punta a punta (picker → store → totals) en admin y pos;
  `getPromoBadge`/`getLinePromoDiscount`/`getActivePromoBadge` reciben `isCombo`; EditSaleModal lo deriva
  del catálogo. E2E vitest: aplica si isCombo, no si no. (La web mantiene su preview documentado sin
  pérdida — backend autoritativo; threading completo = Fase 1.)

- [x] **0.8 E2E que fijan 0.2-0.7** — verdes: web-delivery (+3), domain apply-promotions (+6), admin/pos
  totals (+2 c/u).

## FASE 1 — Correcciones de dinero de segundo orden ✅ IMPLEMENTADA (2026-07-21)

> **Estado:** los 13 ítems implementados. Decisiones del dueño: 1.3 redondear a peso entero, 1.4
> prohibir fee=0, 1.2 restar la merma del neto. Verificado: typecheck 13/13, lint 0, unit (domain
> 270, admin/pos 65, web 16, api 25), e2e 29 suites verdes. Falta commitear.

- [x] **1.1 P&G devenga nómina con reglas distintas a la real → "Nómina (auto)" inflada ~$240k/mes.**
  FIX: la rama DAILY de `computeMonthlyBase` ahora recorre solo los días laborables de `payrollWeekFor`
  (descanso sistémico del lunes + festivos), espejo EXACTO de `buildEntry` — antes contaba días calendario
  saltando solo `restDaysOfWeek` (vacío). MONTHLY ya era consistente.

- [x] **1.2 `netResult` no resta la merma.** DECISIÓN: restarla. FIX: `netResult −= wasteCost`; campo
  `wasteCost` en el statement + schema + línea en PnlCard.

- [x] **1.3 Totales con centavos rompen split y reconciliación.** DECISIÓN: redondear a peso entero.
  FIX: `roundMoney` pasa de 2 decimales a PESO ENTERO (COP no tiene centavos) — fuente única, preview==cobro.
  Tests de money/manual-discount/pocket-split actualizados.

- [x] **1.4 `deliveryFee = 0` + cobro sin fee.** DECISIÓN: prohibir fee=0. FIX: `SetDeliveryFeeSchema`
  exige `positive()`; `confirmPayment` bloquea WEB_DELIVERY con fee 0; aviso en ConfirmWebPaymentModal.
  E2E: fee=0 rechazado + cobro sin fee bloqueado.

- [x] **1.5 Recibo sin línea de envío.** FIX: `ReceiptData.deliveryFee` + línea "Domicilio" en ESC/POS y
  HTML + mapper. Test ESC/POS.

- [x] **1.6 FIFO: void tras lote `unitCost=null` perdía unidades.** FIX: el draw se registra también en el
  fill de costo desconocido, con la base que la venta cargó (estimado/null) → el void netea a 0 y devuelve
  las unidades. 2 tests nuevos en run-ledger (51 total).

- [x] **1.7 Override/ajuste sobre semana abonada → remaining negativo.** FIX: guard `assertNoNegativeRemaining`
  en setPayrollDay/deleteWeeklyAdjustment (pre-check por delta) y deletePayrollDay (deshacer y bloquear).
  E2E: overpay bloqueado con "NEGATIVO".

- [x] **1.8 Deuda vieja desaparece del lookback.** FIX: nómina 16→26 semanas, costos fijos 6→24 meses +
  comentarios honestos.

- [x] **1.9 `quantity` sin tope.** FIX: `.max(MAX_SALE_LINE_QTY=999)` en CreateSaleItem y SyncOfflineLine.

- [x] **1.10 `POST /sales` acepta WEB_DELIVERY sin dirección.** FIX: `CreateSaleSchema.superRefine` exige
  `deliveryAddress` para WEB_DELIVERY (espeja el web).

- [x] **1.11 `setDeliveryFee` lee subtotal fuera de tx.** FIX: `updateMany` condicionado también por
  `subtotal`/`discountTotal` → una edición concurrente da 400 limpio, no 500.

- [x] **1.12 Exponer `estimatedQty`.** FIX: `saleCost` agrega estimatedQty; `PnlReport.cogsEstimatedQty` +
  `MonthlyFinancialStatement.cogsEstimated` + aviso en PnlCard.

- [x] **1.13 Tesorería.** DECISIÓN: documentar. FIX: doc block en `getSummary` con las 4 limitaciones
  conocidas (refund pre-ancla, movimientos backdateados, method==='CASH', payable sin unmark).

## FASE 2 — Estabilidad de producción y deploy ✅ IMPLEMENTADA (2026-07-21)

> **Estado:** los 15 ítems resueltos (8 fixes de código + `deploy.md` reescrito + operativos
> documentados). Verificado: typecheck 13/13, lint 0, unit (domain 271, api 25), e2e 29 suites.
> Nuevas env vars: `WHATSAPP_REQUIRED`, `ALLOW_LOCAL_STORAGE`, `TRUST_PROXY_HOPS`. Falta commitear.
>
> - [x] **2.1** deploy.md reescrito: `/healthz` (era `/health`→404), topología (admin unificado +
>   web/cocina/display, sin apps/pos), sección delivery + cutover de roles (§0.5/§0.6), §5 migraciones
>   (~82 reales + aviso `dynamic_payment_methods` sobre datos), Kapso en vez de OpenWA.
> - [x] **2.2** `NEXT_PUBLIC_API_WS_URL` + `NEXT_PUBLIC_PRINT_AGENT_URL` movidas a la sección Admin.
> - [x] **2.3** guard anti-prod en `seed-dueno.ts` (mismo que seed.ts).
> - [x] **2.4** `assertRequiredEnv` valida `STORAGE_PROVIDER∈{local,r2}` / `PRINTER_PROVIDER∈{local,escpos}`;
>   prod rechaza `local` salvo `ALLOW_LOCAL_STORAGE=1`.
> - [x] **2.5** `WHATSAPP_REQUIRED=true` → boot crashea sin proveedor (en vez de arrancar mudo).
> - [x] **2.6** template `delivery_en_camino` + bifurcación en `buildNotificationTemplate` (domicilio "listo"
>   ya no dice "retirar en el local"). Test.
> - [x] **2.7** `@@index([shiftId, method])` en CashMovement (evita el DROP del próximo migrate dev).
> - [x] **2.8** caché TTL 15s en el `getAvailabilityCached` del endpoint PÚBLICO; el interno (cajero) fresco.
> - [x] **2.9** `TRUST_PROXY_HOPS` configurable (CF→Railway = 2); documentado verificar `req.ip` en QA.
> - [x] **2.10/2.11/2.12/2.13** documentados en deploy.md (migración sobre datos en ventana muerta, backup
>   secrets + restore drill, UptimeRobot `/healthz`, datos día 1: categorías/cold-start/gates).
> - [x] **2.14** `GET /shifts/:id/cash-movements` con `assertShiftOwnership`.
> - [x] **2.15** `GET /sales?type=` validado contra `SaleTypeEnum` (400 en vez de 500).

<details><summary>Detalle original de los ítems</summary>

- [ ] **2.1 Reescribir `deploy.md`:** healthcheck es `/healthz` (el doc dice `/health` → Railway mataría el
  servicio en loop); topología real de Vercel (admin unificado, web, cocina, public-display — sin apps/pos);
  sección delivery; §5 migraciones (~80 reales, el doc lista ~20); §6.bis producción.
- [ ] **2.2 Env vars del admin unificado:** `NEXT_PUBLIC_API_WS_URL` y `NEXT_PUBLIC_PRINT_AGENT_URL`
  (hoy documentadas solo bajo POS). Sin ellas: socket de pedidos web e impresión apuntan a localhost —
  **la comanda falla en el momento de la venta**.
- [ ] **2.3 Guard anti-prod en `seed-dueno.ts`** (crea `dueno@dev.local`/`dev12345`/PIN 123456 sin el
  guard que sí tiene `seed.ts`).
- [ ] **2.4 Validar `STORAGE_PROVIDER ∈ {local,r2}` y `PRINTER_PROVIDER ∈ {local,escpos}` en
  `assertRequiredEnv`** — hoy un typo degrada a `local` en silencio = pérdida de fotos de
  facturas/comprobantes en cada redeploy de Railway. En prod, rechazar `local` salvo override.
- [ ] **2.5 WhatsApp obligatorio en prod:** ausencia total de `KAPSO_*`/`OPENWA_*` arranca con mock sin
  bloquear boot — y el pedido web + el canal de alertas dependen 100% de WhatsApp. Flag
  `WHATSAPP_REQUIRED=true` en prod o promover a env requerida.
- [ ] **2.6 Templates Kapso no conocen delivery:** con `WHATSAPP_TEMPLATES_ENABLED=true` un domicilio
  despachado recibe "te esperamos en el local" y las instrucciones no dicen "incluye el domicilio".
  Variante delivery de `pickup_ready`/`payment_instructions` antes de activar templates.
- [ ] **2.7 Drift schema↔migraciones:** agregar `@@index([shiftId, method])` a `CashMovement` en
  `schema.prisma` — el próximo `migrate dev` DROPea `cash_movements_shift_id_method_idx` (sirve el arqueo
  digital). Normalizar el drift cosmético restante.
- [ ] **2.8 Caché TTL (15-30s) en `GET /products/availability`** — `@Public`, 3 groupBy full-table sobre
  `inventory_movements` (insert-only, crece para siempre); a 12-18 meses degrada el API entero.
- [ ] **2.9 `trust proxy` con Cloudflare→Railway (doble hop):** verificar `req.ip` real en QA — mal
  configurado, el throttler agrupa a todos en la IP del edge (auto-DoS del login).
- [ ] **2.10 Migración `dynamic_payment_methods` sobre datos** = table rewrite con lock exclusivo en
  `sales`/`sale_payments` — en QA con datos, aplicar en ventana muerta. `pg_dump` manual pre-migración.
- [ ] **2.11 Backup armado día 1:** secrets de GitHub (`RAILWAY_DB_URL`, `R2_*`), `workflow_dispatch` de
  prueba, restore drill real, `HEALTHCHECKS_URL` (dead-man's switch).
- [ ] **2.12 UptimeRobot sobre `/healthz`** — única alerta que no depende de WhatsApp.
- [ ] **2.13 Datos día 1:** usuario dueño manual + PIN, categorías en `/categories` ANTES de crear
  productos (products.create exige categoría existente y la DB fría no tiene), cold start de subproductos
  (§7.v4), gates web (horario/radio/delivery/kill-switch) confirmados en el estado que el dueño quiera,
  `TZ=America/Bogota` + `NODE_ENV=production` + `CORS_ORIGINS` en Railway.
- [ ] **2.14 `GET /shifts/:id/cash-movements` sin `assertShiftOwnership`** (único endpoint de caja sin el
  check — inconsistente con la política).
- [ ] **2.15 `GET /sales?type=` sin validar contra enum → 500** (misma clase que el fix B9). 400 limpio.

</details>

## FASE 3 — Robustez frontend ✅ IMPLEMENTADA (2026-07-21)

> **Estado:** los 9 ítems resueltos. Verificado: typecheck 13/13, lint 0, unit sin cambios, e2e
> (kitchen merma idempotente + payment-methods gate operativo). Falta commitear.

- [x] **3.1** `geoBlocking = type==='WEB_DELIVERY' && geo.blocked` + reset del geo al pasar a "Recoger"
  (`onType`). El botón ya no queda trabado por un `blocked` residual.
- [x] **3.2** idempotency-key por SESIÓN (no por intento): checkout web (`useState(() => randomUUID())`) y
  producción cocina (key renovada en `reset()`). Un reintento reusa la key → el backend devuelve el
  ganador en vez de duplicar el pedido/tanda.
- [x] **3.3** `WasteModal.close()` resetea `pending` (fin del modal congelado); + idempotency-key de merma
  end-to-end (`RegisterWaste.idempotencyKey` → `createMovement`). E2E de kitchen.
- [x] **3.4** `OrderStatusView` bifurca por `deliveryAddress`: título "¡Va en camino!", subtitle "va en
  camino 🛵", banner con la dirección de entrega (antes "Acércate al mostrador" a todos).
- [x] **3.5** `friendlyOrderError` mapea 429/Zod/not-found a español (respeta los de negocio ya en
  español); `maxLength={300}` en dirección/referencias; `error.tsx` + `not-found.tsx` con branding.
- [x] **3.6** `SendOrderByWhatsApp` sin teléfono muestra un reaseguro ("te vamos a escribir…") en vez de
  `null` → nunca deja la pantalla sin CTA.
- [x] **3.7** decode async + `fetchPriority=low` en el fondo difuminado. El fix GRANDE (descargar imagen
  redimensionada) queda como **follow-up documentado**: depende del delivery de media de prod (Cloudflare
  Image Resizing o `next/image` con dominio R2 no presignado) — configurarlo a ciegas rompería el render.
- [x] **3.8** `/medios-pago` Dueño-only (`requireRole(['DUENO'])` + `onlyDueno` en sidebar) **y las
  escrituras del backend a `@OnlyDueno`** (defensa real: el operativo no puede saltarse la UI y pegarle a
  la API). E2E: operativo → 403 en create/update/delete, 200 en el GET de habilitados.
- [x] **3.9** `DeliveryFeeField` resincroniza el input vía `useEffect` cuando otro dispositivo asigna el
  fee. (El acoplamiento por string del error "stock insuficiente" en `ConfirmWebPaymentModal` se deja
  como está — funciona hoy, rated BAJO; refactor a error estructurado = follow-up.)

## FASE 4 — Tests ✅ IMPLEMENTADA (2026-07-21)

> **Estado:** los 10 ítems cubiertos. 7 suites e2e nuevas + 5 archivos de tests unit/domain.
> Verificado: typecheck 13/13, lint 0, domain 290, web 21, api unit 29, e2e ~35 suites. Falta commitear.
>
> - [x] **4.1** payroll-weekly inProgress robusto al borde (filtra por semana, no por flag); web-delivery
>   assertea el flag `notified_payment_instructions` en vez de un sleep.
> - [x] **4.2** CI `browser-e2e` apunta a **apps/admin** (`/caja`), no apps/pos; build+start en :3004. La
>   corrida local real de los 3 specs de admin queda como paso operativo (no se puede correr Playwright acá).
> - [x] **4.3** `purchase-suggestions.e2e` (5): scan crea PENDING con qty exacta (refill 2×), dedupe, STALE
>   al reponer, accept/reject.
> - [x] **4.4** domain `similarity.test` (7) + `prompt.test` (normalizeExtractedItems, 4) + api `image-mime.spec`
>   (PNG renombrado→PNG). El e2e completo con LLM mockeado queda como follow-up (necesita override del provider).
> - [x] **4.5** `force-available.e2e` (3): reventa sin forzar → 409; forzado con stock 0 → cobra + negativo +
>   `/inventory/stock?negative=true`; consumible (blocksAvailability=false) en 0 no frena pero descuenta.
> - [x] **4.6** `financial-reports.e2e` (2, por delta): venta conocida mueve revenue/COGS/neto en `/financial/monthly`
>   y `/dashboard`; la merma resta del neto (§1.2). Anomalías 2σ (necesita baseline 5+ shifts) = follow-up.
> - [x] **4.7** `whatsapp-retry.e2e` (3): reintento de un envío fallido (Mock reenvía), idempotencia por flag,
>   tope de 5 intentos.
> - [x] **4.8** `users-audit-permissions.e2e` (4): operativo → 403 en todos los endpoints de users;
>   terminate mata la sesión; `/audit?action=CSV` devuelve solo lo pedido + operativo 403 en /audit.
> - [x] **4.9** domain `apply-promotions.test` +time-window/day-mask (rango de fechas ya en §0.8); web
>   `promo.test` (5) espejo del motor de domain.
> - [x] **4.10** `render-receipt.test` (fallback HTML + línea de envío) + `image-mime.spec`. El
>   split/reconciliación con centavos quedó MOOT con §1.3 (peso entero); `round/round4` de sales-reports →
>   §5.4.

<details><summary>Detalle original de los ítems</summary>

- [ ] **4.1 Arreglar el e2e flaky de calendario:** `payroll-weekly.e2e-spec.ts:324` falla cuando hoy es el
  último día de la semana de nómina (**todos los domingos** y lunes festivos como hoy). Decidir la
  semántica del borde `weekEnd <= asOf` (§M3: la semana cuenta cerrada desde las 00:00 de su último día)
  y fijarla. También: `web-delivery.e2e-spec.ts:239` (sleep 800ms assertando ausencia → assertar el flag).
- [ ] **4.2 CI Playwright → admin:** el job `browser-e2e` corre `apps/pos` (la app que no va a prod); los
  specs de `apps/admin/e2e/` existen pero **jamás corrieron**. Apuntar CI a admin + una corrida local real
  (login→vender→cobrar→cerrar caja en `/caja`) + smoke offline con build de prod (el SW solo registra en
  production) + smoke hardware (impresora/cajón).
- [ ] **4.3 `purchase-suggestions` (773 líneas + cron horario): cero tests.** E2E mínimo: low-stock → scan
  crea PENDING con qty exacta; re-scan no duplica; reposición → STALE; accept/reject; guard `scanning`.
- [ ] **4.4 Camino IA de facturas: cero tests.** E2E con LLM mockeado (JSON con fences + items sucios →
  draft correcto; PNG renombrado → mime real; no-imagen → 400) + unit de `normalizeExtractedItems` y
  `similarity/bestMatch` en domain.
- [ ] **4.5 `forceAvailable` + consumibles en el COBRO (solo domain hoy):** e2e — producto forzado con
  insumo en 0 → cobro OK + negativo + deuda estimada; consumible no frena pero descuenta;
  `/inventory/stock?negative=true`; ciclo completo deuda → factura → costo corregido en PnL.
- [ ] **4.6 Reportes financieros del dueño sin asserts de montos:** e2e sembrando ventas/gastos conocidos →
  `/reports/financial/monthly`, `/dashboard`, `/reports/anomalies` (descuadre inducido flaggeado 2σ),
  top-products con descuento de orden.
- [ ] **4.7 `retryFailedMessages` + `owner-notification`:** adapter que falla 1 vez → retry único, cap 5,
  flags impiden duplicado.
- [ ] **4.8 Matriz de permisos `users`** (employment/terminate/pin/DELETE → 403 operativo; terminate mata
  sesión) + `GET /audit?action=CSV` (la herramienta anti-fraude del dueño, nunca consultada por un test).
- [ ] **4.9 Espejo web de promos:** vitest de `apps/web/promotions/lib/promo.ts` con los mismos fixtures
  de `apply-promotions.test.ts` (es el precio que VE el cliente). + tests de `withinActiveDates`
  (UTC-midnight, cubre 0.6), cross-midnight y daysOfWeekMask (hoy cero tests directos).
- [ ] **4.10 Split/reconciliación con centavos** (fija 1.3) + suites menores: suppliers histórico,
  reconciliation history/:id, `render-receipt.ts` HTML, `snapshot.ts` round-trip offline, cocina (primer
  test), `POST /sales/:id/print`.

</details>

## FASE 5 — Limpieza post-cutover ✅ IMPLEMENTADA (2026-07-21)

> **Estado:** cerrada. Verificado: typecheck 12/12 (era 13, sin apps/pos), lint 0, e2e sin cambios.
> Falta commitear.

- [x] **5.1 `apps/pos` RETIRADO** — 224 archivos borrados (`git rm`). Verificado: cero imports de código
  hacia apps/pos (solo comentarios "Portado de…" y allowlists de permisos, inofensivos). `pnpm-workspace`
  usa `apps/*` → borrar el dir lo saca del workspace; `pnpm install` actualizó el lock. Ya no se buildea/
  testea/typechea. CI `browser-e2e` ya apuntaba a admin (§4.2); corregido el path de artefactos.
- [x] **5.2 Tests admin↔pos deduplicados** — los 9 archivos duplicados se fueron con apps/pos; quedan solo
  las copias del admin (la app que va a prod).
- [x] **5.3 Decisiones documentadas** (aceptadas para v1 — el dueño las conoce; ver abajo).
- [x] **5.4 Higiene:** carrito web con `version: 1` + `migrate` en el persist; comentario de
  `production.service` YA estaba correcto (el "sesión próxima" ya se había limpiado); ranking de
  top-products documentado como aproximación (ordenar por neto exigiría fetch-all sin `take`, no vale el
  costo). NO tocados a propósito: `round/round4` de sales-reports (son redondeo de DISPLAY del reporte, y
  `round4` es de RATIOS —grossMarginPct—, no de dinero; cambiarlos alteraría reportes sin beneficio);
  `DB_NAME 'tercos-pos'` en el offline del admin (cosmético; renombrarlo orfanaría una cola offline
  existente — sin valor en pre-prod).

### 5.3 — Decisiones aceptadas (v1), documentadas para el dueño

Comportamientos deliberados que el dueño debe conocer al firmar QA (no son bugs):

1. **Concentración de poderes en ADMIN_OPERATIVO** — con el cutover, el operador de caja es
   ADMIN_OPERATIVO y tiene PIN de aprobación propio → **auto-aprueba** sus anulaciones, reembolsos y
   aperturas de cajón sin venta, y sus cortesías nacen aprobadas. Es la decisión "cajero de confianza".
   Mitigación: audit log inmutable + alertas WhatsApp al dueño + `/reports/anomalies` (2σ) + `/audit` y
   `/reports/*` son Dueño-only. Si el dueño quiere segregación estricta, hay que reintroducir un rol de
   caja sin PIN de aprobación (fuera de v1).
2. **Cortesía anulada en un mes posterior** — el PnL la resta en el mes de aprobación y la SUMA (neteo) en
   el mes de la anulación (`cortesiaCost` puede quedar negativo en M+1). El estado financiero neteado por
   solicitud da otro número al re-consultar M. El neteo GLOBAL es correcto; la atribución por período
   difiere entre reportes. Aceptado.
3. **`/finanzas` histórico no es una foto del cierre del mes** — el "pendiente" de un mes pasado se computa
   con los pagos de HOY (una deuda de julio "desaparece" al pagarla en agosto). Sin doble conteo; solo no
   es un snapshot congelado del cierre.
4. **Costo fijo del período corriente cuenta como deuda desde el día 1** — el arriendo de julio figura
   "pendiente" el 1-jul a las 00:00. Infla `commitmentsTotal` al inicio de cada mes. Decisión de diseño.
5. **PIN del operativo sin UI self-serve** — el operativo depende del dueño para (re)configurar su PIN de
   aprobación (`ChangeMyPinDialog` solo se monta en `/users`, Dueño-only). Aceptable para v1.

### 5.4 — Follow-ups menores diferidos ✅ CERRADOS (2026-07-21, commit `003500c`)

- ✅ e2e de IA de facturas con LLM mockeado — `test/invoices-ai.e2e-spec.ts` (4 casos: upload PNG→extracción,
  PNG renombrado .jpg aceptado por magic-bytes, no-imagen→400, sin archivo→400). `bootstrapApp` ganó un
  param `configure` para sustituir providers (mockear `LLMService`) antes de compilar.
- ✅ Anomalías 2σ e2e — `test/anomalies.e2e-spec.ts` (2 casos: 6 turnos → flag `diff_high` en el reciente +
  caso sin baseline → null).
- ✅ `next/image` en los thumbnails del menú — `ProductImage`/`PickerHeader` migrados (fill + sizes;
  imágenes same-origin `/api/products/images/*`, build web 6/6).
- ⏭️ Retención de `sale_status_log` — OMITIDO A PROPÓSITO. La migración `20260706140000_audit_log_retention`
  lo deja insert-only estricto deliberado (es fuente de FIFO/reportes, agrupado con `inventory_movements`).

---

## FASE 6 — Re-auditoría de viabilidad a producción ✅ (2026-07-21)

Segunda pasada, con **4 agentes paralelos** verificando contra el código real: **seguridad**, **estabilidad/SRE**,
**cobertura de tests**, **infra/suscripciones**. Objetivo: garantizar estabilidad antes de prod.

### 6.0 — Veredicto

**VIABLE para producción. CERO bloqueantes de código.** No se encontró ninguna vulnerabilidad explotable
(sin SQLi, sin IDOR abierto, sin endpoint sensible sin guard, sin secreto commiteado). Transacciones
TOCTOU-safe, integraciones externas todas con timeout (ninguna tumba el flujo), cobertura de tests
financieros por encima del promedio, CI corre todo (incluido Playwright) en cada PR. Lo que falta para
lanzar es **configuración operativa + 4 fixes chicos + crear cuentas/hardware**, no reescritura.

| Severidad | Seguridad | Estabilidad | Tests |
|---|---|---|---|
| Bloqueante | 0 | 0 | 0 |
| Alto | 1 (config) | 2 | 1 (test faltante) |
| Medio | 3 | 4 | 1 |
| Bajo | 4 | 2 | 2 |

### 6.1 — Fixes de hardening APLICADOS (commit `829d759`)

- **A1 · Graceful shutdown** (`apps/api/src/main.ts`): `app.enableShutdownHooks()`. Railway manda SIGTERM en
  cada deploy; sin hooks las requests en vuelo se cortan con 5xx y `PrismaService.onModuleDestroy`
  ($disconnect limpio) nunca corre. Ahora Nest drena el server HTTP y cierra Prisma dentro del grace period.
- **M1 · Start command versionado** (`apps/api/railway.json` + script `start:prod`): build/start command con
  `prisma migrate deploy`, `healthcheckPath:/healthz`, `numReplicas:1`, restart ON_FAILURE. La aplicación de
  migraciones deja de depender de un string escrito a mano en el dashboard de Railway (reproducible + revisable
  en PR). `deploy.md` §1.1 documenta el invariante de 1 réplica.
- **M2 · Tope diario por IP** (`WebOrderDailyLimitGuard`, 25 pedidos/día por IP en `POST /web/orders`): el
  anti-abuso por teléfono (3/día) es evadible rotando números `+57` falsos y cada pedido cuesta un WhatsApp;
  el guard acota el daño. En memoria (consistente con la invariante de instancia única).
- **Tests ALTO · Race de cierre de caja** (`test/shift-close-concurrency.e2e-spec.ts`): ejerce el invariante
  financiero declarado como cerrado en §1.C pero sin test — dispara en paralelo un cobro CASH y el cierre de la
  misma caja (`listen(0)`) y verifica que *la plata cobrada en la caja SIEMPRE entra al esperado del arqueo, o
  el cobro se rechaza y la venta queda PENDIENTE_PAGO*. Nunca plata invisible.

Verificado: typecheck 12/12, lint 0, e2e afectadas 35/35 + race 1/1.

### 6.2 — Hallazgos ALTO que quedan (config/operativo, NO código)

- **`TRUST_PROXY_HOPS` (seguridad A1):** todo el rate-limit (login 10/min, PINs 5/5min, pedidos web) es por IP,
  derivada de `X-Forwarded-For` según `trust proxy`. Con Cloudflare→Railway son **2 hops**; el default es 1.
  Valor muy bajo → todos los clientes caen en un bucket → DoS del login. Valor muy alto → el cliente spoofea
  `X-Forwarded-For` → **bypass total de fuerza bruta** sobre PINs de 6 dígitos. **Acción obligatoria del deploy:**
  verificar `req.ip` real en QA y fijar `TRUST_PROXY_HOPS=2` exacto.
- **Instancia única (estabilidad A2 + seguridad M1):** throttler, rooms WS (`/ws/pos`) y crons viven en memoria.
  Con >1 réplica: rate-limit evadible, pedido web no suena en todas las instancias, cada cron corre N veces.
  Ya mitigado por `InstanceGuardService` (alerta al dueño por WhatsApp si detecta >1 instancia) + resync REST
  12s + claim atómico del flag de notificación. **Acción:** fijar `numReplicas:1` sin autoscale (ya en
  `railway.json`; documentado en `deploy.md`).

### 6.3 — Hallazgos MEDIO (checklist go-live o mejora post-launch)

- **WhatsApp puede degradar en silencio en el go-live (estab. M3):** sin templates de Meta aprobados +
  `WHATSAPP_TEMPLATES_ENABLED=true`, las instrucciones de pago salen como texto libre fuera de la ventana de
  24h → Kapso no entrega → `failed` → el cliente nunca sabe cómo pagar. Degrada con gracia (no rompe la venta).
  **Checklist go-live:** validar templates aprobados antes de aceptar pedidos web reales (`kapso-setup.md`).
- **Full-replay FIFO O(n) sincrónico en el path frío (estab. M2):** `cogs.service.ts loadMovements({})` sin
  `take:`. Mitigado por snapshots mensuales + caché-por-promesa TTL 60s (99% de las llamadas). Residual a
  12-18 meses: un reporte histórico o un void del mes pasado puede congelar el event loop unos segundos.
  Post-launch: cap/paginación o worker separado del path transaccional.
- **Reinicio del gateway pierde eventos WS del downtime (estab. M4):** mitigado por reconnect + re-join + resync
  REST 12s (exposición máx ~12s, ningún pedido queda invisible). Informativo.
- **Reconciliación CSV a nivel servicio sin e2e (tests MEDIO):** solo `parse-csv.test.ts` (parser puro) + 1
  assertion en split. Falta e2e de flags `matched`/`unmatched_csv`/`unmatched_sale` + ventana por día calendario.

### 6.4 — Deuda BAJO diferida (post-launch, no bloquea)

- Rotación de refresh sin detección de reuso de familia de tokens (hoy solo se audita).
- 4 pollers con `setInterval` crudo que no pausan en tab oculta (`useAvailability` público, `usePendingCount`,
  `LiveDashboardSections`, `useBrollConfig`) → migrar a `usePolling`.
- Fallback cross-app de cookies en el guard cuando falta `X-Client-App` (mitigado por los role guards).
- Middleware Edge no valida `tokenVersion` (el backend sí lo valida → sin exposición de datos).
- PrismaClient sin logging estructurado (`log:['warn','error']` + Sentry en prod).
- Lecturas financieras bajo `@CashierAccess` sin scoping por cajero (aceptable para 1 local; escrituras sí
  verifican ownership).
- `PublicWebOrder` expone nombre/teléfono/dirección vía link con token HMAC 24h (por diseño; opcional enmascarar).
- e2e del borde de baseline de anomalías 2σ (`<5` turnos) y del disparo por `voidCount`/`noSaleCount`.

### 6.5 — Lo verificado y BIEN RESUELTO (los 4 agentes coinciden — no re-trabajar)

- **Seguridad:** refresh tokens opacos (48 bytes random + SHA-256 en DB) con rotación atómica race-safe,
  revocación por `tokenVersion`, cookies httpOnly+secure aisladas por app, helmet, CORS allowlist obligatoria
  en prod, HMAC del pedido web timing-safe con throw en prod, uploads con MIME por magic-bytes + SVG rechazado
  + anti-traversal, secrets con piso de entropía 32 chars + seed con guard anti-prod, DTOs públicos sin filtrar
  costos, `POST /client-logs` con `@CashierAccess` + throttle.
- **Estabilidad:** todas las transiciones de estado con claim `updateMany({where:{id,status}})`, cobro/cierre
  serializable con `pg_advisory_xact_lock` + retry único (`common/tx.ts`), 11 crons no-throwing con re-entry
  guards, integraciones externas todas con timeout (Kapso 10s, LLM 60s+fallback, R2 15s+retry, print 5s+backup
  HTML), `/healthz` devuelve 503 con DB caída, `assertRequiredEnv` mata el boot si faltan secrets, fire-and-forget
  de WhatsApp verificado (no revierte negocio).
- **Tests:** ~365 e2e + ~290 domain + frontend Vitest; motor FIFO blindado (51 tests domain + snapshot e2e),
  concurrencia de cobro con paralelismo real (`listen(0)`), double-verify digital, delivery fee, cuentas abiertas,
  nómina §7.v17, offline sync, borde de negocio 4am; higiene impecable (0 skips, 36/36 suites con `cleanDb`,
  ninguna asume seed); CI corre typecheck→lint→unit→e2e(Postgres real)→builds + Playwright en cada PR.
- **Backups:** `pg_dump -Fc` cada 6h que **verifica el dump** (`pg_restore --list`, ≥10 tablas), retención 30d,
  dead-man's-switch, abre GitHub Issue si falla.

### 6.6 — Pendientes a producción (priorizados, NO son código)

**Release:** push + merge a `main` (la rama va ~28 commits adelante sin pushear; Railway/Vercel despliegan de
rama trackeada).

**Infra/cuentas:** crear servicios Railway (Healthcheck `/healthz` — no `/health`=404; `replicas=1`;
`DATABASE_URL?connection_limit=15`) + 4 proyectos Vercel (admin **necesita** `NEXT_PUBLIC_API_WS_URL` +
`NEXT_PUBLIC_PRINT_AGENT_URL` o el socket y la impresión caen a localhost); fijar `TRUST_PROXY_HOPS=2`;
dominio + DNS Cloudflare (SSL Full strict); 5 secrets de GitHub del backup + corrida de prueba + **simulacro de
restore**; UptimeRobot sobre `/healthz`; `pg_dump` antes del 1er `migrate deploy` con datos
(`dynamic_payment_methods` reescribe tabla con lock exclusivo).

**Operativo día 1 (el seed no corre en prod):** crear usuario dueño a mano; cajeros como `ADMIN_OPERATIVO` (rol
CAJERO retirado, el Edge del admin lo bloquea fail-closed); sembrar categorías de producto; producir todas las
tandas de subproductos antes de abrir (o los preparados salen "Agotado"); validar WhatsApp Kapso (chip +57,
5 templates aprobados, `WHATSAPP_TEMPLATES_ENABLED=true`); confirmar gates de la web (`web_orders_enabled`,
horario, radio, delivery on/off).

**Hardware:** Epson TM-T20III + cajón RJ-11 + tablet/PC de caja + TV/tablet de pantalla + Raspberry Pi 4;
instalar print-agent (systemd :9120, `PRINT_AGENT_SECRET`) + túnel al backend (Cloudflare Tunnel o Tailscale).

### 6.7 — Suscripciones requeridas (con costo estimado)

| Servicio | Para qué | Plan | Costo estimado | Estado |
|---|---|---|---|---|
| Railway | Backend API + Postgres 16 | Pro recomendado | ~$10–25 USD/mes | Pendiente |
| Vercel | 4 frontends Next.js | **Pro** (Hobby prohíbe uso comercial) | $20 USD/mes | Pendiente |
| Cloudflare R2 | Fotos facturas + backups | Pago por uso (egress gratis) | ~$0–1 USD/mes | ✅ Bucket + token creados |
| Kapso (WhatsApp Cloud API) | Notificaciones + alertas | Free 2.000 msgs/mes | $0 + Meta templates ~$1–5 | Pendiente (código listo) |
| Chip prepago +57 | Número dedicado del WABA (1 vez) | Prepago mínimo | ~$5–10.000 COP una vez | Decisión del dueño |
| Anthropic API | IA facturas + resúmenes + sugerencias | Pay-as-you-go | ~$1–3 USD/mes | Pendiente (cargar saldo) |
| OpenAI API | Fallback IA (opcional) | Pay-as-you-go | ~$0–1 USD/mes | Opcional (~$5) |
| Dominio + DNS | `tercos.co` + subdominios | Cloudflare Registrar | ~$10–30 USD/año | Pendiente |
| UptimeRobot | Monitoreo externo `/healthz` | Free | $0 | Pendiente |
| GitHub Actions | Backups + CI | Incluido (repo privado) | $0 | ✅ Workflows / faltan secrets |

**Recurrente total: ~$50–75 USD/mes** (dominado por Vercel Pro + Railway; WhatsApp + IA + R2 + dominio < $10).
**Hardware one-time: ~$1.5–2.5M COP.**

---

## Qué NO tocar (verificado OK — que QA no lo re-litigue)

Cobro TOCTOU-safe (relee todo dentro de tx serializable), retry único en `common/tx.ts`, split validado
server-side por parte, void con reverso FIFO neto + devolución cross-caja, cierre con advisory lock,
`sale_payments` fuente única (arqueo/tesorería/reconciliación), tesorería sin leer `cash_movements`
(§7.v17), nómina §7.v17 (efectivo no toca el cajón), ingresos idénticos /finanzas↔P&G↔tesorería (ventana
única de mes de negocio + `NON_REVENUE_SALE_STATUSES` compartido), MONTHLY tesela el calendario exacto,
deuda de stock sin doble conteo (test "CRÍTICO" en run-ledger), snapshot mensual matemáticamente
equivalente al replay (el bug 0.1 es la CACHÉ del service, no el motor), token HMAC timing-safe con throw
en prod, CORS allowlist, cookies aisladas por app, autorización barrida en los 33 controllers sin fugas
financieras, paridad funcional POS→admin completa (SW acotado a `/caja` que nunca cachea gestión).
