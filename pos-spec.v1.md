# POS Comida Rápida — Spec v1 Consolidado

> Salida de Fase 2 (grill-me). Todas las decisiones de la interrogación están **lockeadas**. Este documento es el insumo único para Fase 3 (arquitectura). Los GAPs están cerrados.

---

## 0. Resumen ejecutivo de v1

POS de comida rápida en mostrador, 1 punto de venta en Colombia, 1 dev solo + Claude Code. v1 entrega **5 superficies** (POS Cajero, KDS Cocina, Pantalla Pública, Web Pública, Admin Completo) y un **módulo de Repartidor** dentro del Admin/auth global. Sin DIAN, sin pasarela de pagos, sin lector de barras.

**Plazo realista revisado: 14-18 semanas (3.5-4.5 meses).** El plazo original de 1-2 meses fue descartado en sanity check de Fase 2; v1 ship completo, sin partir en releases.

**Costo recurrente mensual estimado: USD $40-100/mes** (Vercel Pro + Railway + WhatsApp Cloud + IA + Mapbox dentro del free tier).

---

## 1. Stack y proveedores cerrados

| Capa | Decisión | Notas |
|---|---|---|
| Backend | NestJS (TypeScript) | API REST + WebSocket (KDS bidireccional) + SSE (pantalla pública). |
| Frontend (todas las superficies) | Next.js (App Router) | Cuatro frontends independientes en monorepo. |
| Monorepo | Turborepo o Nx | Decisión final en Fase 3, pero asume Turborepo. |
| DB | PostgreSQL managed | Single source of truth. |
| POS / KDS arquitectura | **PWA pura + IndexedDB + Service Worker + agente HTTP local mínimo para impresora** | No Electron, no Tauri. |
| Realtime KDS | WebSocket | Bidireccional (KDS marca estados, POS los ve). |
| Realtime pantalla pública | **SSE (Server-Sent Events)** | Read-only, reconexión automática. |
| Hardware impresora | **Epson TM-T20III o equivalente USB**, conectada al PC de mostrador | Cajón monedero conectado a la impresora vía RJ11/12. |
| Pantalla pública | **Tablet pequeña** en modo kiosko apuntando a URL del frontend | Solo muestra turno actual. |
| WhatsApp | **Cloud API oficial de Meta**, con adapter `WhatsAppProvider` para swap a Twilio en v2 | Iniciar trámite Meta Business + WABA día 1, plazo 5-10 días hábiles. |
| Mapa + geocoding + autocomplete | **Mapbox** (Maps GL JS + Geocoding + Search Box) | Free tier cubre v1. |
| IA facturas [F-C] y auto-pedido [F-B] | **Claude Haiku 4.5 con vision** (primario) + **GPT-4o-mini con vision** (fallback) | Cap mensual total IA: **USD $20/mes**. |
| Despliegue frontends | **Vercel** | Pro tier en producción. |
| Despliegue backend + DB | **Railway** (US East) | Postgres con backups diarios automáticos 7 días. |
| Storage de fotos de facturas | **Cloudflare R2** | Retención indefinida, sin egress fees. |

---

## 2. Apps / superficies finales

1. **POS Cajero** (PWA, online + offline) — toma pedido, cobro, impresión, apertura de cajón, cierre de caja.
2. **KDS Cocina** (PWA, online + offline) — pantalla con tarjetas por orden, tap para cambiar estado, tiempos por etapa.
3. **Pantalla Pública de Turnos** (SSE, online-only) — solo número de turno actual + opcionalmente próximos 1-2.
4. **Web Pública de Pedidos** (online-only) — menú, carrito, checkout sin login (nombre + número + dirección si domicilio), validación 3km.
5. **Admin Completo** (online-only) — productos, recetas, inventario, proveedores, alertas, reportes, auditoría, módulo trabajadores ligero.
6. **App del Repartidor** (PWA mobile-friendly, online-only) — login email/password, lista de pedidos asignados, mapa con pines, cambio de estados.

