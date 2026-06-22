# Backlog de auditoría — POS Tercos

> Consolidado de la **auditoría de seguridad** + la **auditoría funcional de las 4 apps**
> (cajero, web cliente, admin/dueño, turnero), 2026-06-22.
> Documento de seguimiento: marcá `[x]` a medida que se cierra cada ítem.
> Severidad: 🔴 crítica · 🟠 alta · 🟡 media · ⚪ baja.

---

## P0 — Seguridad: antes de exponer la web a internet

- [ ] 🔴 **Spam/ban de WhatsApp con teléfono ajeno.** `POST /web/orders` (público) dispara `notify('payment_instructions')` al `customerPhone` que controla el atacante (`web-orders.service.ts:58` → `notification.service.ts:61`). Riesgo de spam a costa del negocio + ban de la sesión OpenWA de producción. **Fix:** no enviar instrucciones al crear el pedido; diferirlas a cuando el cajero acepta/verifica en el POS (gate humano). + rate-limit por número/día.
- [ ] 🟠 **Inundación de pedidos `PENDIENTE_PAGO` + throttle no fiable tras proxy.** No hay `trust proxy` en `main.ts` → el rate-limit ve la IP del proxy. No hay sweep de pedidos WEB viejos. **Fix:** `app.set('trust proxy', 1)` + cron que cancele `WEB_PICKUP PENDIENTE_PAGO` viejos + cap de pedidos abiertos por teléfono.
- [ ] 🟠 **Fuga de inventario por endpoint público.** `GET /products/availability` (`@Public`) devuelve `stock` exacto y `reason` ("Sin Pan…") (`products.controller.ts:58`, `catalog.ts:332`). **Fix:** respuesta pública solo `{productId, available}`; `stock`/`reason` a variante `CashierAccess`.
- [ ] 🟠 **Backend sin helmet / `nosniff`.** `helmet` ausente del `package.json` del api. Endpoints que sirven binarios subidos quedan expuestos a MIME-sniffing. **Fix:** `app.use(helmet())` + `X-Content-Type-Options: nosniff` en respuestas binarias.

## P1 — Permisos, auth y hardening

- [x] 🟠 **Gap de permisos del admin — reportes financieros (CERRADO 2026-06-22).** Los 11 endpoints de `reports.controller.ts` (`dashboard`, `daily-ai-summary`, `sales-summary`, `top-products`, `inventory-usage`, `hour-heatmap`, `whatsapp-metrics`, `suggestions-metrics`, `payment-reconciliation/import`+`/history`+`/:id`) pasaron de `@AdminAccess` a `@OnlyDueno`, y las 6 páginas de reportes ahora hacen `requireRole(['DUENO'])` (defensa en profundidad). Un ADMIN_OPERATIVO ya no ve ingresos/márgenes/reconciliación.
- [ ] 🟡 **`GET /audit` — decisión pendiente del dueño.** Es `@AdminAccess` **a propósito** (comentario en `audit.controller.ts:7` + memoria de roles: el operativo usa la *bitácora filtrada*). El hueco: un operativo puede pedir el log crudo sin filtro vía API y leer la "Auditoría completa" dueño-only. **Fix sugerido (no blanket OnlyDueno):** exigir `action` filter para no-DUENO (la bitácora siempre lo manda; el raw lo usa solo el dueño). **Requiere tu confirmación de la intención.**
- [ ] 🟡 **Lectura cruzada de cajas (movido a su propio ítem abajo).** `GET /shifts`/`:id`/`close-analysis` los necesita el POS → no se puede `@OnlyDueno`; requiere filtro por ownership.
- [ ] 🟠 **Token de 24h sin revocación.** Empleado dado de baja / rol degradado conserva acceso hasta 24h (el guard no consulta DB). **Fix:** TTL corto (15 min) o `tokenVersion` en el user que invalide tokens previos al cambiar rol/estado/password.
- [ ] 🟠 **PIN de aprobación fuerza-bruteable.** Sin lockout ni throttle dedicado en void/cajón/salarios; `verify()` acepta el PIN de cualquier admin (`approvals.service.ts:97`). **Fix:** lockout por N fallos (usar audit `APPROVAL_DENIED`) + `@Throttle` agresivo.
- [ ] 🟡 **CORS refleja cualquier origen con credenciales.** `main.ts:14` cae a `origin: true` si falta `CORS_ORIGINS`. **Fix:** fallar el arranque en prod sin allowlist (también en gateways WS).
- [ ] 🟡 **Costos/recetas/proveedores visibles a cualquier rol.** `GET /inventory/stock`, `/products`, `/recipes/*expanded-cost`, `/suppliers` sin gate → COCINERO/TRABAJADOR ven `lastUnitCost`. **Fix:** `@AdminAccess` en lecturas con costo.
- [ ] 🟡 **Lectura cruzada de cajas.** `GET /shifts`, `/shifts/:id`, `close-analysis` sin ownership → un cajero ve Z-reports de otros (`shifts.controller.ts`). **Fix:** filtrar por cajero o endpoint admin separado (cuidar que el POS sigue necesitando los suyos).
- [ ] 🟡 **Apps Next sin security headers** (CSP/HSTS/X-Frame-Options) → POS clickjackeable. **Fix:** `headers()` en cada `next.config.ts`.
- [ ] 🟡 **`multer@1.4.5`** con advisories de DoS. **Fix:** subir a `multer@^2`.
- [ ] 🟡 **`photoStorageKey` sin validar** → admin puede borrar/leer binarios ajenos (`types/invoices.ts:158`). **Fix:** regex de key o verificar contra DB.
- [ ] 🟡 **SSE del turnero sin límite de conexiones** + **login sin throttle de brute-force dedicado** + **idempotency-key no exige UUID**.
- [ ] ⚪ Fallback `WEB_ORDER_TOKEN_SECRET`→`JWT_ACCESS_SECRET` si `NODE_ENV` mal seteado; `algorithms` no fijado en verify; PII en logs de WhatsApp.

