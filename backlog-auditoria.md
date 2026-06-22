# Backlog de auditoría — POS Tercos

> Consolidado de la **auditoría de seguridad** + la **auditoría funcional de las 4 apps**
> (cajero, web cliente, admin/dueño, turnero), 2026-06-22.
> Documento de seguimiento: marcá `[x]` a medida que se cierra cada ítem.
> Severidad: 🔴 crítica · 🟠 alta · 🟡 media · ⚪ baja.

---

## P0 — Seguridad: antes de exponer la web a internet

- [x] 🟠 **Inundación + throttle tras proxy (CERRADO parcial 2026-06-22).** `app.set('trust proxy', 1)` agregado → el rate-limit cuenta por IP real. **Falta** el cron que cancele `WEB_PICKUP PENDIENTE_PAGO` viejos + cap de pedidos por teléfono (queda como ítem abierto abajo).
- [ ] 🟠 **Sweep + cap de pedidos web abandonados.** Cron que cancele `WEB_PICKUP PENDIENTE_PAGO` >2-3h + cap de pedidos abiertos por teléfono (anti-flood del drawer del POS). Hoy solo se barren los COUNTER.
- [x] 🟠 **Fuga de inventario por endpoint público (CERRADO 2026-06-22).** `GET /products/availability` (`@Public`) devuelve `stock`/`reason` en null; el real va a `GET /products/availability/internal` (`@CashierAccess`, lo usa el POS).
- [x] 🟠 **Backend sin helmet / CORS inseguro (CERRADO 2026-06-22).** `helmet()` + CORS exige `CORS_ORIGINS` en prod.
- [ ] 🟡 **Apps Next sin security headers** (CSP/HSTS/X-Frame-Options) → POS clickjackeable. **Fix:** `headers()` en cada `next.config.ts`. *(movido desde P1, completa el frente de headers)*

---

## 🟣 WhatsApp — entrega segura (PRIORIDAD APARTE, decisión de negocio)

> El mecanismo actual (OpenWA / `whatsapp-web.js` self-hosted) **puede generar
> baneo** de tu número. Es un cliente NO oficial que automatiza una cuenta de
> WhatsApp normal — viola los ToS de Meta. El patrón que más banea es
> justamente el que tenemos: enviar a números que no te guardaron / nunca te
> escribieron primero (y peor, el vector de spam deja que un atacante dispare
> mensajes a números arbitrarios desde tu número).

### La forma segura: WhatsApp Business Platform (Cloud API oficial)
- API sancionada por Meta → no te banean por usarla como corresponde (sí puede
  bajar tu "quality rating" si los destinatarios bloquean/reportan).
- **Requisitos:** cuenta Meta Business + verificación de negocio (tarda días);
  un **número dedicado** para la API (NO puede ser el mismo que usás en la app
  de WhatsApp); **templates** pre-aprobados para los 3 mensajes (instrucciones
  de pago, pago recibido, listo para retirar) — todos categoría **Utility**.
- **Dos caminos:** (a) **Cloud API directo de Meta** (hosting gratis, solo pagás
  por mensaje; más setup: portal de devs, webhooks, templates); (b) vía **BSP**
  (Twilio, 360dialog, Gupshup, Wati): onboarding más fácil, dashboards, pero
  agregan markup por mensaje o fee mensual.

### Costo (Colombia, 2026 — pricing por mensaje desde jul-2025)
- **Utility** (lo que enviás): ~**US$0.001/mensaje**. **Authentication** ~$0.0008.
  **Marketing** ~$0.014. **Service** (respuestas dentro de la ventana de 24h): **gratis**.
- Desde abr-2026 Colombia se factura en **COP**.
- **Para este negocio:** 3 notificaciones/pedido web. 1.000 pedidos/mes × 3 =
  3.000 mensajes × $0.001 ≈ **US$3/mes** (despreciable). Con BSP, sumar su fee.
- **Recomendación:** Cloud API directo (más barato a este volumen). El código ya
  abstrae el envío detrás de `WhatsAppProvider` → agregar `CloudApiWhatsAppAdapter`
  junto a `OpenWaWhatsAppAdapter`. Bajo impacto de código.

### Anti-spam (vale para CUALQUIER mecanismo — el actual crítico)
- [ ] 🔴 **No mensajear a números no verificados desde el endpoint público.**
  `POST /web/orders` dispara WhatsApp al `customerPhone` del atacante
  (`web-orders.service.ts:58`). **Fix:** diferir las instrucciones a cuando el
  cajero **acepta** el pedido en el POS (gate humano) **o** rate-limit por
  número/día + opt-in. Incluso con la API oficial, mensajear a números que te
  reportan baja tu quality rating.

## P1 — Permisos, auth y hardening

