# Plan de Implementación Técnica — Local-First con Claude

> Plan modular para construir v1 trabajando 100% en local con Claude, sin bloquearse por Meta WABA, hardware o trámites externos. Cada módulo se construye, prueba y firma como "hecho" antes de pasar al siguiente.

---

## 0. Filosofía local-first

**Regla central:** ningún módulo depende de servicios externos no listos. Todo lo que requiere terceros se implementa contra una **interfaz mockeada** desde día 1. Cuando el servicio real esté disponible, se cambia la implementación detrás de la interfaz sin tocar el dominio.

**Servicios mockeables en dev local:**

| Real | Mock dev | Cómo |
|---|---|---|
| Impresora térmica ESC/POS | `MockPrinterAdapter` | Renderiza el recibo como HTML en una nueva pestaña + lo guarda como PDF en `./tmp/receipts/` |
| Cajón monedero | `MockCashDrawerAdapter` | Loggea `[CAJON ABIERTO @ timestamp]` en consola del Print Agent |
| WhatsApp Cloud API | `MockWhatsAppAdapter` | Guarda los mensajes en una tabla `dev_inbox` + pantalla `/admin/dev/whatsapp-inbox` los muestra como WhatsApp Web fake |
| Pago Nequi/Bancolombia | `MockPaymentValidator` | Confirmación 100% manual del cajero (igual que en prod v1) |
| DIAN | `StubBillingProvider` | No hace nada, queda placeholder para v2 |
| Rappi | `StubAggregatorProvider` | Idem |

**Servicios reales necesarios desde día 1 (sin trámite, instantáneos):**

| Servicio | Costo arranque | Para qué |
|---|---|---|
| Anthropic API key | $5-10 USD recarga inicial | IA facturas + auto-pedido |
| OpenAI API key | $5 USD recarga | Fallback IA |
| Mapbox token (free tier) | $0 | Geocoding + mapas |
| Postgres local | $0 (Docker) | DB de desarrollo |

**Lo que queda 100% pendiente para fase de integración real (lista al final del doc).**

---

## 1. Pre-requisitos locales

```bash
# macOS
brew install node@20 pnpm git docker docker-compose
node --version   # 20.x
pnpm --version   # 9.x
docker --version

# Editor: VS Code + extensión Claude Code
```

**Cuentas a crear ahora (instantáneas, gratis o con $10 USD):**
- GitHub
- Anthropic Console (`console.anthropic.com`) → recargar $10
- OpenAI Platform (`platform.openai.com`) → recargar $5
- Mapbox (`account.mapbox.com`) → token gratis

Anotar API keys en password manager. **Nunca commitear a git.**

---

## 2. Estrategia de testing por módulo

Cada módulo tiene tres niveles de "hecho":

1. **Unit tests** (jest) — lógica pura: `expandRecipe`, motor de promociones, conversión de unidades, etc.
2. **Integration tests** (supertest contra NestJS + Postgres dockerizado) — endpoints completos.
3. **E2E manual local** — vos abriendo el frontend en localhost, ejecutando el flujo end-to-end.

**Definition of Done por módulo:**
- ✅ Schema Prisma + migration aplicada
- ✅ Endpoints REST funcionando con auth y guards
- ✅ Frontend (si aplica) renderizando y operando
- ✅ Unit tests en lógica crítica
- ✅ Al menos 1 happy path E2E manual
- ✅ Al menos 1 edge case probado
- ✅ Commit con mensaje descriptivo

---

## 3. Fases de implementación

12 fases, ordenadas por dependencias. Estimación en días-dev efectivos asumiendo ritmo realista con Claude.

### FASE 0 — Setup base · 2-3 días

**Submódulos:**
- 0.1 Monorepo Turborepo + pnpm workspaces
- 0.2 NestJS app `apps/api` + Prisma + Postgres en Docker
- 0.3 Next.js apps placeholder: `pos`, `kds`, `web`, `admin`, `public-display`, `repa`
- 0.4 Package `packages/types` con Zod
- 0.5 Package `packages/ui` con shadcn/ui base
- 0.6 Package `packages/domain` (vacío, lo poblan otras fases)
- 0.7 ESLint + Prettier + tsconfig compartido
- 0.8 GitHub repo privado + commit inicial
- 0.9 `CLAUDE.md` raíz (template en `kickoff-plan.md`)

**Tests:**
- `pnpm dev` levanta todas las apps en localhost (api: 3001, web: 3000, admin: 3002, etc.).
- `/healthz` en api responde 200.
- Postgres dockerizado responde con `psql`.

**DoD:**
- [ ] Cualquier app puede importar tipos de `packages/types`.
- [ ] `pnpm test` corre (aunque sin tests todavía).
- [ ] `git push` a GitHub funciona.

