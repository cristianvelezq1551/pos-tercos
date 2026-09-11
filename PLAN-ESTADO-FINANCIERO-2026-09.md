# Plan de ajustes — Estado financiero (2026-09-11)

> Origen: el dueño reportó que el estado financiero "está mal" con el caso del
> aceite (se compra por bidones, se cambia cada 7 a 10 días) y la publicidad
> (recurrente, monto distinto cada mes). Este documento sale de una auditoría
> completa del módulo y de correr el motor FIFO del repo sobre los datos
> REALES de prod (solo lectura, 2026-09-11). Es un plan, no un cambio: nada
> de lo de abajo está implementado.
>
> Principio rector: **cada fase se puede desplegar sola, tiene su prueba de
> que no cambió nada fuera de su alcance, y se verifica operando la app en
> prod**. El orden es por confianza: primero lo que corrige números que hoy
> ya están mal, después lo que agrega capacidad.

---

## 0. Diagnóstico (lo que hay que arreglar y por qué)

### 0.1 Lo que está bien (no se toca)
Devengo por consumo, FIFO lote por lote, envío fuera de todo ingreso, flete
aparte del COGS, nómina devengada por días, compromisos al pagarse, la
identidad `neto = margen bruto − fijos − únicos − pérdidas`. Verificado contra
prod y cubierto por `financial-reports`, `devengado-vs-pagado`,
`math-invariants` y la simulación financiera.

### 0.2 Los cuatro huecos

| # | Hueco | Efecto hoy en prod | Fase |
|---|---|---|---|
| A | El P&G muestra el **monto configurado** del costo fijo, no lo pagado. Sin historial de montos: editar la ficha reescribe todos los meses. La guía dice tres veces lo contrario. | "Servicios" $900.000 redondo; el recibo real nunca va a llegar al estado. | 1 |
| B | Lo que entra a inventario **sin precio** (sobrante de conteo, ajuste manual +) se vende a **$0**. Solo deja un aviso amarillo cuyo texto culpa a "facturas sin cargar". | COGS de septiembre corto en **~$179.000** (9.965 unidades a $0: Carne hamburguesa 3.500 g, Papas fritas 3.661 g, Marinado 1.909 g). Hoy hay **16.933 unidades sin valor** en stock (~$302.000) que también van a salir a $0. | 2 |
| C | Un gasto **recurrente de monto variable** (publicidad) no tiene cajón: o es "único" (fuera del equilibrio) o es "mensual" con un solo monto. Un costo fijo admite **un** pago por período. | Publicidad no se puede registrar de forma que entre al resultado con su monto real y al equilibrio como recurrente. | 3 |
| D | Un **insumo que se gasta por tiempo** (aceite, aseo) no tiene cajón: por factura queda en inventario para siempre; como "gasto único" cae entero en el mes de la compra y queda fuera del equilibrio. | "Aceite 20 lt" $170.000 e "Implementos de aseo" $68.800 cargados como gasto único. El mes de compra se ve mal, el siguiente bien; el equilibrio y "de cada $100 te quedan" están inflados. | 4 |

Además, dato operativo (no es código): los **faltantes de conteo** ya son la
pérdida más grande de septiembre ($123.583 contra $29.351 de merma) y los dos
mayores parecen errores de conteo (Seven up 250ml: 30 compradas, 0 vendidas,
conteo en 0 → $25.000; Tocineta recorte −1.480 g → $29.400). Conviene
revisarlos antes de leer el neto del mes.

### 0.4 Qué son "los datos del 9 de septiembre"
Entre las 4:41 y las 6:10 am del 2026-09-09 (hora local), `admin@tercos.co`
registró **29 ajustes manuales sin costo** desde Existencias → Ajustar, en
una sesión de "cuadre" de inventario (el mismo rato aprobó conteos). Los
positivos crearon lotes a $0: Carne hamburguesa +6.870 g (y −7.060 g cuatro
minutos después), Papas fritas +4.021 g, Mayonesa +1.510 g, Macarrón cocido
+1.280 g, Salsa BigMac +1.099 g, Leche +1.000 ml, Crema agria +1.000 g,
Marinado +1.000 g, Queso cheddar bloque +907 g, Limón +303 g, Paprika +153 g.
Todo lo que se vendió después de esas entradas salió de esos lotes a $0:
9.965 unidades hasta el 11-09, ~$179.000 de COGS que el estado no cobra, y
16.933 unidades en stock que todavía van a salir a $0. "Corregir los datos"
(2d) = insertar, con fecha del 09-09 y antes de las ventas de ese día, un
par compensatorio por ítem (−N sin costo, +N con el costo conocido).