> La "Web de trabajadores" es un módulo dentro del Admin con login propio para usuarios con rol Trabajador (no es app separada).

---

## 3. Roles y permisos

5 roles fijos, sin RBAC granular en v1.

| Rol | Permisos |
|---|---|
| **Cajero** | Vende, cobra, imprime, abre cajón con venta, hace cierre de caja. **No** puede anular ventas confirmadas, **no** puede aplicar descuento >15%, **no** puede abrir cajón sin venta. |
| **Cocinero** | Solo accede al KDS, cambia estados de orden. |
| **Repartidor** | Login en su app, ve pedidos asignados, marca estados (`EN_RUTA`, `ENTREGADO`, `INTENTO_FALLIDO_X`, `DEVUELTO`), ve celular del cliente solo durante entrega activa. |
| **Admin Operativo** | Cajero+Cocinero+ gestiona productos, recetas, inventario, proveedores, reportes operativos, aprueba descuentos/anulaciones del cajero, aprueba ajustes de inventario hasta cierto monto. **No** ve estados financieros completos ni audit log de cambios sensibles. |
| **Dueño** | Todo. Único rol que ve estados financieros completos, audit log, reconciliación de pagos, aprueba ajustes de inventario sobre umbral. |
| **Trabajador** | Solo accede a su perfil dentro del Admin (sus horas, su pago). |

En v1 hay un único Dueño activo (vos). Admin Operativo queda definido pero puede no tener usuarios todavía.

---

## 4. Modelo de datos crítico — Producto/Subproducto/Insumo

### 4.1 Jerarquía

Tres tipos de nodo en un grafo:
- **Insumo** (`Ingredient`): se compra a proveedores, entra al inventario por factura, se consume al producir.
- **Subproducto** (`Subproduct`): NO se vende directamente, se prepara en cocina a partir de insumos y/o otros subproductos. Ejemplo: "pollo Nashville cocido". Tiene una receta.
- **Producto** (`Product`): SE vende. Tiene una receta de insumos y/o subproductos. Puede tener tamaños, modificadores, ser parte de combos.

### 4.2 Receta (`recipe_edge`)

Aristas de la receta entre nodos. Cada arista contiene:

| Campo | Descripción |
|---|---|
| `parent_id` | Producto o Subproducto que se produce. |
| `child_id` | Insumo o Subproducto que consume. |
| `quantity_neta` | Cantidad neta consumida en `unit_recipe` del child. |
| `merma_pct` | % de merma esperada (default 0). El sistema descuenta `quantity_neta / (1 - merma_pct)` del stock. |

### 4.3 Subproducto — yield

Cada Subproducto tiene un campo `yield`: una "batch" de la receta produce N unidades. Ejemplo: receta de "pollo Nashville cocido" con `yield = 7` significa que 1 corrida de la receta rinde 7 unidades de 180g cada una.

### 4.4 Unidades

Cada Insumo tiene tres campos:

| Campo | Descripción |
|---|---|
| `unit_purchase` | Unidad en la que se compra (ej. `kg`). |
| `unit_recipe` | Unidad en la que la receta lo consume (ej. `g`). |
| `conversion_factor` | Numérico para convertir `unit_purchase` → `unit_recipe` (ej. 1000). |

Subproductos tienen su propia `unit` (típicamente "unidad"). No requieren conversión porque siempre se consumen como salieron de la receta.

### 4.5 Combos

Un Combo es un Producto especial cuya receta apunta a otros Productos (no insumos). Precio del combo se define como `precio_combo` (puede ser menor a la suma de los componentes — ahí está el "descuento de combo").

### 4.6 Modificadores

Cada Producto tiene un flag `modifiers_enabled` y una lista de modificadores aplicables (sin queso, agregar tocino, sin cebolla, etc). Cada modificador tiene un delta de precio (positivo o negativo o cero) y un delta de receta (qué insumos se suman o restan).

### 4.7 Inventario y movimientos

Tabla `inventory_movement` (insert-only, audit log):