---

### FASE 1 — Auth y roles · 2 días

**Submódulos:**
- 1.1 Schema `users` (id, email, password_hash, role enum, etc.)
- 1.2 Migrations Prisma
- 1.3 `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`
- 1.4 JWT (access 15min + refresh 7d httpOnly cookie)
- 1.5 Guards: `JwtAuthGuard`, `RolesGuard`
- 1.6 Decoradores `@OnlyDueno()`, `@AdminAccess()`, `@CashierAccess()`, etc.
- 1.7 Seed inicial: 1 user por rol (`dueno@dev.local`, `admin@dev.local`, etc., todos password `dev1234`)
- 1.8 Login UI común en `packages/ui` reutilizado por POS, KDS, Admin, Repartidor
- 1.9 Middleware de Next.js que protege rutas según rol

**Tests:**
- Unit: hash de password, verificación.
- Integration: flujo completo login → endpoint protegido → refresh.
- E2E: login en POS con `dueno@dev.local` me lleva al dashboard.

**DoD:**
- [ ] No accedés a ningún endpoint sin token válido.
- [ ] Cajero NO puede hacer GET a un endpoint @OnlyDueno().
- [ ] Refresh token funciona; access expira y se renueva.

---

### FASE 2 — Catálogo (productos / subproductos / insumos / recetas) · 5-7 días

**Submódulos:**
- 2.1 Schema: `products`, `product_sizes`, `product_modifiers`, `combo_components`, `subproducts`, `ingredients`, `recipe_edges`.
- 2.2 Migrations.
- 2.3 CRUD endpoints de cada entidad.
- 2.4 **Función `expandRecipe(productId)`** en `packages/domain`:
  - Recursivamente desciende.
  - Aplica `quantity_neta / (1 - merma_pct)`.
  - Aplica `yield` de subproductos.
  - Detecta ciclos (lanza error).
  - Retorna `Map<ingredient_id, totalNeededInRecipeUnit>`.
- 2.5 UI Admin: listado y formulario de productos con tamaños, modifiers, combos.
- 2.6 UI Admin: editor visual de receta (árbol expandible).
- 2.7 UI Admin: CRUD subproductos.
- 2.8 UI Admin: CRUD insumos con `unit_purchase`, `unit_recipe`, `conversion_factor`, `threshold_min`.
- 2.9 Endpoint `GET /products/:id/expanded-cost` que usa `expandRecipe` + precios actuales de insumos para calcular COGS.

**Tests:**
- Unit `expandRecipe`:
  - Producto con receta plana de insumos.
  - Producto con receta que pasa por subproducto.
  - Producto con receta de 3 niveles de profundidad (producto → subproducto → subproducto → insumo).
  - Detección de ciclo.
  - Aplicación correcta de yield + merma.
- Integration: creo un producto vía API, le asigno receta, consulto COGS.
- E2E: creo en UI "Hamburguesa Nashville" con receta completa (pan, pollo nashville cocido, tomate, salsa) donde "pollo nashville cocido" es subproducto con su propia receta. Veo cálculo COGS correcto.

**DoD:**
- [ ] Puedo crear un producto con receta de subproducto en menos de 2 minutos en la UI.
- [ ] El COGS se calcula correctamente y refleja merma + yield.
- [ ] Detección de ciclos previene receta circular.

---

### FASE 3 — Inventario + audit log · 3-4 días

**Submódulos:**
- 3.1 Schema: `inventory_movements` (insert-only enforcement), `audit_log`.
- 3.2 Vista materializada `current_stock` con refresh en trigger o cron.
- 3.3 Endpoints: `GET /ingredients` con stock, `GET /inventory/movements`, `POST /inventory/adjustments` (con guard de approval para >umbral).
- 3.4 Lógica de alerta: si `current_stock < threshold_min`, marcar como "alerta activa".
- 3.5 Audit log middleware: cada acción sensible (definir lista en código) inserta entry automáticamente.
- 3.6 UI Admin: vista de inventario con stocks actuales + alertas en rojo.
- 3.7 UI Admin: vista de movimientos con filtros (insumo, fecha, tipo).
- 3.8 UI Dueño: vista del audit log con filtros.

**Tests:**
- Unit: cálculo de stock = SUM(delta).
- Integration: ajuste manual genera movimiento + audit log.
- Integration: enforcement de insert-only (intento de UPDATE falla con error PG).
- E2E: cargo un movimiento INITIAL desde UI, veo stock cambiar; ajuste manual crea audit log.

