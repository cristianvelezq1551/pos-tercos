# Informe imparcial de calidad — POS Tercos (2026-07-06)

> Evaluación independiente pre-lanzamiento con 5 revisores especializados
> (arquitectura, rendimiento, resiliencia/SRE, testing, modelo de datos) que
> juzgaron el código sin contexto de quién lo escribió ni de auditorías previas,
> más métricas duras del repo. Objetivo: calidad real y falencias para producción
> a corto y largo plazo. **Este doc NO repite los bugs ya cerrados en
> AUDITORIA-Y-AJUSTES-2026-07.md — es la capa de arriba: calidad estructural.**

## Veredicto global: **B** — por encima del promedio para su tamaño y propósito

El sistema está listo para operar un restaurante hoy. La plata está tomada en
serio (ledger inmutable, serializable+retry, idempotencia end-to-end, asserts de
plata en los e2e), el grafo de módulos es casi acíclico, no hay dinero en Float,
cero `any` en api/domain, cero TODOs, deps al día y sin vulnerabilidades.

Las falencias reales son **pocas, concretas y con nombre**: 2 agujeros de
resiliencia que dolerán el primer mes, 1 problema estructural de rendimiento con
fecha (9-12 meses), 3 invariantes de plata que viven solo en código, y una capa
de UI con cero tests.

## Scorecard

| Dimensión | Nota | Resumen |
|---|---|---|
| Arquitectura y mantenibilidad | **B** | Grafo casi acíclico (1 solo forwardRef), domain puro de verdad, types como contrato real (405 imports). Contras: `sales.service.ts` 1.397 líneas, 3 helpers de retry divergentes, supuesto "1 local" incrustado en el hueso |
| Modelo de datos | **B+** | Ledger inmutable con triggers reales, XOR polimórfico completo, cero Float en plata, receipt_seq protegido. Contras: invariantes de PLATA solo aplicativas (pagos↔total, caja única, tope de descuento) |
| Rendimiento hoy | **A−** | Bundles magros, polling visibility-aware, índices alineados, `take` por defecto. A 1 cajero, sobra |
| Rendimiento a 12-18 meses | **C** | El ledger FIFO es replay-desde-génesis de TODA `inventory_movements` en memoria, sincrónico en el event loop del cobro. OOM/freeze a ~500k movements |
| Resiliencia operativa | **B−** | Offline/idempotencia/backup verificado de nivel producción. Contras: `/healthz` 200 con DB caída anula el modo offline; comanda perdida en silencio; WhatsApp failed sin reintento |
| Testing | **C+** | Motor de plata A− (asserts contra DB, concurrencia real, split ejemplar). UI React: **F** (0 tests .tsx en el monorepo); adapters/WS/SSE ~0 |

**Métricas:** ~86k LOC de src (API 23.8k · admin 26.8k · POS 13k) · 45 archivos de
test · 0 `any` explícitos en api/domain · 0 TODO/FIXME · `pnpm audit --prod`
limpio · deps solo patch/minor detrás.

---

## Falencias por horizonte

### A. Duelen el PRIMER MES (cerrar antes de lanzar)

| # | Falencia | Evidencia | Esfuerzo |
|---|---|---|---|
| A1 | **`/healthz` devuelve HTTP 200 con la DB caída** → el heartbeat del POS (`useConnectivity` mira `res.ok`) cree que está online → las ventas fallan con 5xx y **NO se encolan offline**. El peor de los mundos: ni online ni offline | `health.controller.ts` + `useConnectivity.ts` | **S** (503 si db down + heartbeat valida body) |
| A2 | **La comanda de cocina se pierde en silencio** si falla la impresión (fire-and-forget → solo logError). Cobro OK, plata cobrada, cocina nunca ve el pedido, nadie se entera | `useCheckoutFlow.ts` (printComanda catch) | **S** (aviso bloqueante al cajero + botón de reimpresión visible) |
| A3 | **WhatsApp `failed` en stage terminal nunca se reintenta** — un "pedido listo" fallido deja al cliente esperando para siempre, sin alerta | `notification.service.ts` (releaseFlag sin re-disparo) | **S-M** (cron de barrido de `whatsapp_messages.failed` <24h) |
| A4 | **3 invariantes de plata solo en código** (un path alterno o bug las corrompe en silencio): Σ`sale_payments`==`sales.total`; una sola caja OPEN; descuento ≤ subtotal | DBA top-3, SQL propuesto en el informe del revisor | **S** (1 migración: constraint trigger deferred + partial unique + 2 CHECKs) |
| A5 | **Índice faltante `[sourceType, sourceId]` en `inventory_movements`** — seq scan en void/edición/cortesía/producción, algunos dentro de tx SERIALIZABLE | `sales.service.ts:947` etc. | **Trivial** (1 migración) |
| A6 | **2 mutantes de plata sobreviven a las suites**: (a) VOID no excluido del Z-report — ningún e2e anula una venta y verifica el arqueo del turno; (b) flip de modo de redondeo a nivel centavo — todos los inputs de test son COP enteros | Informe de testing §2 | **S** (2 tests) |
| A7 | Cadena de alertas = solo WhatsApp (si cae Kapso o Railway entero, silencio total). Ya está como pendiente operativo: **UptimeRobot sobre `/healthz`** — pero requiere A1 primero para que el monitor detecte DB caída | deploy.md §0.2 | Operativo (tuyo) |