### 0.3 Decisiones de diseño (cerradas por el dueño en esta conversación)
- **El aceite NO va en recetas**: no se consume por porción sino por cambio
  cada 7 a 10 días. Tampoco se registra como merma: mezclaría un consumo
  normal con una pérdida y ensuciaría el margen de contribución.
- **La publicidad SÍ entra al estado financiero** cada mes con su monto real,
  aunque varíe, y cuenta como recurrente para el equilibrio.
- **Regla transversal**: cada línea de costo del P&G muestra el monto REAL
  cuando se conoce y un ESTIMADO marcado como tal cuando no. Nunca $0 por
  omisión (misma regla que ya rige el COGS, §7.v32).

---

## Fase 1 — El P&G dice lo que se pagó cuando ya se pagó ✅ (rama `fix/pnl-montos-pagados`, 2026-09-11)

**Objetivo.** Que "Servicios" muestre $1.150.000 el mes que la luz llegó en
eso, y que editar el monto de la ficha NO reescriba meses ya pagados.

**Cambio.**
- `FixedCostsService.getEffectiveForWindow(windowStart, windowEnd, period)`
  recibe además `(year, month1)` del estado y hace UNA consulta a
  `fixed_cost_payments` por `(fixedCostId, periodYear, periodMonth)`:
  - MONTHLY: `paid.amount` si hay pago del período, si no `amount` marcado
    `isEstimated: true`.
  - ANNUAL: el pago vive en enero (`periodMonth = 1`); línea del mes =
    `(paid ? paid.amount : amount) / 12`.
  - ONE_TIME: su único período es el mes de `startedAt`; `paid.amount` si
    existe, si no `amount` estimado.
- `FixedCostLine` (types) gana `isEstimated: boolean`. `PnlCard` muestra
  "estimado" junto al monto, con el mismo tono que ya usa "COGS estimado".
- El prompt del análisis IA recibe la marca para que no lea un estimado
  como dato.