**DoD:**
- [ ] Stock se calcula correcto y reactivo a movimientos.
- [ ] Alertas de stock crítico aparecen en UI.
- [ ] Audit log captura aprobaciones, ajustes, anulaciones (probado con tres acciones distintas).

---

### FASE 4 — Proveedores + IA Facturas · 5-6 días

**Submódulos:**
- 4.1 Schema: `suppliers`, `supplier_products`, `invoices`, `invoice_items`.
- 4.2 CRUD proveedores + UI Admin completa con catálogo de productos por proveedor.
- 4.3 Adapter `LLMProvider` interface en `packages/types`.
- 4.4 Impl `AnthropicAdapter` con Claude Haiku 4.5 (vision, JSON mode con schema).
- 4.5 Impl `OpenAIAdapter` con GPT-4o-mini (vision, JSON mode).
- 4.6 Strategy de fallback: Anthropic primario, OpenAI si timeout/error.
- 4.7 Storage: para dev, guardar fotos en `./tmp/uploads/`. Para prod, R2 (`packages/domain/storage` con interfaz `StorageProvider`).
- 4.8 Endpoint `POST /invoices/upload-photo` (multipart): recibe foto, llama LLM, devuelve `invoice_id_draft` + extracción.
- 4.9 Endpoint `POST /invoices/from-clone` (manual rápido): clona última factura del proveedor con cantidades editables.
- 4.10 UI Admin: pantalla de carga de factura con drag-drop foto + preview de extracción + edición tabular antes de confirmar.
- 4.11 Endpoint `POST /invoices/:id/confirm`: aplica items al inventario via `inventory_movements` con type=PURCHASE.
- 4.12 UI Admin: histórico de facturas + reapertura para corrección.

**Tests:**
- Unit: prompt de Anthropic con factura mock JSON, validación de salida con Zod.
- Unit: fallback a OpenAI cuando Anthropic falla.
- Integration: upload foto real, ver extracción retornada.
- E2E con 5+ facturas reales tuyas: precisión de NIT, ítems, totales. Fijar baseline.
- E2E manual rápido: clonar última factura del proveedor X, modificar cantidad, confirmar.

**DoD:**
- [ ] Procesar una factura de proveedor real toma <30s.
- [ ] Editar la extracción es trivial en UI antes de confirmar.
- [ ] Manual rápido funciona en <60s para una factura recurrente.
- [ ] Confirmar factura impacta el inventario correctamente.

---

### FASE 5 — POS Cajero base (con print mock) · 5-6 días

**Submódulos:**
- 5.1 Schema: `sales`, `sale_items`, `sale_status_log`, `shifts` parcial (apertura).
- 5.2 Sequence de Postgres `receipt_seq`.
- 5.3 UI POS layout: catálogo izquierda, carrito derecha.
- 5.4 Selección de producto → modificadores → tamaño → al carrito.
- 5.5 Combos.
- 5.6 Endpoint `POST /sales` con `Idempotency-Key` header.
- 5.7 Engine de promociones (motor en `packages/domain`):
  - Schema: `promotions`, `promotion_products`.
  - Resolución: para cada item del carrito, busca todas las promos activas que matchean día+hora+producto, aplica la de mayor `discount_pct`.
  - UI tachado del precio original.
- 5.8 Apertura de turno (`POST /shifts/open` con `opening_cash`).
- 5.9 UI cobro: efectivo o digital con doble validación (UI muestra "Verificá en app del negocio + comprobante del cliente" antes del botón confirmar).
- 5.10 `MockPrinterAdapter`: renderiza recibo como HTML, abre en nueva pestaña, guarda PDF en `./tmp/receipts/`.
- 5.11 `MockCashDrawerAdapter`: loggea apertura.
- 5.12 Print Agent local skeleton (`apps/print-agent`) con HTTP server en localhost:9100, modos `mock` (default en dev) y `real` (ESC/POS).
- 5.13 Endpoint `POST /sales/:id/print` y `POST /sales/:id/open-drawer`.
- 5.14 Numeración de recibos consecutiva inmutable.
- 5.15 Detección de saltos en consecutivo (cron diario o on-demand).

**Tests:**
- Unit: motor de promociones con escenarios de overlap.
- Unit: cálculo de total con descuentos + impuestos (si aplican).
- Integration: crear venta → genera receipt_number → impacta inventario via expandRecipe.
- E2E: arme un pedido en POS, cobre en efectivo, vea PDF del recibo en `./tmp/receipts/`.

**DoD:**
- [ ] Vendo en POS sin internet (mock printer + mock drawer + IndexedDB) — pruebo offline en Chrome devtools.
- [ ] Promoción "Lunes -10%" se aplica automáticamente en cobro.
- [ ] Recibo PDF tiene todos los campos definidos en spec (sin método de pago).

