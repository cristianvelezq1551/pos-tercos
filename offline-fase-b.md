# Fase B — POS online-first con respaldo offline

> **Documento canónico de la Fase B.** Define el comportamiento del POS Cajero
> cuando **pierde conexión** con el backend. Regla madre del usuario:
> **"es online-first con respaldo offline. Si pierde conexión NO me puedo quedar
> sin sistema."** Todo lo que sigue está subordinado a eso: cuando hay conexión,
> el POS funciona EXACTAMENTE como hoy; lo offline es una red de seguridad que se
> activa sola y se desactiva sola al volver la conexión.

Estado: **diseño cerrado y auditado, pendiente de implementar.** Fecha: 2026-05-24.

---

## 0. Decisiones tomadas (no re-discutir)

| # | Tema | Decisión |
|---|---|---|
| 1 | **Numeración offline** | Provisional con prefijo `OFF-N` (local). El backend asigna `receiptNumber` y `turnNumber` reales al sincronizar. |
| 2 | **Caja: abrir offline** | Se **permite abrir caja offline** (caja provisional local). Se reconcilia al volver la conexión. |
| 3 | **Alcance** | **Jornada offline extendida** — horas sin conexión. Cola robusta + numeración + reconciliación. |
| 4 | **Conflictos al sincronizar** | **Gana lo cobrado offline + marca la diferencia.** El backend registra la venta tal cual se cobró; si algo no cuadra (stock negativo, promo vencida, producto agotado), la registra igual y **marca discrepancia** para revisión. |
| 5 | **Pagos offline** | **Efectivo + digital con comprobante.** Offline no se valida contra la app; el cajero mira el comprobante en el celular del cliente → flag `offlineVerified`. |
| 6 | **Sync fallido** | **Bandeja de revisión + alerta.** Una venta que falle al sincronizar NO se descarta: queda en la bandeja con la razón, se reintenta, y el cajero/dueño la resuelve. Nada se pierde en silencio. |
| 7 | **Anulación offline** | **NO se anula offline.** *(Revisado en auditoría — ver C2.)* La venta errónea se sincroniza y se anula por el flujo normal (PIN verificado server-side) apenas vuelve la conexión. |
| 8 | **Turnero offline** | **Entrega directa.** El recibo muestra `TURNO: OFF-N`; la pantalla pública NO se alimenta offline. Al sincronizar el backend asigna el turno real (solo artefacto contable). |
| 9 | **Cierre de caja** | **NO se cierra offline.** *(Auditoría — ver C3.)* El cierre exige conexión. Se **bloquea el cierre mientras haya ventas en cola**. Si la jornada termina sin red, la caja queda abierta y se cierra al reconectar (sincroniza primero, luego cierra). |
| 10 | **Disponibilidad offline** | **Ledger local robusto.** *(Auditoría — ver I1.)* Se cachea el grafo de recetas + snapshot de stock y se descuentan insumos localmente por cada venta → un preparado se agota offline igual que online. |

---

## 1. Principios de arquitectura

1. **Online-first de verdad.** El camino feliz (con conexión) no cambia. El código
   offline es una rama que solo se activa cuando el *heartbeat* al backend falla.
   Cero regresiones — **incluida la impresión que ya funciona en Windows** (ver I2).
2. **La app tiene que ABRIR offline.** La PWA precachea su shell y la sirve
   *cache-first* cuando hay corte; el route autenticado degrada a render cliente
   con estado cacheado (NO SSR). Sin esto, "no quedarse sin sistema" no se cumple
   (ver C1). **Es el cimiento, va primero.**
3. **La impresión NO depende del backend (solo offline).** El print-agent renderiza
   el recibo desde los **datos** (`{receipt}`) además del `{escposBase64}` legacy.
   El **camino online se deja intacto** (bytes del backend); **solo offline** el POS
   arma `ReceiptData` (con config cacheada) y manda datos. `renderReceiptEscPos`
   sigue siendo única fuente de verdad (el agent la bundlea con esbuild).
4. **Idempotencia extremo a extremo.** Cada venta offline nace con un
   `Idempotency-Key` (UUID) que se reusa al sincronizar → la tabla
   `idempotency_keys` existente garantiza cero doble-cobro.
5. **Nada se pierde en silencio.** Toda venta offline vive en IndexedDB hasta que el
   backend confirma. Fallos → bandeja de revisión.