| Campo | Descripción |
|---|---|
| `id` | UUID. |
| `ingredient_id` | FK a Insumo (los Subproductos no se "stockean"; se calculan). |
| `delta` | Cantidad en `unit_recipe` (positiva = entrada, negativa = salida). |
| `type` | `PURCHASE` / `SALE` / `MANUAL_ADJUSTMENT` / `WASTE` / `INITIAL`. |
| `source_id` | FK a la fuente (ej. `invoice_id`, `sale_id`, `adjustment_id`). |
| `user_id` | Quién la generó. |
| `created_at` | Timestamp. |
| `notes` | Texto opcional. |

Stock actual de un insumo = `SUM(delta)`. Nunca se "actualiza" el stock — solo se inserta movimiento. Esto da **audit trail completo gratis**.

---

## 5. Funcionalidades v1 — alcance final

### 5.1 Núcleo (todas v1)

- **[F-A]** Alertas de stock crítico en POS y Admin (umbral configurable por insumo).
- **[F-B] V1 con IA generativa + tap de aprobación.** Cuando insumos cruzan umbral, Claude Haiku 4.5 sugiere un pedido por proveedor (basado en histórico de consumo, días de cobertura, último precio). Admin/Dueño revisa, edita si quiere, aprueba con un tap → WhatsApp al proveedor.
- **[F-C]** Carga de facturas por IA (Haiku 4.5 + GPT-4o-mini fallback). UX: foto/PDF → extracción → **edición humana antes de confirmar** (corrige NIT, ítems, montos si la IA extrajo mal). Adicional: **camino manual rápido** = clonar última factura del mismo proveedor + editar deltas tipo Excel. Al confirmar, impacta inventario via movimiento `PURCHASE`.
- **[F-D]** Costeo por receta con árbol producto → subproducto → insumo, yields y mermas explícitas, conversión de unidades.
- **[F-H]** Web pública con flujo completo:
  - Cliente arma pedido (pickup o domicilio), checkout sin login.
  - Estado `PENDIENTE_PAGO` → WhatsApp al cliente con instrucciones de pago.
  - Cajero/admin verifica con doble validación (app del negocio + comprobante del cliente) → `PAGADO`.
  - Pedido entra al KDS, cocina prepara → `LISTO_DESPACHO`.
  - Domicilio: sistema auto-asigna repartidor disponible (round-robin), si no hay → cola para asignación manual. Estados: `ASIGNADO` → `EN_RUTA` → `ENTREGADO`. Edge cases: `INTENTO_FALLIDO_N`, `DEVUELTO`, `CANCELADO_SIN_REEMBOLSO`, `EN_DISPUTA`.
  - Pickup: cliente recibe WhatsApp cuando esté listo, viene al mostrador, ve su número en pantalla pública.
  - **Validación 3km radius** desde dirección del restaurante en checkout (backend autoritativo + frontend con círculo visual en mapa Mapbox).
  - **NO HAY REEMBOLSO** después de pago confirmado, política explícita en checkout y WhatsApp post-pago.
- **[F-I]** Gestión de productos y recetas con UX prioritaria. Admin/Dueño puede crear producto + receta sin frustración. Soporta modificadores opcionales y combos.
- **[F-J]** UX simple en POS, cero curva.
- **[F-K]** Cierre de caja **sin IA en v1**: cajero ingresa conteo de efectivo → sistema compara contra esperado → si hay descuadre, alerta al Dueño por WhatsApp + queda en histórico.
- **[F-M]** Anti-fraude: **5 controles**:
  1. Audit log inmutable de acciones sensibles (anulaciones, descuentos, ajustes de inventario, aperturas de cajón sin venta, edición de recetas/precios).
  2. Aprobación obligatoria de Admin Operativo / Dueño para cajero en: anular venta confirmada, descuento >15%, apertura de cajón sin venta.
  3. Reporte diario de anomalías por cajero (anulaciones, descuentos, etc.) con highlight rojo si supera 2σ del histórico personal.
  4. Reconciliación de pagos digitales: Dueño importa CSV del extracto Nequi/Bancolombia → sistema compara contra confirmados en POS → red flags si no matchean.
  5. Numeración secuencial inmutable de recibos + detección de saltos.