---

### FASE 6 — KDS Cocina + Pantalla Pública · 3-4 días

**Submódulos:**
- 6.1 NestJS WebSocket gateway `/ws/kds` con socket.io + auth JWT en handshake.
- 6.2 Eventos: `order.created` (cuando sale pasa a PAGADO), `order.status.changed`.
- 6.3 UI KDS: tarjetas con tiempos de espera (cronómetro), botón grande "Iniciar / Listo".
- 6.4 Endpoints: `POST /kds/orders/:id/start`, `POST /kds/orders/:id/ready`.
- 6.5 Cada cambio escribe en `sale_status_log` con timestamps (para reportes de tiempo por etapa).
- 6.6 NestJS SSE controller `/public-display/stream`.
- 6.7 UI Pantalla Pública: número grande centrado + 1-2 próximos abajo.
- 6.8 Lógica: cuando una orden pasa a `LISTO_DESPACHO` y `type=COUNTER`, actualiza el feed SSE.

**Tests:**
- Integration: WS handshake con JWT, recibo broadcast de `order.created`.
- Integration: SSE stream emite eventos al cambiar turno.
- E2E: en POS confirmo un pago → en KDS aparece tarjeta nueva en vivo. Marco listo en KDS → en pantalla pública el turno actualiza.

**DoD:**
- [ ] Ciclo POS → KDS → Pantalla Pública funciona sin refresh manual.
- [ ] Si la pantalla pública se desconecta (cierro tab y reabro), se reconecta sola y muestra estado correcto.

---

### FASE 7 — Web Pública pedidos (sin Mapbox aún) · 4-5 días

**Submódulos:**
- 7.1 UI web pública: home con menú, navegación por categorías, vista de producto.
- 7.2 Carrito persistido en localStorage.
- 7.3 Modificadores aplicables al producto desde web.
- 7.4 Aplicación de promociones activas en el momento del checkout.
- 7.5 Checkout flow:
  - Tipo: pickup / delivery (delivery en este punto solo guarda dirección texto, sin validación 3km todavía).
  - Datos cliente: nombre, celular, NIT opcional, dirección si delivery.
- 7.6 Endpoint `POST /web/orders` (público con rate-limit).
- 7.7 Generación de orden con status `PENDIENTE_PAGO`.
- 7.8 Pantalla post-checkout con instrucciones de pago + tracking ID.
- 7.9 Endpoint `GET /web/orders/:id?token=` (público con token).
- 7.10 UI POS: notificación nueva orden web pendiente (vía WS).
- 7.11 Cajero confirma pago manual desde POS → status `PAGADO` → entra al KDS automáticamente.

**Tests:**
- Integration: orden creada via API pública pasa a KDS al confirmar pago.
- E2E: armo carrito en web, hago checkout pickup, voy a POS y confirmo pago, veo en KDS.

**DoD:**
- [ ] Cliente arma pedido y confirma checkout sin login.
- [ ] Cajero ve la notificación nueva en POS y confirma pago.
- [ ] Pedido entra al KDS automáticamente y sigue todo el flujo.

---

### FASE 8 — Mapbox + validación 3km · 1-2 días

**Submódulos:**
- 8.1 Tomar Mapbox token (gratis), guardar en env vars.
- 8.2 Componente `<MapboxAddressAutocomplete />` en `packages/ui` usando Mapbox Search Box JS SDK.
- 8.3 Componente `<DeliveryRangeMap />` con círculo de 3km centrado en restaurante (configurable).
- 8.4 Reemplazar input texto de dirección en checkout web por el autocomplete.
- 8.5 Endpoint backend `POST /web/orders` valida lat/lng del cliente vs lat/lng del restaurante con Haversine.
- 8.6 Si fuera de 3km → 400 con mensaje claro.
- 8.7 UI muestra el círculo en el mapa al typear y el pin del cliente; visualmente bloquea el botón si está fuera.

**Tests:**
- Unit: función Haversine.
- Integration: checkout con dirección a 4km falla 400.
- E2E: checkout con dirección a 1km funciona, a 4km muestra error con mapa.

**DoD:**
- [ ] Cliente con dirección dentro 3km puede confirmar.
- [ ] Cliente con dirección fuera 3km ve mensaje claro y mapa con su pin afuera del círculo.

---

### FASE 9 — WhatsApp con Mock + Dev Inbox · 3-4 días