6. **El backend manda en pricing, salvo offline.** Online, `create()` recomputa
   promos y valida `soldOut`. El **sync de offline NO recomputa**: persiste los
   totales capturados offline y se salta los gates, marcando discrepancia si difiere
   (decisión #4, ver I3).
7. **Un solo terminal POS** (alcance v1). Sin numeración concurrente entre terminales.

---

## 2. Detección de conexión

`useConnectivity()` (`apps/pos/src/features/offline/`):
- `navigator.onLine` + **heartbeat** `GET /api/healthz` cada ~12 s y en eventos
  `online`/`offline`. *(El endpoint real es `/healthz`, no `/health`.)*
- Estados: `online | offline | checking`. Debounce: 2 fallos seguidos → `offline`;
  1 éxito → `online` (evita parpadeo).

**Banner global (en `PosTopbar`):**
- `offline`: ámbar — **"Sin conexión — vendiendo offline (N en cola)"**.
- `online` con cola: azul — **"Sincronizando N ventas…"** → se apaga al vaciar.
- `online` sin cola: nada.

---

## 3. Persistencia local (IndexedDB)

Wrapper sobre `idb` (~9 KB). Base `tercos-pos`, stores:

| Store | Contenido |
|---|---|
| `offlineSales` | `{ localId, provisionalNumber (OFF-N), payload (CreateSale + totales verbatim), payment {method, amountReceived, offlineVerified}, soldOfflineAt, status: queued\|syncing\|synced\|failed, failReason?, realReceiptNumber?, realTurnNumber? }` |
| `offlineShift` | Caja provisional offline: `{ openingCash, openedOfflineAt, notes?, status: provisional\|reconciled }` |
| `sessionSnapshot` | `user` + `shift` vigentes (para degradar el route autenticado sin SSR offline). Refrescado online. |
| `catalogCache` | `products` + `promotions` + `receiptConfig` (negocio) — refrescado en cada uso online. |
| `stockLedger` | Snapshot de stock por insumo/producto + **grafo de recetas** (`loadFullGraph`) + descuentos locales acumulados → disponibilidad offline (ver §6). |
| `meta` | Contador `OFF` de la jornada, `lastSyncAt`, fecha de jornada. |

Todo se **refresca en cada arranque/uso online**.

---

## 4. App-shell offline (C1 — cimiento)

- **Service worker**: precache de la shell del POS; cuando el heartbeat/red falla,
  sirve la shell **cache-first** (hoy es online-first → mostraría `offline.html`, que
  es el bug a corregir). No cachea `/api/*` (sigue igual).
- **Route autenticado**: el layout deja de depender del fetch SSR de `user`/`shift`
  cuando está offline → toma `sessionSnapshot` de IndexedDB y renderiza cliente-side.
- **Middleware/JWT**: cuando el SW sirve la shell cacheada, el middleware Edge no
  intercepta; la sesión se reconstruye del snapshot. Online, todo igual que hoy.

> Verificación dura de esta fase: **cortar red + recargar la pestaña → el POS abre**
> (no `offline.html`).

---

## 5. Venta offline (COUNTER)

Con `connectivity === 'offline'` y **Cobrar**:
1. `provisionalNumber = OFF-${meta.offCounter++}` (reinicia por jornada).
2. Totales/promos: se calculan en cliente (`@pos-tercos/domain applyPromotion`,
   idéntico a online) y se **guardan verbatim** (no se recomputan al sync).
3. Pago: CASH (con cambio) o digital con checkbox **"Verifiqué el comprobante en el
   celular del cliente"** → `offlineVerified: true`.
4. **Descontar insumos en el `stockLedger` local** (ver §6) → disponibilidad se
   actualiza para las próximas ventas offline.
5. Encolar en `offlineSales` (status `queued`) con su `Idempotency-Key`.
6. Imprimir: el POS arma `ReceiptData` (config cacheada), marca `TURNO: OFF-N` +
   banda **"PENDIENTE DE SINCRONIZAR"**, lo manda al agent (`POST /print {receipt}`).
   Abre cajón si CASH.
7. Limpia carrito + `LastSaleBanner` con `OFF-N`.

Solo COUNTER offline; WEB_PICKUP es del backend.

---

## 6. Disponibilidad offline — ledger local (I1)

`expandRecipe` es **puro** (`@pos-tercos/domain`), así que se puede correr en el
cliente:
- Online se cachea: snapshot de stock (insumos + productos direct-resale) + el
  **grafo completo de recetas** (`RecipesService.loadFullGraph`).
- Cada venta offline corre `expandRecipe` sobre el grafo y **descuenta el `stockLedger`
  local**. Un preparado se marca **agotado offline** cuando algún insumo llega a 0
  (misma regla que online: directo en reventa directa; preparados por insumos; combos
  por componentes).
- Al sincronizar, el backend descuenta el stock real; el ledger local se descarta y se
  recachea el snapshot fresco. Discrepancias (vendí algo que el server tenía en 0) →
  marca de diferencia (decisión #4).

---

## 7. Motor de sincronización

Controlador (`features/offline/sync-engine.ts`) que corre con la app abierta. Al pasar
a `online` con cola pendiente:
1. **Caja primero.** Si hay `offlineShift` provisional y el backend no tiene caja
   abierta → `POST /shifts/sync-offline` (apertura backdateada). Si el backend ya tiene
   una abierta → adopta esa (single-caja) y marca la provisional `reconciled` (si el
   efectivo de apertura difiere, marca discrepancia — N5). Si la caja-sync falla, **se
   detiene** el sync de ventas y se avisa.
2. **Ventas FIFO.** Por cada `queued`/`failed`/`syncing`-colgada:
   - `POST /sales/sync-offline` (`CashierAccess`) con `Idempotency-Key = localId`.
     Body: items, **totales verbatim**, pago, `soldOfflineAt`, `offlineVerified`,
     `provisionalNumber`.
   - Backend en una sola tx: crea + confirma + asigna `receiptNumber`/`turnNumber`
     reales + descuenta stock + asocia caja+cajero + `paidAt = soldOfflineAt`. **No
     recomputa precios ni valida soldOut** (#4/I3). El `receiptNumber` se asigna en el
     **último paso** de la tx para no quemar la secuencia si algo falla (N3).
   - **Conflicto recuperable** (stock negativo, etc.): registra igual + audit
     `OFFLINE_SYNC_DISCREPANCY`.
   - Éxito → `synced` + guarda `realReceiptNumber/realTurnNumber`; purgable tras X h.
   - **Fallo no recuperable** → `failed` + `failReason` → **bandeja de revisión** + alerta.
3. Banner refleja el progreso.

> `syncing` colgado (app cerrada a mitad de sync) → se trata como `queued` y se
> reintenta; la idempotencia lo hace seguro (N4).

---

## 8. Cierre de caja con cola (C3)

- El **cierre exige conexión** (necesita backend para Z-report + `expectedCash`).
- **Se bloquea el cierre mientras `offlineSales` tenga pendientes** → primero
  sincroniza, después cierra (así las ventas en efectivo offline entran al
  `expectedCash` y no hay descuadre falso).
- Si la jornada termina sin red: la caja queda **abierta**; al reconectar se sincroniza
  y se cierra. El cajero cuenta el efectivo en ese momento.

---

## 9. Cambios en el backend (sin migración de schema obligatoria; trazabilidad por audit)

- **`POST /sales/sync-offline`** (`CashierAccess`): crea + confirma + numera +
  descuenta + asocia caja, `paidAt = soldOfflineAt`, **persistiendo totales verbatim** y
  saltándose recompute de promos / gate de soldOut. Idempotente. Maneja conflicto (#4).
- **`POST /shifts/sync-offline`** (`CashierAccess`): registra caja abierta offline o
  adopta la vigente (single-caja).
- **`GET /pos/receipt-config`** *(o reusar existente)*: nombre/dirección/NIT/footer del
  negocio para armar el recibo offline.
- **`GET /products/offline-snapshot`** (`CashierAccess`): **grafo de recetas
  (`loadFullGraph`) + niveles de stock crudos + productos**, para el ledger local (I1).
  `GET /products/availability` no alcanza (devuelve el booleano ya calculado, no permite
  recalcular tras cada venta offline). `loadFullGraph` hoy es interno → hay que exponerlo.
- **Bloqueo de cierre con cola**: el POS no llama `POST /shifts/:id/close` hasta vaciar
  la cola (gate cliente-side; el backend ya valida lo suyo).
- Audit nuevos: `SALE_SYNCED_OFFLINE`, `OFFLINE_SYNC_DISCREPANCY`, `SHIFT_SYNCED_OFFLINE`.
- Print-agent: `/print` acepta `{receipt: ReceiptData}` (renderiza con
  `renderReceiptEscPos`) además del `{escposBase64}` legacy. **El online sigue usando
  bytes del backend; solo offline manda `{receipt}`** (I2).

> Se pierde el audit server-side de "recibo impreso" solo cuando el POS imprime offline
> (online no cambia). Mitigación: `POST /sales/:id/printed` best-effort. Deuda menor.

---

## 10. Sub-fases verificables

| Fase | Entrega | Cómo se verifica |
|---|---|---|
| **B.0a** ✅ | **Cimientos aditivos**: `useConnectivity` (heartbeat `/api/healthz` + `navigator.onLine` + debounce) + `OfflineProvider`/`OfflineStatusBar` (banda offline) + IndexedDB (`idb`, stores `kv` + `offlineSales`) + `storage.persist()` + cache warmer (sesión + catálogo/promos/disponibilidad cuando hay red). **No toca el camino online.** typecheck/lint/build ✓. | Cortar red (estando la app cargada) → banda "Sin conexión"; IndexedDB con sesión + catálogo cacheados. |
| **B.0b** | **App-shell offline** (parte pesada): SW cache-first para la shell (arregla el bug del `.svg`) + route autenticado con render cliente desde `sessionSnapshot` (sin SSR) + grafo de recetas/snapshot de stock cacheados. | Cortar red **y recargar la pestaña** → el POS abre (no `offline.html`). |
| **B.1** ✅ | **Impresión offline**: agent renderiza `{receipt}` (rellena `business` desde su `.env`); el POS arma `ReceiptData` y `printReceipt` cae a `{receipt}` si el backend está inalcanzable. **Online intacto** (sigue mandando `{escposBase64}`). | Smoke verificado: `{receipt}` rinde el ESC/POS completo (turno/recibo/ítems/promo/totales/cajón); `{escposBase64}` legacy intacto; body vacío → 400. `.exe` regenerado. |
| **B.2** | **Venta offline + ledger de disponibilidad**: `OFF-N`, encolado, descuento de insumos local, recibo con `OFF-N` + "pendiente". | Offline: cobrar → queda en cola, sale el papel; un preparado se agota tras N ventas offline. |
| **B.3** | **Motor de sync + endpoint**: vacía la cola → `POST /sales/sync-offline`, mapea `OFF-N → #real`, totales verbatim, manejo de conflicto, banner "sincronizando N". | Vender offline, reconectar → la venta aparece en backend con número real, `paidAt` correcto y stock descontado. |
| **B.4** | **Caja offline + reconciliación + bloqueo de cierre**: abrir caja offline, asociar ventas, reconciliar al sync (single-caja), bloquear cierre con cola. | Abrir caja offline, vender, reconectar → caja registrada, ventas asociadas; intentar cerrar con cola → bloqueado. |
| **B.5** | **Bandeja de revisión + conflictos**: tray de fallos + marca de discrepancia. | Forzar un fallo de sync → aparece en la bandeja con su razón; una sobreventa queda marcada como discrepancia. |

> **Anulación offline: eliminada** (C2 — offline no se anula; se corrige tras sincronizar).

---

## 11. Hallazgos de auditoría (2026-05-24) — resueltos

| Sev | Hallazgo | Resolución |
|---|---|---|
| 🔴 C1 | El SW actual es online-first → recargar offline muestra `offline.html`, no el POS. El route autenticado depende de SSR (user+shift) y el middleware del Edge. | B.0: app-shell cache-first + `sessionSnapshot` + degradación cliente-side. **Va primero.** |
| 🔴 C2 | El PIN de anulación es de admin/dueño (no del cajero); offline no se pueden barrer hashes del server. | **Offline no se anula** (decisión #7 revisada). |
| 🔴 C3 | Cerrar caja con ventas offline sin sincronizar → descuadre falso. Cierre offline no estaba definido. | **No se cierra offline**; bloquear cierre con cola (decisión #9). |
| 🟠 I1 | Disponibilidad congelada offline contradice la feature de stock por insumo. | **Ledger local** con `expandRecipe` (decisión #10). |
| 🟠 I2 | "Mandar siempre `{receipt}`" cambiaría el camino de impresión online ya validado. | Online intacto; **solo offline** renderiza cliente-side. |
| 🟠 I3 | `create()` recomputa promos/soldOut → violaría "gana lo cobrado offline". | `sync-offline` persiste **totales verbatim** y salta gates. |
| 🟡 N1 | `receiptNumber` real no queda cronológico (se asigna en orden de sync). | Aceptable; `paidAt` backdateado mantiene los reportes correctos. |
| 🟡 N2 | El recibo offline lleva `OFF-N`, no el número real. | Mapeo `OFF-N→#real` en audit `SALE_SYNCED_OFFLINE`. Deuda menor (sin UI de búsqueda). |
| 🟡 N3 | Sync fallido puede quemar `nextval` → gap. | Asignar `receiptNumber` en el último paso de la tx. |
| 🟡 N4 | `syncing` colgado si la app cierra a mitad. | Re-tratar como `queued` + reintento idempotente. |
| 🟡 N5 | Conflicto de efectivo de apertura (offline vs online). | Adoptar caja del backend + marcar diferencia. |

---

## 13. Segunda auditoría (2026-05-24) — verificada contra el código

Pase profundo leyendo el código real (SW, layout autenticado, middleware, health,
recetas, disponibilidad). Hallazgos nuevos:

| Sev | Hallazgo (verificado) | Acción |
|---|---|---|
| 🐛 | **El SW nunca se instala**: `sw.js` cachea `/icon-192.svg` y `/icon-512.svg` en `install`, pero en `public/` solo hay `.png` → `cache.addAll` rechaza → install falla. **Hoy NO hay offline funcionando.** | B.0 reescribe el SW; arregla el bug de paso. |
| 🔴 | **C1 es más profundo**: la home es Server Component (`getCurrentShiftStatusServer` + `getActiveProductsServer` + `redirect`) y el layout hace 4 fetch SSR. Offline no hay server. | B.0 debe dar un **camino de render cliente** que lea de IndexedDB. **Es refactor del arranque, no un parche.** |
| 🟠 | **Health real es `/healthz`** (no `/health`). | Heartbeat a `/api/healthz`. |
| 🟠 | **`loadFullGraph` no está expuesto** (interno en `recipes.service`). El ledger I1 necesita grafo + stock crudo. | Endpoint nuevo `GET /products/offline-snapshot` (B.2). |
| 🟠 | **Evicción de IndexedDB** puede borrar ventas encoladas (= plata). | Pedir `navigator.storage.persist()` en B.0 + avisar si se deniega. |
| 🟡 | **Precondición: el offline solo opera con sesión ya iniciada** (el login necesita backend). PC reiniciada offline sin sesión = cajero bloqueado. | Cachear `sessionSnapshot`; documentar la limitación. |
| 🟡 | **Chunks de Next content-hashed**: el SW (SWR) solo los cachea tras visitarlos online. Primer arranque offline exige haber entrado online ese día. | Aceptable para kiosko; precachear lo crítico en B.0. |
| 🟡 | **Multi-pestaña**: dos pestañas = dos motores de sync. | Web Locks / BroadcastChannel; idempotencia ya protege el doble-commit. |
| 🟡 | **Clock skew**: `soldOfflineAt` usa el reloj de la PC; si está mal, el `paidAt` backdateado queda mal. | Documentar; NTP en la PC del mostrador. |

**Veredicto de regresión (honesto):** B.1–B.5 son aditivas (offline-only) → la lógica
de venta/cobro/impresión **online no cambia**. **B.0 SÍ toca el arranque/auth/SW que hoy
funciona** (aunque el offline en sí hoy está roto por el bug del SW) → es la pieza de
mayor riesgo y hay que construirla con cuidado (idealmente detrás de un flag y probada en
build de producción, porque el SW no corre en dev).

---

## 12. Riesgos residuales (consecuencia de operar sin backend)

1. **Pago digital offline:** sin doble-check de app, sube el riesgo de comprobante
   falso. Mitigado por `offlineVerified` + revisión post-sync.
2. **Stock offline:** el ledger local reduce el riesgo, pero ante varios dispositivos o
   ajustes manuales del admin durante el corte puede haber desfase → marca de
   discrepancia al sync.
3. **Audit de impresión offline:** best-effort (deuda menor; online no cambia).

Ninguno bloquea la regla madre ("no quedarme sin sistema").