### B. Duelen a 6-12 MESES (roadmap con fecha dura)

| # | Falencia | Detalle | Esfuerzo |
|---|---|---|---|
| B1 | **Ledger FIFO: replay desde génesis** — carga TODA `inventory_movements` (sin corte) + acumula draws de TODAS las ventas históricas en memoria, sincrónico en el event loop que cobra. A ~150-250k movements (~6-9 meses) molesta; a ~500k (~12-18) es OOM en Railway chico y freeze del POS cada vez que el dueño abre un reporte. **No se arregla purgando** (el ledger es la verdad del FIFO): necesita snapshot/corte periódico (ej. cierre mensual del ledger + replay incremental). Es EL problema estructural del sistema | `cogs.service.ts` + `run-ledger.ts` | **Alto** (arquitectura; agendar antes del mes 9) |
| B2 | `audit_log` sin retención (~1.2M filas/año) — presión de disco, no de CPU | — | Bajo (cron de purga >12-18 meses) |
| B3 | UI sin red de regresión: 0 tests de componentes/hooks + Playwright fuera de CI. Una rotura del modal de cobro llegaría a prod sin que nada la detecte | Informe testing §3 y §6 | **M** (Playwright en CI + tests de CheckoutModal/split/cola offline) |
| B4 | Adapters (Kapso, R2) y WS `/ws/pos` sin contract tests — un cambio de contrato del proveedor no lo detecta nadie | — | S-M |
| B5 | No se puede abrir caja offline (decisión B.4b documentada): si el internet está caído ANTES de abrir el turno, el mostrador no vende. Reconfirmar como riesgo aceptado o cerrar | `features/offline` | M (si se decide cerrar) |

### C. Deuda consciente a 2 AÑOS (no bloquea, no olvidar)

1. **Single-tenant irreversible barato**: `BusinessConfig` singleton, `receipt_seq` global, caja única global, cero `locationId`. Un segundo local = migración + reescritura de shifts. Si es plausible, decidirlo ANTES de acumular 2 años de datos.
2. **3 helpers de retry de tx divergentes** (sales, shifts, stock-counts) sin abstracción en `common/` ni matriz de decisión "cuándo Serializable vs advisory lock" — el próximo módulo crea el 4º por copy-paste.
3. **CHECKs/triggers/secuencia invisibles a Prisma** (21 migraciones con SQL crudo que `schema.prisma` no refleja) — el drift ya ocurrió una vez; un dev+IA editando el schema no ve las invariantes.
4. **Utils duplicados en 4 frontends** (`uuid`, `errors`, `api-client`) — divergirán.
5. **`payment_pocket` legacy vs `cash_amount/bank_amount`** — doble fuente de verdad del bolsillo; saldar con migración.
6. **`onDelete: Cascade` de nómina hacia User** — un hard-delete de usuario evapora pagos con comprobante; debería ser Restrict.
7. **`paid_days` como JSON array** en pagos de nómina — estado activo consultable sin constraint ni índice; a tabla hija.
8. `sales.service.ts` 1.397 líneas con `create()` de ~240 — el archivo que más cambia es el más caro de razonar.
9. Sin capa i18n (aceptable para el negocio; documentado).

---

## Lo que está genuinamente BIEN (consenso de los 5 revisores)

- **Idempotencia end-to-end del cobro** (online y offline): UUID local + unique en DB + catch P2002 + tx serializable con retry. "Lo más difícil de un POS offline, y está bien".
- **Ledger contable inmutable de verdad** (triggers insert-only, correcciones por compensación) + polimorfismo XOR sin huecos + cero Float en dinero.
- **e2e con asserts de PLATA contra la DB** (no status 200): expectedCash exacto, arqueo por método, reconciliación por parte, concurrencia real con `Promise.all` + `app.listen(0)`.
- **Grafo de dependencias casi acíclico** (1 forwardRef en 31 controllers) y patrón consistente entre módulos viejos y nuevos — un dev que aprende un módulo entiende los 31.
- **Backup verificado, no ilusorio** (falla ruidosamente si el dump trae <10 tablas) + modo offline con Web Locks, backoff y misma función pura de disponibilidad que el backend.
- **Frontends magros**: cero librerías pesadas de cliente, polling visibility-aware sin solape, POS con su lógica de plata extraída a `lib/` puro y testeada.

---

## Plan recomendado (en orden)

1. **Pre-lanzamiento (1-2 días de trabajo):** A1 + A2 + A4 + A5 + A6 (código) · A3 (cron de reintento) · luego los pendientes operativos ya listados (sandbox Kapso, secrets backup, UptimeRobot — que ahora sí detectará DB caída gracias a A1, smoke con hardware).
2. **Primer sprint post-lanzamiento:** B3 (Playwright en CI) + B4 (contract tests) + decidir B5.
3. **Con fecha dura antes del mes 9:** B1 (snapshot del ledger FIFO) — trabajo de arquitectura, no parche.
4. **Backlog de deuda 2 años:** C1-C8, priorizando C1 (decisión multi-local) y C3 (documentar DDL invisible) porque son los que muerden sin avisar.