**Submódulos:**
- 9.1 Adapter `WhatsAppProvider` interface en `packages/types`.
- 9.2 Impl `MockWhatsAppAdapter` (default en dev): guarda mensajes en tabla `dev_inbox` (no `whatsapp_messages` real).
- 9.3 Impl `MetaWhatsAppAdapter` (no se conecta todavía, queda como skeleton — completar en fase de integración real).
- 9.4 Schema: `whatsapp_messages`, `dev_inbox`.
- 9.5 Service `NotificationService` que: conoce templates, recibe payload, manda via adapter, registra en `whatsapp_messages`.
- 9.6 Templates definidos en código (`packages/domain/whatsapp-templates.ts`):
  - `payment_instructions` (a cliente)
  - `payment_received` (a cliente)
  - `order_in_preparation` (a cliente, opcional)
  - `order_dispatched` (a cliente delivery)
  - `order_delivered` (a cliente delivery)
  - `order_pickup_ready` (a cliente pickup)
  - `cash_discrepancy_alert` (a Dueño)
  - `purchase_order` (a Proveedor — F-B)
  - `low_stock_alert` (a Admin/Dueño)
- 9.7 Hooks de eventos: cuando una sale cambia de status, dispara la notif correspondiente.
- 9.8 UI Admin: pantalla `/admin/dev/whatsapp-inbox` que renderiza los mensajes del `dev_inbox` como conversación de WhatsApp Web fake. Permite "responder" desde dev (manual).

**Tests:**
- Unit: render de cada template con payload de ejemplo.
- Integration: cuando se confirma pago → notificación `payment_received` aparece en `dev_inbox`.
- E2E: ciclo completo de pedido web delivery dispara las 4 notificaciones esperadas (pay instructions → received → dispatched → delivered) y se ven todas en la dev inbox.

**DoD:**
- [ ] Toda transición de estado dispara la notificación correcta.
- [ ] Dev Inbox renderiza los mensajes correctamente.
- [ ] Cuando llegue Meta WABA real, solo cambio el adapter en config.

---

### FASE 10 — Repartidor: app + asignación · 5-7 días

**Submódulos:**
- 10.1 Schema: campos delivery en `sales` (repartidor_id, assigned_at, etc.); enum availability en `users`.
- 10.2 Service `AssignationService`:
  - Cuando una sale entra a `LISTO_DESPACHO` y type es DELIVERY:
  - Busca usuarios con role REPARTIDOR + availability DISPONIBLE, ordenados por `last_assigned_at` ascendente.
  - Asigna al primero encontrado, actualiza `last_assigned_at`, emite WS `assignment.new` a su user_id room.
  - Si no hay disponibles → status `LISTO_DESPACHO_SIN_ASIGNAR`, alerta UI POS/Admin.
- 10.3 UI App Repartidor (PWA mobile): login, toggle availability, lista de pedidos asignados.
- 10.4 Lista ordenada por Haversine desde dirección restaurante.
- 10.5 Vista mapa con pines (Mapbox).
- 10.6 Botones grandes para cambiar estado: "Salí a entregar" (`EN_RUTA`), "Entregué" (`ENTREGADO`), "Cliente no contesta" (`INTENTO_FALLIDO_N`), "Devolver al local" (`DEVUELTO`).
- 10.7 Visibilidad celular cliente solo si estado activo (mostrar / esconder dinámico).
- 10.8 Endpoint admin `POST /sales/:id/reassign` para override manual.
- 10.9 WhatsApp templates dispararse: `order_dispatched` cuando cambia a EN_RUTA, `order_delivered` cuando ENTREGADO.
- 10.10 Edge cases: cancelación post-pago manda al estado `CANCELADO_SIN_REEMBOLSO` (requiere aprobación dueño).
- 10.11 Cron de timeout: si una sale lleva 60+ min en EN_RUTA → alerta admin.
- 10.12 Cron cancelación: pedido `PENDIENTE_PAGO` 30+ min sin confirmación → `CANCELADO_NO_PAGO` + WhatsApp.

**Tests:**
- Unit: round-robin con 3 repartidores, asigna correctamente.
- Unit: si todos OCUPADO, deja sin asignar.
- Integration: orden de WEB_DELIVERY pasa por todo el flujo hasta ENTREGADO.
- E2E: simulo 2 repartidores, hago 3 pedidos, verifico distribución.

**DoD:**
- [ ] Round-robin asigna justo entre repartidores disponibles.
- [ ] App del repartidor funciona en mobile (probada en chrome devtools mobile o en celular real apuntando a tu IP local).
- [ ] Edge cases (intento fallido, devolución, cancelación) cubiertos.

---

### FASE 11 — Cierre de caja + Anti-fraude · 4-5 días

**Submódulos:**
- 11.1 Cierre de turno (`POST /shifts/close`):
  - Calcula `expected_cash` = opening + ventas efectivo - reembolsos efectivo.
  - Compara con `counted_cash`.
  - Si `|difference| > umbral` → `MockWhatsAppAdapter` envía alerta (visible en dev inbox).