- **[F-N]** Pantalla pública de turnos (SSE, tablet en modo kiosko) — **solo el turno actual de mostrador + opcional próximos 1-2**. Estados granulares (preparándose / listo / en camino / entregado) son **solo para pedidos web vía WhatsApp**, no para la pantalla.
- **[F-P]** Directriz transversal — cap mensual de IA: **USD $20/mes** con alerta al Dueño si se acerca.

### 5.2 Adicionales v1

- **Promociones por hora y día**: descuento porcentual por franja horaria/día, una promo activa por producto a la vez (mayor descuento gana en overlap), visible al cliente (precio tachado), creables solo por Admin Operativo y Dueño. Modelo de datos extensible para `BOGO`, `FIXED_OFF`, `COMBO_OFF` en v2.
- **Catálogo de proveedores completo**: tabla `proveedores` + UI completa con productos por proveedor + precios típicos + contactos. Auto-creación al procesar primera factura de un proveedor nuevo. Reportes "top proveedores por gasto".
- **Web de trabajadores (RRHH ligero)**: registro de asistencia (entrada/salida), tipo de pago (por día / mensual), nómina simple. Trabajador entra a su URL con auth y ve su perfil.
- **Recibos internos sin DIAN**:
  - Contenido: nombre del negocio, NIT, dirección, teléfono, "DOCUMENTO INTERNO", consecutivo continuo, fecha/hora, cajero, turno, ítems con cant/precio/subtotal, descuentos, total, "*** NO ES FACTURA ***", URL de pedidos web.
  - **NO se imprime el método de pago** (queda solo en sistema interno).
  - NIT del cliente: opcional al cobrar.
  - Cancelaciones/devoluciones imprimen recibo `DOCUMENTO ANULADO` con ID del original.
  - ⚠️ **PENDIENTE DE VALIDAR CON CONTADOR**: obligatoriedad de documento equivalente electrónico POS según tu régimen tributario y facturación anual. Marcado para Fase 5.

### 5.3 Dashboard del Dueño — métricas