## P2 — Bugs funcionales y robustez

- [ ] 🟠 **Comanda impresa antes de confirmar pago** sin avisar al KDS si se cancela (`useCheckoutSale.ts:52`) → cocina prepara venta muerta. **Fix:** no imprimir hasta confirmar, o emitir cancelación al KDS.
- [ ] 🟠 **`buildPaymentInstructions` filtra texto de debug al cliente** si faltan env `PAYMENT_INSTRUCTIONS_*` (`web-orders.controller.ts:91`). **Fix:** mensaje genérico de fallback.
- [ ] 🟠 **Turnero — SSE zombie sin recovery.** Si el backend se cuelga sin cerrar el socket, el watchdog nunca recarga. **Fix:** escuchar el evento `ping` (keepalive 20s ya existe) y forzar reload si no llega en >45s.
- [ ] 🟠 **Turnero — reset diario manual.** El `currentTurn` in-memory no se limpia a medianoche → muestra el turno del día anterior. **Fix:** reset automático por día/caja + verificar `TZ=America/Bogota`.
- [ ] 🟡 **Carrera de doble-cobro en POS** (`useCheckoutFlow.ts:120` lee `pending` antes de setearlo). Mitigada por idempotencia server. **Fix:** ref/functional update antes de validar.
- [ ] 🟡 **Web — no revalida carrito vs menú al checkout** (precio viejo / producto desactivado / agotado falla opaco). **Fix:** reconciliar carrito↔menú antes de cobrar.
- [ ] 🟡 **POS — número provisional OFF-N** colisiona si el reloj de la tablet retrocede. **Fix:** timestamp monotónico.
- [ ] 🟡 **`expectedCash` calculado en 3 lugares del cliente** (POS) puede divergir del server. **Fix:** que el server lo devuelva precalculado.
- [ ] 🟡 **Turnero — B-roll con precios hardcodeados** ($32.900…) → muestra precios falsos sin redeploy. **Fix:** alimentar de `/web/menu` o config editable.
- [ ] 🟡 **Web — sin sweep de pedidos WEB abandonados** (quedan colgados en el drawer). Cubierto por P0 (cron) en parte.

## P3 — Calidad: tests, observabilidad, deuda

- [ ] 🟠 **Cero tests en web, admin y turnero.** El POS tiene 26 Vitest; las otras 3 apps no tienen ninguno. **Fix:** Vitest de lógica pura (cart, reconciliation, bitacora/events, dedupe callSeq) + 1 Playwright smoke por app.
- [ ] 🟡 **Tests del motor offline y `checkout-confirm` del POS** (lo más crítico sin red). **Fix:** Vitest de sync-engine (backoff, Web Locks, exhausción) + checkout-confirm.
- [ ] 🟡 **Sin observabilidad en web/admin/turnero** (catches mudos). **Fix:** portar `logError`/`/client-logs` del POS.
- [ ] 🟡 **23 archivos >200 líneas en admin** (peores: `invoices/[id]/page.tsx` 371, `EmployeePanel` 325, `InvoiceUploader` 308) + `ProductPickerModal` 324 en web. **Fix:** partir.
- [ ] 🟡 **Admin — inconsistencia Zod** (páginas SSR de reportes castean crudo; el resto parsea) + 12 copias del wrapper `request<T>`. **Fix:** unificar fetch + Zod en reportes.
- [ ] 🟡 **Admin — FIFO `runLedger` sin caché** (reconstruye todo el ledger por request). **Fix:** caché TTL + invalidación en writes.
- [ ] ⚪ **Web — SEO** (sin sitemap/robots/OG/metadataBase → link en WhatsApp sin preview) + `hero.gif` 7.5 MB sin optimizar + `next/image`.
- [ ] ⚪ Catches silenciosos sin log en POS (`cancelSale`, `ShiftCashBadge`); `method as never` en `CloseShiftModal:100`; reexportar `caja-events` por el barrel.

## P4 — Features de valor (post-hardening)

- [ ] **Pasarela de pago online real** (Wompi/Mercado Pago/Bold) — elimina el pago manual, la fricción y los pedidos colgados. Mayor ROI de la web.
- [ ] **Pronóstico de producción** (heatmap + recetas + stock de subproductos → "producí N tandas hoy"). Ataca merma y ventas perdidas por "Agotado".
- [ ] **Auto-86 predictivo en el POS** ("al ritmo actual el pan se acaba en ~45 min").
- [ ] **Dueño conversacional por WhatsApp** (responder "¿cuánto va hoy?" con el LLM + endpoints de reportes).
- [ ] **Anti-fraude en vivo** (correlacionar ediciones de pago + anulaciones + cajón sin venta en la misma hora).
- [ ] **KDS Flutter — pantalla de producción** (el cocinero registra tandas desde la tablet; hoy solo desde admin).

---

### Veredictos de las auditorías (línea base)

| Frente | Nota |
|---|---|
| Cajero (apps/pos) | 8/10 |
| Web cliente (apps/web) | 8/10 |
| Admin/Dueño (apps/admin) | 7.5/10 |
| Turnero (apps/public-display) | 7.5/10 |
| Seguridad pública (anónimo) | 6/10 |
| Auth / autorización (insider) | 5/10 |
| Uploads / LLM / secretos / infra | 7/10 |