- 11.2 UI Cierre de caja: campo conteo, vista comparativa, confirmación.
- 11.3 **Control 1 anti-fraude:** audit log middleware ya está de Fase 3, ahora se conecta a TODAS las acciones sensibles (anulaciones, descuentos, ajustes inv, apertura cajón sin venta, cambios precio/receta).
- 11.4 **Control 2:** flujo de aprobación inline con PIN (cajero intenta acción sensible → modal pide PIN admin → backend valida).
- 11.5 Schema `approval_pins` (hash del PIN), endpoint `/approval-pins/me` para que cada admin/dueño setee/cambie su PIN.
- 11.6 **Control 3:** reporte diario de anomalías por cajero. SP/query: por cajero por turno, calcular # anulaciones, # descuentos, # cajón sin venta, # ajustes inv. Compararlo con histórico personal y marcar 2σ.
- 11.7 **Control 4:** import CSV extracto Nequi/Bancolombia. UI: drag-drop CSV → matching contra ventas confirmadas digital → vista comparativa con red flags.
- 11.8 **Control 5:** detección de saltos en consecutivo de recibos (cron diario + endpoint manual).

**Tests:**
- Unit: cálculo expected_cash con varios escenarios.
- Unit: detección de anomalías (mock data, verificar 2σ).
- Integration: cierre con descuadre dispara alerta.
- E2E: cargo CSV con un row falso (sin venta correspondiente) → veo flag en UI.

**DoD:**
- [ ] Descuadre dispara alerta visible en dev inbox.
- [ ] PIN bloquea acciones sensibles cuando cajero no escala bien.
- [ ] Reconciliación CSV detecta pagos inventados.

---

### FASE 12 — Auto-pedido IA + Promociones avanzadas · 4-5 días

**Submódulos:**
- 12.1 Schema `purchase_suggestions`.
- 12.2 Cron horario: evalúa insumos < threshold → si hay alguno → genera sugerencia.
- 12.3 Prompt para Claude Haiku 4.5 (en `packages/domain/llm-prompts/auto-purchase.ts`):
  - Input: stock actual, histórico consumo 30/60/90 días, último precio por proveedor, días cobertura objetivo (default 7).
  - Output JSON: lista de pedidos por proveedor, cantidades sugeridas, mensaje WhatsApp redactado.
- 12.4 UI Admin: pantalla `/admin/sugerencias-pedido` con sugerencias pendientes.
- 12.5 Editar antes de aprobar: cambiar cantidades, agregar/quitar items, cambiar proveedor.
- 12.6 Botón "Aprobar y enviar": fanout WhatsApp(s) al/los proveedor(es) con template `purchase_order` + texto generado.
- 12.7 Promociones avanzadas: la engine de Fase 5 ya cubrió `PERCENT_OFF`. Acá ampliar UI Admin para crear, editar, desactivar promos. Vista calendario opcional.

**Tests:**
- Unit: prompt con datos mock, validar JSON salida.
- Integration: cron dispara cuando un insumo cae bajo umbral.
- E2E: un insumo lo bajo manualmente bajo threshold → veo sugerencia generada → la apruebo → veo el WhatsApp en dev inbox.

**DoD:**
- [ ] Sugerencias IA tienen sentido al revisarlas con tu intuición de dueño.
- [ ] Tap aprobar envía WhatsApp(s) al proveedor (visible en dev inbox).
- [ ] Costo de IA por sugerencia <$0.05 USD.

---

### FASE 13 — Reportes y Dashboard · 4-5 días

**Submódulos:**
- 13.1 Endpoint `/reports/dashboard` con top 8 hero pre-calculadas (queries optimizadas con índices apropiados).
- 13.2 UI Dueño: dashboard hero con 8 cards.
- 13.3 Sub-páginas:
  - `/reports/sales` con filtros y gráficos (Recharts).
  - `/reports/cogs` por producto con comparativa histórica.
  - `/reports/anomalies` (control 3 antifraude detallado).
  - `/reports/inventory` (rotación, cobertura, merma).
  - `/reports/web-funnel` (sesiones → pedidos, abandono).
  - `/reports/payment-reconciliation` (control 4).
  - `/reports/labor-cost` (sale del módulo trabajadores).
- 13.4 Export CSV/PDF de cada reporte.

**Tests:**
- Integration: cada endpoint de reporte responde con la estructura esperada.
- E2E manual: dashboard refleja correctamente los datos sembrados.

**DoD:**
- [ ] Dashboard top 8 carga en <500ms.
- [ ] Datos de los 15 reportes son consistentes con la realidad de la DB.

---