- **Guía**: corregir `flows/costo-fijo.ts` (tres frases dicen "solo entra lo
  pagado"; lo cierto es "entra el mes que corresponde; con el monto pagado si
  ya se pagó, estimado si no") y agregar la fila "Faltantes" a la tabla del
  capítulo `estado` de `finanzas.ts`, que hoy no la tiene.

**Por qué es seguro.**
- No toca esquema ni motor de costos. Solo cambia el número cuando existe un
  pago cuyo monto difiere del configurado; para todo lo demás el resultado es
  idéntico (probarlo: e2e existente `un costo fijo recurrente baja el neto`
  sigue verde sin tocarlo).
- La clave del período es la MISMA que usa `markPaid` y el panel de
  pendientes: `(year, month1)` calendario. No se deriva de `paidAt`, así que
  la ventana de "mes del negocio" con corte ≠ 1 no interfiere.
- Tesorería y Pagos ya leían el pago: no cambian.

**Pruebas.**
- e2e nuevo en `financial-reports`: marcar pagado un MONTHLY con otro monto
  cambia SOLO ese mes; el mes siguiente sigue en el configurado y marcado
  estimado; ANNUAL pagado en enero por otro monto reparte `/12`; editar el
  monto de la ficha no altera el mes ya pagado.
- Unit admin: `PnlCard` pinta "estimado" cuando `isEstimated`.
- `devengado-vs-pagado` intacto (sus leyes usan montos iguales).

**Riesgo residual.** Ninguno de datos. Copy: revisar que "estimado" no se
confunda con "COGS estimado" (rótulos distintos: "monto estimado, sin pago
registrado").

---

## Fase 2 — Nada entra al inventario a $0

**Objetivo.** Que un sobrante de conteo o una entrada manual sin precio se
valore al último costo conocido, marcado estimado, en vez de venderse gratis.
Y que un subproducto no se pueda "aparecer" sin costo.

**Cambio (en dos capas, para no tocar el motor más de lo necesario).**

*2a. En la ESCRITURA del movimiento (sin tocar el motor):*
- `StockCountsService` (aprobación de conteo con `difference > 0`) e
  `InventoryService.createMovement` (ajuste manual con `delta > 0` y
  `unitCost` vacío) rellenan `unit_cost` con el último costo conocido:
  - Insumo / reventa: `lastUnitCost / conversionFactor` (unidad de stock,
    mismo criterio que `loadFallbackUnitCost` del ledger).
  - Subproducto: costo teórico de su receta por unidad (vía `RecipesService`,
    que ya lo calcula para la ficha), porque no tiene precio de compra.
  - Sin ningún precio disponible: queda `null` como hoy, y la respuesta lo
    dice ("entró sin valor: no hay precio con qué estimarlo").
- El motor ya honra `unit_cost` en entradas; para un sobrante de conteo,
  primero devuelve los faltantes previos a su costo original y solo el
  remanente usa el `unit_cost` escrito (verificado en `run-ledger.ts`, rama
  `stock_count` con `delta > 0`). **No cambia ni una línea del motor.**

*2b. La marca de "estimado" viaja hasta el P&G (cambio ADITIVO al motor):*
- Columna nueva `inventory_movements.unit_cost_estimated boolean NOT NULL
  DEFAULT false` (migración aditiva, O(1)).
- `Lot` gana `estimated?: boolean`; `consumeFifo` suma `take` a
  `estimatedQty` cuando el lote es estimado. `LedgerSeed.lots` lo serializa;
  un snapshot viejo hidrata `false`.
- Efecto: el P&G muestra "COGS estimado" (aviso que ya existe) en vez de
  "COGS subestimado", y el texto del aviso deja de culpar a las facturas
  cuando la causa es un conteo o un ajuste.

*2c. Subproductos:*
- Ajuste manual POSITIVO de un subproducto sin costo → 400 con mensaje:
  "un subproducto entra por Producir, que le pone el costo de sus insumos".
  Con costo explícito se acepta (corrección deliberada).

*2d. Datos de prod (opcional, requiere aprobación del dueño):*
- Los 9.965 g/u vendidos a $0 en septiembre salieron de ajustes del 09-09
  sin costo. `inventory_movements` es insert-only y el motor lee `created_at`:
  la única corrección exacta es insertar, con fecha 2026-09-09 y por SQL,
  un par compensatorio por ítem (−N sin costo + N con costo) **antes** de las
  ventas de ese día. Es cirugía de datos: se hace con script revisado, en
  transacción, con conteo de filas antes y después, y se verifica que el
  ledger dé `cogsUnknownQty = 0` para septiembre. Si el dueño prefiere no
  tocar datos, se documenta que septiembre carga ~$179.000 de menos.
- El snapshot vigente corta el 2026-09-01: las filas del 09-09 caen en el
  replay incremental, no hay que reconstruir nada.

**Por qué es seguro.**
- 2a no cambia el motor: la prueba de oro de 300 historias queda
  byte-idéntica.
- 2b es aditivo: ninguna fila existente tiene la marca, así que la prueba de
  oro sigue idéntica; las 11 leyes de 20.000 historias se corren con
  `estimated` aleatorio en entradas para probar conservación.
- 2c solo bloquea un camino que hoy produce datos malos.

**Pruebas.**
- e2e `stock-counts`: un sobrante entra con costo y una venta posterior lo
  costea; sin precio disponible entra `null` y el P&G marca parcial.
- e2e `inventory`: ajuste + sin costo en insumo → costeado; en subproducto →
  400; con costo → aceptado.
- Domain: `estimatedQty` propagado desde lotes estimados; seed round-trip.
- e2e `financial-reports`: el aviso del P&G dice "estimado" y no
  "subestimado" cuando el origen es un conteo.

---

## Fase 3 — Gastos recurrentes de monto variable (publicidad)

**Objetivo.** Un costo "Publicidad" que cada mes pese con lo que realmente
se gastó (uno o varios pagos), que entre al equilibrio como recurrente, y que
no moleste como "pendiente" un mes en que no hubo publicidad.

**Cambio.**
- `FixedCostFrequency` gana `VARIABLE` (migración `ADD VALUE`, en su propio
  archivo: Postgres no permite usar el valor nuevo en la misma transacción,
  precedente en §7.v4).
- `fixed_cost_payments`: el índice único `(fixed_cost_id, period_year,
  period_month)` pasa a índice normal. **Para MONTHLY/ANNUAL/ONE_TIME el
  comportamiento no cambia**: `markPaid` busca el pago del período y lo
  reemplaza (hoy lo hace el `upsert`; pasa a `findFirst` + `update`/`create`
  en una transacción). Para VARIABLE siempre crea uno nuevo.
- Endpoint nuevo `DELETE /fixed-costs/payments/:paymentId` (anular un pago
  puntual). El `unmark` por período sigue existiendo para los otros tipos.
- P&G (sobre la Fase 1): línea VARIABLE = Σ pagos del período si hay al
  menos uno; si no, el `amount` de la ficha como **estimado**. Es recurrente:
  entra a `totalFixed` y al equilibrio con ese mismo número.
- Pendientes: VARIABLE **nunca** aparece como pendiente (no es una obligación
  con vencimiento). Tesorería ya suma pagos por `paidAt`: sin cambio.
- Admin: en el formulario, "Variable (cada mes distinto: publicidad)" con
  el hint "el monto es tu estimado mensual; lo que pesa es lo que registres
  pagado". La tarjeta del costo lista los pagos del mes con su suma.

**Por qué es seguro.**
- Quitar el índice único es lo único delicado. Se mitiga manteniendo la
  semántica "un pago por período" en código para los tipos existentes, y con
  un e2e que la fija (marcar dos veces reemplaza, no duplica).
- `getPendingPayments` enumera por frecuencia: VARIABLE simplemente no se
  enumera.

**Pruebas.**
- e2e `fixed-costs`: VARIABLE con 2 pagos en el mes → P&G suma los dos;
  mes sin pagos → estimado marcado; nunca en pendientes; anular uno de los
  dos deja el otro. MONTHLY marcado dos veces → un solo registro (regresión
  del índice).
- `devengado-vs-pagado`: ley nueva "un VARIABLE pesa en el mes del pago, con
  su monto".

---

## Fase 4 — Insumos de operación: el aceite se gasta cuando se cambia

**Objetivo.** El aceite y lo que se compra por bulto pero se gasta por tiempo
(aseo, gas) entra a inventario por factura como hoy, y sale al estado
financiero **cuando se usa**: el cocinero registra "cambié el aceite, 1
bidón" cada 7 a 10 días. Cada cambio pesa al costo FIFO real del bidón.

**Modelo.**
- `ingredients.is_operating_supply boolean NOT NULL DEFAULT false` +
  `ingredients.monthly_budget Decimal?` (estimado mensual, opcional, para el
  equilibrio). Migración aditiva.
- Un insumo de operación **no puede ir en recetas** (`setRecipe` /
  `setSizeRecipe` lo rechazan con mensaje; el editor no lo lista).
- Sigue entrando por **factura** (FIFO, precio por proveedor, alerta de
  stock bajo y lista de faltantes funcionan sin cambios: "quedan 2 bidones").
- **Consumo**: movimiento `MANUAL_ADJUSTMENT` con `delta < 0` y
  `source_type = 'operating_use'` (mismo mecanismo que la cortesía, que es
  `MANUAL_ADJUSTMENT` + `source_type = 'cortesia'`; no hace falta tocar el
  enum). Motivo obligatorio ("cambio de aceite freidora 1"). Foto opcional
  (reusa `evidence_key`).
- **Anulación**: `source_type = 'operating_use_reversal'` con `source_id` =
  id del consumo original, copia exacta del patrón `waste_reversal`
  (§7.v18): parcial acumulable, nunca más de lo consumido, devuelve las
  unidades a su costo original.
- **Motor** (`run-ledger.ts`, cambio aditivo): bucket `operating:
  LossEntry[]` + `operatingCostByMovement`, consumo con estimación del
  faltante (`DebtKind 'operating'`, regla §7.v32: nada cuesta cero) y
  reversa por draws. `LedgerSeed.operating` opcional (snapshots viejos sin
  él hidratan vacío, como pasó con `shrinkage`).
- **P&G**: línea nueva "− Insumos de operación (aceite, aseo…)" debajo del
  margen bruto, con marca estimado/parcial como las demás. `netResult` la
  resta. **NO entra al margen de contribución** (no escala con la venta):
  entra a la base fija del equilibrio como `operatingBase = Σ monthly_budget`
  de los insumos de operación que lo tengan, y para los que no, el consumo
  real del mes. `BreakEvenCard` lo nombra en "lo fijo".
- **Reporte de uso y mermas**: columna propia "consumo de operación" (hoy un
  `MANUAL_ADJUSTMENT` con `source_type` nuevo caería en "ajustes").
- **Cocina**: en el inventario, los insumos de operación muestran el botón
  "Registrar consumo" (además de merma, para un bidón que se dañó). En el
  hub `/cocina` del admin, pestaña de consumos con quién, cuándo y cuánto.
- **Guardas de rol**: registra `@KitchenAccess`; anula `@AdminAccess`.

**Conversión de lo que ya está en prod** (la hace el dueño desde la app, con
esta lista; no hay script):
1. Crear el insumo "Aceite" (compra: bidón 20 lt, stock: bidón, factor 1),
   marcado insumo de operación, presupuesto mensual 3 × precio.
2. Borrar el costo fijo "Aceite 20 lt" y su pago (tesorería devuelve
   $170.000 al bolsillo).
3. Registrar la factura del bidón con fecha 2026-09-01, pagada ese día del
   mismo bolsillo (tesorería vuelve a −$170.000: neto cero).
4. El cocinero registra el cambio cuando ocurra. Septiembre pasa de cargar
   $170.000 el día 1 a cargarlos el día del cambio.
5. "Implementos de aseo": decidir si es insumo de operación (se cuenta por
   unidades) o costo VARIABLE de la Fase 3 (se gasta al comprar). Para
   aseo, VARIABLE es más simple y suficiente.

**Por qué es seguro.**
- El motor solo reacciona a un `source_type` que **no existe en ninguna fila
  actual**: la prueba de oro de 300 historias tiene que quedar byte-idéntica
  (es la demostración de que nada viejo cambió, igual que en §7.v47).
- Las historias aleatorias del nightly ganan `operating_use` y su reversa;
  las 11 leyes (conservación, nada a $0, snapshot = replay) cubren el
  camino nuevo.
- Simulación financiera: ley nueva "un consumo de operación no toca COGS ni
  merma; baja el neto exactamente en el FIFO del bidón consumido; su
  anulación lo devuelve".

**Pruebas.**
- Domain: 6 a 8 casos de escenario (consumo con lote, sin lote → estimado y
  deuda que la factura salda, reversa total y parcial, reversa que cruza el
  corte → `needsFullReplay`).
- e2e nuevo `insumos-operacion`: guard de receta, consumo desde cocina,
  P&G con la línea y el neto, reporte de uso, anulación con 6 peticiones
  concurrentes (patrón de `waste-reversal`).
- Navegador (Playwright, cocina a 390 px): el botón mide ≥ 44 px y el flujo
  completo se registra.

---

## Fase 5 — Documentación y cierre
- `CLAUDE.md` §7.v68: las reglas nuevas (monto real vs estimado; nada entra
  a $0; VARIABLE; insumo de operación no va en recetas ni es merma).
- Guía: capítulo `finanzas` (tabla del estado con las líneas nuevas), flujo
  nuevo "Registrar el cambio de aceite" (audiencia cocina) y "Publicidad y
  gastos variables" (dueño); corregir `costo-fijo.ts`.
- Bitácora: etiquetas para las acciones nuevas (regla §3: nada de códigos
  crudos).
- Memoria del proyecto.

---

## Orden, dependencias y despliegue

| Orden | Fase | Depende de | Esquema | Toca el motor | Corrige números de hoy |
|---|---|---|---|---|---|
| 1 | Fase 1 | — | no | no | sí (montos reales) |
| 2 | Fase 2a + 2c | — | no | no | sí (entradas futuras) |
| 3 | Fase 2b | 2a | aditivo | aditivo | marca estimado |
| 4 | Fase 2d (datos) | 2a, aprobación | — | — | sí (septiembre) |
| 5 | Fase 3 | 1 | enum + índice | no | — |
| 6 | Fase 4 | 1, 2 | aditivo | aditivo | — |
| 7 | Fase 5 | todas | — | — | — |

Reglas de ejecución (todas ya aprendidas en este repo):
- Una rama y un PR por fase, con prefijo cubierto por el CI (`feat/`, `fix/`).
- Antes de tocar el motor (2b, 4): correr y commitear la prueba de oro con
  el código anterior; después del cambio tiene que seguir idéntica.
- Gates completos por fase: typecheck sin caché de turbo, lint, unit, e2e
  en base propia (`TEST_DATABASE_URL=…_test`), simulación con 20 semillas.
- Verificar **por la interfaz** en QA y en prod después de cada despliegue,
  no por la API (dos bugs de esta tanda solo aparecían operando la app).
- Ningún UPDATE/DELETE a `inventory_movements`; la corrección de datos (2d)
  es solo INSERT y solo con aprobación explícita.

## Decisiones del dueño (2026-09-11, segunda ronda)
1. **2d (datos del 09-09)**: pendiente de decidir; ver el detalle de qué son
   esos datos en la sección 0.4.
2. **Equilibrio**: usa el **presupuesto mensual configurado** del insumo de
   operación (meta estable). Si no está configurado, el consumo real del mes.
3. **Implementos de aseo** y todo lo que "se compra cada X tiempo y no se
   puede descontar por día": gasto **VARIABLE** (Fase 3), pesa al comprarse.
   Solo el aceite va como insumo de operación, porque su consumo sí tiene un
   evento claro (el cambio).