- [x] 🟠 **Gap de permisos del admin — reportes financieros (CERRADO 2026-06-22).** Los 11 endpoints de `reports.controller.ts` (`dashboard`, `daily-ai-summary`, `sales-summary`, `top-products`, `inventory-usage`, `hour-heatmap`, `whatsapp-metrics`, `suggestions-metrics`, `payment-reconciliation/import`+`/history`+`/:id`) pasaron de `@AdminAccess` a `@OnlyDueno`, y las 6 páginas de reportes ahora hacen `requireRole(['DUENO'])` (defensa en profundidad). Un ADMIN_OPERATIVO ya no ve ingresos/márgenes/reconciliación.
- [x] 🟡 **`GET /audit` dueño-only (CERRADO 2026-06-22).** Decisión del dueño: el operativo NO ve la bitácora → `@OnlyDueno`.
- [x] 🟠 **Token de 24h sin revocación (CERRADO 2026-06-22).** `users.token_version` + `tv` en el JWT; el guard compara con cache de 60s (`TokenVersionService`). Se incrementa al desactivar/cambiar rol/reset password → corte inmediato. NO se tocó el TTL (no reintroduce la carrera de refresh). e2e `auth-revocation.e2e-spec.ts` (4 casos). *Pendiente menor: el handshake WS aún no chequea tv.*
- [x] 🟠 **PIN de aprobación fuerza-bruteable (CERRADO 2026-06-22).** `@Throttle` 5/5min en void + cajón-sin-venta → 1M combos infactible.
- [x] 🟡 **CORS inseguro (CERRADO).** Exige `CORS_ORIGINS` en prod.
- [x] 🟡 **Lectura cruzada de cajas (CERRADO).** Ownership: el cajero solo ve sus cajas.
- [x] 🟡 **Apps Next sin security headers (CERRADO).** X-Frame-Options DENY + nosniff + Referrer + HSTS en las 4 apps. *(CSP estricta pendiente — tuning por app.)*
- [x] 🟡 **idempotency-key UUID + login throttle (CERRADO).**
- [x] 🟡 **Costos visibles a cualquier rol (CERRADO 2026-06-22).** inventory/suppliers/recipes → `@AdminAccess` a nivel de clase; `/products` strippea `lastUnitCost` para no-admin (el POS no lo usa).
- [x] 🟡 **`photoStorageKey` validado (CERRADO).** Regex `invoices/{uuid}.{ext}` en CreateFromPhoto/DiscardPhoto.
- [x] 🟡 **SSE del turnero con `@Throttle` (CERRADO).** state 60/min, stream 30/min. *(Cap de conexiones CONCURRENTES queda como follow-up menor si hace falta.)*
- [ ] 🟡 **`multer@1.4.5`** con advisories de DoS. **Fix:** subir a `multer@^2` — ⚠ tiene cambios de API, hay que **probar los uploads** (facturas, comprobantes, imágenes) tras migrar. No se hizo por no poder testear uploads en este entorno.
- [ ] ⚪ Fallback `WEB_ORDER_TOKEN_SECRET`→`JWT_ACCESS_SECRET` si `NODE_ENV` mal seteado; `algorithms` no fijado en verify; PII en logs de WhatsApp.

## P2 — Bugs funcionales y robustez

- [x] 🟠 **Comanda → ticket de ANULACIÓN al abandonar el cobro (CERRADO 2026-06-22).** Si se cierra sin pagar y la comanda ya salió, se imprime "*** ANULAR *** DESCARTAR ESTE PEDIDO" a cocina (`?cancel=true` + audit COMANDA_CANCELLED). Respeta el arranque temprano.
- [x] 🟠 **Texto de pago genérico (CERRADO).** Sin `PAYMENT_INSTRUCTIONS_*` el cliente ve "Te enviaremos los datos por WhatsApp", no el texto de debug.
- [x] 🟠 **Turnero — SSE zombie (CERRADO).** Listener del `ping` + watchdog que reconecta si pasan >45s sin nada con la conexión "viva".
- [x] 🟠 **Turnero — reset diario (CERRADO).** `getState()` limpia el turno de un día anterior (clearIfStaleDay). Requiere `TZ=America/Bogota` en prod.
- [x] 🟡 **Carrera de doble-cobro en POS (CERRADO 2026-06-22).** `submittingRef` (ref síncrona) reemplaza el check de `pending` en handleConfirm.
- [x] 🟡 **Web — revalida carrito vs menú al checkout (CERRADO).** `reconcileCart` + `CartChangesBanner`: avisa precio viejo / producto desactivado y obliga a actualizar antes de pagar.
- [x] 🟡 **POS — número OFF-N monotónico (CERRADO).** Solo resetea cuando la jornada avanza, nunca hacia atrás.
- [x] 🟡 **`expectedCash` autoritativo del server (CERRADO).** `GET /shifts/:id/expected-cash`; el modal de cierre usa el número del server (cae al cliente solo si la red falla).
- [x] 🟡 **Turnero — B-roll rediseñado con estética TERCOS-WEB (CERRADO 2026-06-22).** Reemplazados los 3 slides con productos/precios inventados por el B-roll real de marca (`BrollStage` + `broll-menu.ts`): marca + producto rotando sobre negro + foto del plato con Ken Burns, alimentado por el **menú curado real** del dueño (un solo lugar para editar precios — ya no hay precios sueltos por componente). Turno + flash + campana se superponen igual. Borrados Carousel/Brand/Clock/slides viejos. Build OK. *Follow-up opcional: si el dueño quiere precios en vivo desde `/web/menu`; hoy se editan en `broll-menu.ts`.*
- [ ] 🟡 **Web — sin sweep de pedidos WEB abandonados** (quedan colgados en el drawer). Atado a WhatsApp (el cancel dispara `notify('canceled')`); va con el bloque de WhatsApp.

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