### FASE 14 — Trabajadores RRHH ligero · 3-4 días

**Submódulos:**
- 14.1 Schema: `workers`, `attendance`, `payrolls`.
- 14.2 CRUD workers desde Admin (incluye usuario asociado en `users` con rol TRABAJADOR).
- 14.3 UI Trabajador (módulo dentro del Admin con login propio): mi perfil, mis horas, mi pago.
- 14.4 Check-in / check-out (botón + timestamp).
- 14.5 Generación de payrolls por período (cron mensual o manual).
- 14.6 Aprobación + marcado pagado por Admin/Dueño.

**Tests:**
- Integration: check-in/check-out genera attendance entry correctamente.
- E2E: trabajador hace check-in, lo veo en admin, genero payroll, lo apruebo.

**DoD:**
- [ ] Trabajador entra a su URL con email/password, ve su info.
- [ ] Payroll calcula correcto según `payment_type` (per_day vs monthly).

---

### FASE 15 — PWA, offline y hardening final · 5-7 días

**Submódulos:**
- 15.1 Manifests + service workers en POS y KDS.
- 15.2 IndexedDB stores: `catalog_snapshot`, `pending_operations`, `recent_sales`, `current_shift`.
- 15.3 Cola de sync con idempotency keys + backoff retries.
- 15.4 Service worker estrategia: GET network-first cache-fallback; POST network-only con queue offline.
- 15.5 UI indicators: badge "offline" cuando no hay red, "sincronizando X pendientes" cuando hay cola.
- 15.6 Bloqueo cierre de turno cuando cola pendiente > 0.
- 15.7 Tests stress: 50 ventas offline → reconectar → cola drena correcta.
- 15.8 Idempotency en backend: tabla `idempotency_keys` con TTL.
- 15.9 Rate-limit endpoints públicos (NestJS Throttler).
- 15.10 Sentry para errores en frontend y backend.
- 15.11 Health checks completos (`/healthz` con DB ping + LLM ping).

**Tests:**
- E2E offline: cierro internet en chrome devtools, hago 3 ventas, vuelvo a abrir, verifico que sync funciona y no duplica.
- Stress: 50 ventas en cola, drenado completo en <10s.

**DoD:**
- [ ] POS funciona sin internet por 30+ min con 20+ ventas.
- [ ] Reconexión sincroniza todo sin pérdida ni duplicación.
- [ ] Errors van a Sentry.

---

## 4. Orden recomendado de ejecución y dependencias

```
FASE 0 (Setup) 
   ↓
FASE 1 (Auth)
   ↓
FASE 2 (Catálogo) ──────┐
   ↓                    │
FASE 3 (Inventario) ────┤
   ↓                    │
FASE 4 (Proveedores+IA)─┤
   ↓                    │
FASE 5 (POS) ───────────┤
   ↓                    │
FASE 6 (KDS+Pantalla) ──┤
   ↓                    │
FASE 7 (Web Pública) ───┤
   ↓                    │
FASE 8 (Mapbox 3km) ────┤  ← acá empezás a probar end-to-end
   ↓                    │     en localhost regularmente
FASE 9 (WhatsApp Mock) ─┤
   ↓                    │
FASE 10 (Repartidor) ───┤
   ↓                    │
FASE 11 (Cierre+Antifraude)
   ↓
FASE 12 (Auto-pedido + Promos)
   ↓
FASE 13 (Reportes)
   ↓
FASE 14 (Trabajadores)
   ↓
FASE 15 (PWA offline + hardening)
```

**Total estimado:** 60-75 días-dev efectivos. ~14-17 semanas con ritmo de 4-5 días-dev/semana.

---

## 5. Pendientes externos (NO bloquean el dev local)

Estos se gestionan en paralelo, pero NO frenan ninguna fase de implementación. Listo cada uno con cuándo se conectan al sistema.

### 5.1 Meta Business + WhatsApp Cloud API
- **Trámite:** crear cuenta Meta Business, verificación, alta WABA, plantillas pre-aprobadas.
- **Plazo real:** 5-15 días hábiles.
- **Cuándo conectar al sistema:** después de FASE 9 (mock listo). Solo se cambia el adapter de `MockWhatsAppAdapter` → `MetaWhatsAppAdapter` y se setean las API keys. Las plantillas YA están definidas en `packages/domain/whatsapp-templates.ts` desde Fase 9.
- **Línea telefónica:** comprar SIM nueva del negocio. Disparar día 1.

### 5.2 Hardware
- **Impresora térmica Epson TM-T20III + cajón:** comprar ya. Se usa al final de FASE 5 cambiando `MockPrinterAdapter` → `EscPosPrinterAdapter` en el Print Agent local.
- **Tablet pantalla pública:** comprar antes de Fase 6. Se prueba antes con un tab en modo kiosko en Chrome.
- **PC mostrador:** se necesita antes del soft launch (Fase 16/QA). Mientras dev: tu Mac.