**Top 8 hero (siempre visible arriba):**
1. Ventas día / semana / mes (con sparkline comparativa).
2. Ticket promedio.
3. Top 5 productos vendidos (toggle día/semana/mes).
4. COGS por plato + margen %.
5. Hora pico identificada automáticamente.
6. Tiempo promedio KDS extremo a extremo.
7. Descuadre histórico de caja por turno por cajero.
8. Stock crítico activo (# insumos en alerta + cuáles).

**Sub-páginas secundarias (las 7 que quedaron afuera del top 8):**
- % efectivo vs digital.
- Conversión web (sesiones → pedido).
- Abandono de carrito en web.
- Anulaciones / descuentos por cajero (vista anti-fraude profunda).
- Días de cobertura por insumo.
- Merma por insumo (teórica vs real cuando haya datos).
- Costo laboral del mes (sale del módulo trabajadores).

---

## 6. Funcionalidades V2 (diferidas)

| ID | Feature |
|---|---|
| F-E | Alertas avanzadas (vencimientos, rotación lenta, consumo anómalo). |
| F-F | IA estados financieros narrativos. |
| F-G | IA reportes operativos narrativos. |
| F-K (parte) | IA en cierre de caja sugiriendo causas de descuadre. |
| F-M (parte) | Detección anómala anti-fraude por IA. |
| — | DIAN — facturación electrónica. |
| — | Pasarela de pagos / datáfono integrado. |
| — | Lector de código de barras. |
| — | Rappi / Didi / Uber Eats (puerto/adapter listo en v1). |
| — | App nativa. |
| — | Login / cuentas / fidelización del cliente final. |
| — | Multi-tienda, multi-tenant. |
| — | App de repartidor con tracking GPS continuo + ETA al cliente. |
| — | TSP real para optimización multi-parada del repartidor. |
| — | Sort dinámico desde ubicación actual del repartidor. |
| — | Promociones avanzadas (`BOGO`, `FIXED_OFF`, `COMBO_OFF`). |
| — | Auto-importación del extracto Nequi/Bancolombia (v1 es CSV manual). |
| — | RBAC granular por permiso. |

---

## 7. Operación y plazos

### 7.1 Plazo realista cerrado

**14-18 semanas (3.5-4.5 meses)** para v1 completo según estimación detallada acordada en sanity check. Sin partir en releases (Opción A en Fase 2).

### 7.2 Acciones que arrancan **el día 1 en paralelo a desarrollo**

1. **Comprar línea telefónica dedicada para el negocio** (no la personal del dueño).
2. **Iniciar Meta Business Verification + WhatsApp Business Account (WABA)** — plazo 5-10 días hábiles. Sin esto WhatsApp no funciona en producción.
3. **Comprar impresora térmica Epson TM-T20III (o equivalente USB) + cajón monedero compatible RJ11/12**.
4. **Conseguir tablet pequeña** para pantalla pública.
5. **Validar con contador la obligatoriedad o no de DIAN** según régimen y facturación anual.
6. **Configurar PC fija de mostrador** (Windows o Linux con auto-arranque).

### 7.3 Riesgos de plazo monitoreados

- Aprobación de Meta WABA + plantillas pre-aprobadas de WhatsApp (5-15 días).
- Calidad de IA en facturas reales de proveedores (testing con muestras reales temprano).
- Validación legal DIAN (si tu régimen obliga, hay que reescoper).

---

## 8. Estado de cada GAP de Fase 1

| GAP | Estado |
|---|---|
| GAP-1 IA facturas | ✅ Resuelto: B + manual rápido (clonar última factura del proveedor). |
| GAP-2 Offline | ✅ Resuelto: PWA + IndexedDB + agente local de impresión. |
| GAP-3 WhatsApp | ✅ Resuelto: Cloud API + adapter para Twilio futuro. |
| GAP-4 Validación pago | ✅ Resuelto: doble validación (app del negocio + comprobante cliente). |
| GAP-5 Hardware impresora | ✅ Resuelto: Epson USB en PC de mostrador + cajón por RJ11. |
| GAP-6 Pantalla pública | ✅ Resuelto: tablet pequeña con SSE. |
| GAP-7 Unidades / yields / mermas | ✅ Resuelto: B (compra + receta + factor) + yields por subproducto + merma_pct explícita. |
| GAP-8 Catálogo proveedores | ✅ Resuelto: C (catálogo completo con productos por proveedor). |
| GAP-9 Roles | ✅ Resuelto: B (5 roles fijos, separación Admin Operativo / Dueño). |
| GAP-10 Modelo IA | ✅ Resuelto: Haiku 4.5 + GPT-4o-mini fallback, cap USD $20/mes. |
| GAP-11 Despliegue | ✅ Resuelto: Vercel + Railway US East. |
| GAP-12 Domicilio | ✅ Resuelto: C ampliada (módulo repartidor con auth + mapa + Haversine + estados). |
| GAP-13 Promociones | ✅ Resuelto: A (% off por franja, mayor gana, modelo extensible). |
| GAP-14 Recibo legal | ⚠️ Pendiente validar con contador antes de go-live (marcado en Fase 5). |
| GAP-15 Backups | ✅ Resuelto: Railway nativo + R2 para fotos indefinidas. |

---

## 9. Próxima fase

**Fase 3 — Arquitectura.** Toma este spec, produce `architecture.md` con: diagrama mermaid de componentes, monorepo, modelo de datos completo, contratos de API, estrategia offline/realtime, riesgos top 5 con mitigación, plan de v1 ordenado por sprints semanales para 14-18 semanas.

**Estado:** Fase 2 completada. Spec v1 lockeado. ✅