### 5.3 Contador (validación DIAN — GAP-14)
- **Tarea:** reunión con tu contador esta semana. Validar régimen + obligación de documento equivalente electrónico POS.
- **Si dice "obligado":** se agrega FASE 16 (DIAN) + adapter `BillingProvider` real (FacturaCO, Soenac, Carvajal, etc.).
- **Si dice "podés operar con recibo interno":** seguimos con plan, agendar fecha de migración a DIAN para v2.

### 5.4 Dominio + DNS
- **Tarea:** registrar dominio en Cloudflare (~$15/año). Configurar subdominios.
- **Cuándo:** antes del primer deploy a producción (post-Fase 15).
- **Mientras dev:** localhost.

### 5.5 Cloudflare R2 (storage real)
- **Tarea:** crear bucket en Cloudflare, generar API tokens.
- **Cuándo conectar:** después de FASE 4 si querés probar storage real, o post-Fase 15 antes de prod. Mientras dev: filesystem local.

### 5.6 Vercel + Railway (deploy producción)
- **Tarea:** crear cuentas, conectar a GitHub, configurar env vars producción.
- **Cuándo:** post-Fase 15. Mientras dev: localhost.

### 5.7 PIN aprovecho del POS para pruebas
- **Tarea:** definir PINs de aprobación de Admin Operativo y Dueño en producción. En dev seedea con `0000` y `1111`.
- **Cuándo:** primer ingreso a prod.

### 5.8 Carga inicial de datos reales
- **Tarea:** preparar lista real de productos, recetas, insumos, proveedores con sus precios, primer batch de stock inicial.
- **Cuándo:** antes del soft launch (Fase 15+). Mientras dev: seed con data sintética representativa.

---

## 6. Cómo arrancar HOY

1. Instalá Node, pnpm, Docker en tu Mac.
2. Creá tu cuenta en GitHub (si no la tenés), Anthropic, OpenAI, Mapbox.
3. Recargá $10 en Anthropic, $5 en OpenAI.
4. Tomá tus tokens y guardalos en password manager.
5. Abrí Claude Code en una carpeta nueva (`mkdir pos-tercos`) y dale como contexto este `implementation-plan.md` + `pos-spec.v1.md` + `architecture.md`.
6. Pedile: *"Vamos a empezar FASE 0. Generá el monorepo y los placeholders. Una task a la vez. Avisame al terminar cada submódulo."*
7. Tu trabajo: revisar cada commit, mergear cuando esté bien, pedir ajustes cuando no.

**Cadencia esperada:**
- FASE 0-1 (setup + auth): ~5 días
- FASE 2-4 (catálogo + inventario + facturas IA): ~14 días
- FASE 5-7 (POS + KDS + Web): ~14 días
- FASE 8-9 (Mapbox + WhatsApp mock): ~5 días
- FASE 10 (Repartidor): ~7 días
- FASE 11-12 (cierre + antifraude + auto-pedido): ~9 días
- FASE 13-14 (reportes + trabajadores): ~8 días
- FASE 15 (PWA hardening): ~7 días

**Cualquier desvío de >3 días sobre la estimación de una fase, parar y reflexionar.**

---

## 7. Cuándo este plan se cruza con la realidad externa

Cuando lleguen los recursos externos (en cualquier orden):

| Recurso disponible | Acción inmediata |
|---|---|
| Meta WABA aprobada | Cambiar `WhatsAppProvider` config a `MetaWhatsAppAdapter`, setear API keys, probar 1 mensaje real, deploy |
| Impresora física llegó | Conectar al PC dev, cambiar Print Agent a modo `real`, probar imprimir un recibo de Fase 5 |
| Cajón llegó | Conectar al RJ11/12 de la impresora, probar comando ESC/POS de apertura |
| Tablet llegó | Configurar Fully Kiosk Browser apuntando a `http://tu-ip-local:3003` (display app), validar SSE en pantalla real |
| Contador validó DIAN | Si dice "obligado", insertar FASE 16 (DIAN) en el plan; si no, seguir |
| Dominio registrado | Configurar subdominios en Cloudflare apuntando a Vercel y Railway |
| Cuentas Vercel/Railway listas | Crear projects, configurar env vars, hacer primer deploy |

---

**Estado:** Plan local-first listo para ejecución. Todo el dev de v1 puede arrancar HOY sin esperar a Meta, hardware, contador o dominio. Esos se integran al final de cada fase relevante o post-Fase-15.
