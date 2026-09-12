# Auditoría profunda de producción — aritmética financiera, ventas e inventario (2026-09-11)

Solo lectura sobre la base de prod (volcado a las 00:02 UTC del 12-sep: 2.943 movimientos,
100 ventas, 9 cortesías, 34 facturas, 254 conteos) + pruebas de aceptación en QA.
Herramientas: `scratchpad/auditoria-prod.js` (replay con el MISMO motor `packages/domain/dist`),
`scripts/auditoria-costos-fifo.mjs` (QA, 57 comprobaciones), leyes SQL (36 consultas).

## 1. Veredicto

**La aritmética y la lógica del motor están sanas.** Todas las leyes verificables pasaron:
ventas, pagos, recibos, turnos, facturas, producción, conteos, FIFO (completo = incremental),
estado del mes (mi réplica reproduce al peso lo que la pantalla mostró esta mañana:
ingresos 4.637.000 · COGS 1.707.379 · cortesías 78.454 · neto −7.325.568 · base 9.953.800).

**Las "incongruencias" que ve el dueño tienen cuatro causas concretas, ninguna es un
error de cálculo**: (a) lotes SIN precio anteriores a la Fase 2 (65 entradas), (b) cinco
errores de captura de datos (unidad de factura, una receta con 80 tenedores, costos de
stock inicial), (c) recetas editadas sin rastro, y (d) cuatro pantallas que muestran el
número correcto con el rótulo equivocado. Detalle abajo, con cifras.

## 2. Lo que se verificó y cuadra (para no re-auditar)

| Ley | Resultado |
|---|---|
| 184 líneas: total = subtotal − descuento; subtotal = qty × precio | 0 errores |
| 97 ventas: subtotal = Σ líneas; descuento = Σ líneas + pedido; total = subtotal − desc + envío | 0 errores |
| 96 cobradas: Σ pagos = total; recibido ≥ monto; resumen de método coherente; vueltos solo en efectivo | 0 errores |
| Estados: PAGADO con turno/cajero/fecha; VOID con motivo; bitácora de estado sincronizada | 0 errores |
| Recibos 1..97 sin huecos ni repetidos | ✓ |
| 8 turnos cerrados: esperado = apertura + efectivo neto de envío + entradas − salidas (recalculado) | 8/8 iguales |
| Arqueo digital: esperado por método recalculado | 8/8 iguales |
| Ventas dentro de la ventana de su turno | ✓ |
| 34 facturas: total = Σ ítems + flete; pago = efectivo + cuenta; 99 ítems con movimiento; anuladas revertidas exactas | ✓ (1 ítem con factor distinto: Perejil, ver §3) |
| VOID neteado a 0 en inventario; toda venta PAGADA con consumo; movimientos delta ≠ 0 y XOR | ✓ |
| 114 conteos aprobados: ajuste = diferencia; 254 conteos: "esperado" mostrado = Σ movimientos previos | ✓ |
| Pagos de fijos/nómina/compromisos: efectivo + cuenta = monto | ✓ |
| Catálogo: precios > 0, combos con componentes, preparados con receta, factores > 0, mermas en [0,1) | ✓ |
| 77 ventas (las que no tuvieron receta editada después): movimientos = receta × cantidad, con tamaño, extras y combos | ✓ |
| 9 cortesías: movimientos = receta × cantidad | ✓ |
| 24 tandas de producción: consumo = N/yield × receta (4 de Papas fritas difieren solo porque su receta se editó hoy 23:04) | ✓ |
| Conservación: unidades restantes del motor = Σ movimientos, 79 stockables | ✓ |
| Replay incremental (snapshot de prod) = replay completo; COGS de sept idéntico | ✓ |
| Estado de sept: neto = MB − fijos − únicos − cortesías − reembolsos − merma − faltantes − fletes − compromisos; base = fijos + únicos + compromisos; equilibrios × margen = base | ✓ |
| Nómina: 3 DAILY × 26 días (sept 2026 sin los 4 lunes) = 6.890.000 | ✓ |
| Costos fijos: pagado cuando hay pago (Aceite, Aseo, Suscripción), configurado y "estimado" si no (Arriendo, Servicios, Software, Internet) | ✓ |
| Queso mozarella: 13 líneas vendidas ↔ 13 movimientos de venta; saldo por día concilia con los tres conteos (3.038 el 7, 2.135 el 11) | ✓ |
| Mermas: 8 en prod, todas restan stock y están valorizadas en el P&G ($29.351) | ✓ |

Estado de septiembre recomputado al cierre del volcado (98 ventas): ingresos 4.810.000 ·
COGS 1.776.786 (63,1 %) · cortesías 118.032 · merma 29.351 · faltantes 279.292 · fletes
70.000 · fijos 9.715.000 · únicos 238.800 · neto −7.417.261 · base 9.953.800 · equilibrio
realizado 18.875.240 (contribución 52,7 %) · meta de la carta 16.112.763 (61,8 %, cobertura 29,9 %).

## 3. Hallazgos de DATOS en prod (los que mueven cifras)

### 3.1 Lotes sin precio anteriores a la Fase 2 — la causa #1 del "⚠" en toda la tabla de productos
44 sobrantes de conteo + 21 ajustes manuales entraron sin costo antes de hoy. Todo lo que
sale de esos lotes cuenta como "sin costo" (no suma, no es $0 disfrazado: por eso el ⚠).
- Inventario actual sin valorizar: **7.481 u ≈ $92.427** de reposición (Cebolla caramelizada 1.390 u,
  Salsa de tomate 700 u, Tender crudo 450 u, Tapa recipiente 17 u, Vinagre 2.300 u…).
- COGS de septiembre no valorizado: **≈ $32.531** (Tapa recipiente 41 u = $17.220, Marinado 909 u = $5.902,
  Paprika ahumada 108 u = $3.780, Tocineta premium 125 u, Pan brioche 1 u…).
- Merma no valorizada: Tocineta premium **375 u ≈ $8.813** (el P&G muestra la merma como exacta: ver §5.3).
- Cortesías: por eso el FIFO queda por debajo del "guardado" (Marinado 100 u, Tapa recipiente, Pan brioche).
La Fase 2 (hoy) evita lotes nuevos a null; los viejos siguen ahí hasta consumirse. Corregirlos
es la misma cirugía del 9-sep (pares INSERT con fecha del original) y requiere aprobación.

### 3.2 Facturas con la unidad equivocada — el sistema multiplicó por el factor de la ficha
10 líneas de factura llevan una unidad distinta a la de compra de la ficha; 3 hicieron daño:
- **Tortilla de harina**: "12 Unidad × $1.500" (ficha: Paquete × 12) → entraron **144 u a $125**.
  El dueño quitó 132 a mano, pero las 12 que quedaron siguen a $125 y ya se vendieron: los
  primeros 12 burros llevan tortilla a $125 en vez de $1.500 (COGS de sept subestimado ≈ $16.500).
  Es la razón por la que Burros muestra "real" $10.953 < "hoy" $12.285.
- **Tenedor**: "300 Unidad × $52" (ficha: Paquete × 100) → **30.000 u a $0,52**. Se corrigió el stock a
  mano, pero la ficha conservó `lastUnitCost = 52/paquete` = **$0,52 por tenedor** ("costo hoy" de
  todos los platos subestima ≈ $40 por tenedor).
- **Perejil**: 0,195 kg con factor 1 → 0,195 u a $8.000/u. Corregido a mano (el lote malo se consumió con
  la corrección, sin efecto en COGS).
El aviso ámbar de unidad ≠ ficha no frena. Recomendación en §6.

### 3.3 Receta con cantidad absurda
`Mac & Cheese · Mixto` tiene **Tenedor 80** (más 1 de la base = 81 por plato). Dos ventas Mixto
consumieron 162 tenedores (≈ $6.480 al FIFO de $40). Es lo que hace que Mac & Cheese sea el único
producto con "real" ($11.651) por encima de "hoy". Casi seguro un error de tecleo.

### 3.4 Costos del stock inicial (2-sep) distintos a la receta
El dueño cargó subproductos e insumos iniciales con un costo propio: Coleslaw $25/u (receta $9,56),
Cebolla caramelizada $5 (receta $10,26), Macarrón cocido $6 ($4,03), Miel ahumada $25 ($19,76),
Pechuga de pollo cruda $2.000 (compras $3.975). FIFO los consume primero: mientras duren, "real" ≠
"hoy". Es correcto, no un bug — pero explica p. ej. la cortesía Mac & Cheese: FIFO 9.978 vs guardado 11.501
(la pechuga salió del lote de $2.000).

### 3.5 Recetas reescritas sin rastro
Las 13 recetas de producto se reescribieron el 5-sep 21:47–21:54 (se agregaron bolsas, papel
aluminio, cambió papas fritas 380→560 g…) y Papas fritas hoy 23:04. `RECIPE_UPDATED` existe en el
enum pero **nunca se registra** (0 filas en la bitácora; `RecipesService` no audita) y guardar
una receta recrea sus aristas (no hay historial). 22 ventas del 2 al 4 de sep "no cuadran" con la
receta de hoy solo por eso: el consumo usó la receta vigente al cobrar, como debe ser.

### 3.6 Caja: descuadres que no son del sistema
- **4-sep**: el cajero registró salidas de $150.000 (efectivo) y $79.000 (transferencia) "por
  domicilios". El esperado ya descuenta el domicilio (§7.v30), así que esas salidas lo restan dos
  veces → descuadres de +$140.000 y +$88.000 que no existen.
- **5/6/8/9-sep**: efectivo corto y transferencia sobrante por montos casi iguales (−11k/+14k,
  −36k/+36k, −16k/+16k, −43k/+41k): ventas cobradas por transferencia registradas como efectivo
  (o al revés). Los traspasos Efectivo→Cuenta de tesorería (6k, 22k, 16k, 41k) parecen compensarlo.
  La herramienta correcta es "Cambiar pago" (`PATCH /sales/:id/payment`) antes de cerrar.
  Las 10 alertas `SHIFT_DISCREPANCY_DETECTED` sí salieron.

## 4. Los tres costos de un plato — qué es cada número (verificado en QA, 55/57)
- **Costo hoy / u** (ficha, tabla de productos, "guardado" de la cortesía): receta × ÚLTIMO precio de
  compra de cada insumo. Para un producto con variantes la tabla muestra grande el de la receta
  BASE (Burros $4.819, Mac & Cheese $5.590), que es un plato que no existe; las variantes van en chico.
- **Costo real / u** (tabla de productos): COGS FIFO de lo vendido en 30 días ÷ unidades, ponderado por
  las variantes que de verdad se vendieron (por eso Burros "real" $10.953 se parece a las variantes
  $11.638–13.195 y no a la base $4.819). ⚠ = parte salió de lotes sin precio y no suma.
- **Cortesía**: `costAmount` se congela al crear (= costo hoy de ese momento); la lista y el P&G
  muestran el FIFO real. Con un solo lote al último precio los tres coinciden (QA: 8.300 = 8.300 = 8.300);
  cuando sube el precio de compra, "guardado" se mueve a 10.300 y FIFO sigue en 8.300 hasta agotar el
  lote viejo. Mostrar los dos en la misma fila es lo que se lee como contradicción.

## 5. Hallazgos de LÓGICA / PANTALLA (código)
1. **Editar receta no audita** (§3.5). Falta `RECIPE_UPDATED` con antes/después y su etiqueta en la bitácora.
2. **Movimientos rotula por tipo, no por origen**: una cortesía, un sobrante/faltante de conteo o la
   reversa de una factura se leen como "Ajuste manual" (`MANUAL_ADJUSTMENT`); solo la nota lo dice.
   Es exactamente "la cortesía se ve diferente" que reportó el dueño con el queso mozarella.
3. **El P&G no marca lo desconocido en merma ni faltantes**: `wasteCostEstimated`/`shrinkageCostEstimated`
   solo miran lo ESTIMADO; las unidades SIN costo (Tocineta premium 375 u) dejan la línea como exacta.
   Cortesías sí tiene `cortesiasCostPartial`. Y en QA: una merma 100 % sin costo sale en "Uso y mermas"
   como **$0 con "~"** y no cuenta en "sin valorizar" (2 comprobaciones en rojo).
4. **Tabla de productos**: el número grande de un producto con variantes es el de la base (§4).
5. **Panel de cortesías** muestra FIFO y "guardado" lado a lado sin explicar cuál manda.
6. **Factura con unidad ≠ ficha** solo avisa en ámbar (§3.2 lo demuestra tres veces).
7. **Corregir un lote a mano no corrige la ficha**: `lastUnitCost` del Tenedor sigue en $0,52.
8. Sin control de cantidades absurdas en recetas (80 tenedores por plato).

## 6. Recomendaciones (en orden)
Datos (con aprobación del dueño): (a) valorizar los 65 lotes a null con pares INSERT fechados
(mismo método del 9-sep); (b) corregir `Mac & Cheese · Mixto` (Tenedor 80 → 1 o lo que sea);
(c) fijar `lastUnitCost` del Tenedor; (d) reclasificar los pagos de los turnos 5/6/8/9 y quitar las
dos salidas del 4-sep.
Código (probar en QA, luego prod): 1) auditar recetas con antes/después; 2) etiqueta por origen
en movimientos; 3) `partial` para merma y faltantes en el P&G + "sin valorizar" en uso; 4) tabla de
productos: costo principal = el ponderado por variantes o el rango; 5) cortesía: un solo costo
(FIFO) con el estimado como nota; 6) confirmación dura cuando la unidad de la factura ≠ unidad de
compra y la cantidad parece de unidades; 7) aviso al guardar una receta con > N unidades de un
insumo que se compra por unidad.

## 7. Cómo repetirlo
```bash
# prod (solo lectura): volcados en el scratchpad + node scratchpad/auditoria-prod.js [CUTOFF=ISO]
# QA:
API_URL=https://api-qa-5833.up.railway.app AUDITOR_EMAIL=auditor-financiero@qa.tercos.co AUDITOR_PASSWORD=… \
node scripts/auditoria-costos-fifo.mjs
```

## 8. Cierre (2026-09-12)
- **Bloque A (dueño):** receta `Mac & Cheese · Mixto` corregida; ficha del Tenedor en Unidad/Unidad a $52 (verificado).
- **Bloque B aplicado en prod con autorización del dueño:** `scripts/fix-lotes-sin-costo-2026-09-12.sql`
  (88 INSERT en una transacción, idempotentes `fix-lotes:rev|cost:<id>`, cada par a +1/+2 ms del original,
  `unit_cost_estimated = true`). Regla de costo: último costo conocido en ese instante del replay; si difiere
  más de 3× de la referencia de hoy (ficha o receta), manda la referencia (Servilleta $5.000 → $10, Tenedor
  $0,52 → $52). Tres sobrantes no necesitaban nada (solo devolvían faltantes previos). Ensayado con ROLLBACK y
  verificado con volcado fresco: 0 unidades sin costo en ventas, merma, cortesías e inventario; 15/15
  controles del motor. Septiembre: COGS 1.776.786 → 1.815.686 (62,3 %), merma 29.351 → 38.164, cortesías
  118.032 → 123.257, neto −7.470.303, inventario valorizado $2.377.170.
- **Decisión del dueño sobre domicilios:** no tocar la venta. Botón en Caja "Domicilio pagado del cajón" que
  registre SOLO el traspaso Efectivo → Cuenta en tesorería (lo que hoy hace a mano), sin tocar movimientos de
  caja ni ventas. Entra al bloque C como primer punto.

## 9. Auditoría de los ajustes manuales del dueño y de los precios (2026-09-12)

### 9.1 Tus 18 ajustes de ayer: limpios
Ocho pares `+N` (al costo estimado por la Fase 2) seguidos de `−N` para deshacerlos. Efecto neto sobre
el valor del inventario: **+$33** (residuo de las ventas que ocurrieron entre el `+` y el `−`, que
consumieron una mezcla de lotes ligeramente distinta). El par del Tenedor (`−82` / `+82 @ $52`) sube
$1.695: es exactamente la corrección de precio, no un error. **Neto de los 18: +$1.719.**

### 9.2 Precios de Servilleta y Tenedor: correctos
| Insumo | Ficha | Por unidad | Factura que lo respalda | Lotes vivos |
|---|---|---|---|---|
| Tenedor | Unidad / Unidad, factor 1, $52 | **$52** | "tenedor 300 Unidad × $52 = $15.600" | 82 u @ $52 = $4.264 |
| Servilleta | Paquete / unidad, factor 500, $5.000 | **$10** | "Servilleta 1 Unidad × $5.000" (= 1 paquete de 500) | 152 u @ $10 = $1.520 |

### 9.3 Las cargas iniciales del 2-sep a precio de PAQUETE nunca tocaron el resultado
Trece entradas nacieron con el precio del paquete en vez del precio por unidad (Carne hamburguesa
$33.200/g, Miel ahumada $25.000/g, Papas fritas $3.400/g, Coleslaw $25.000/u, Pepinillo $4.500/u,
Macarrón cocido $6.000/u, Cebolla caramelizada $5.000/u, Harina compuesta $6.000/u, Marinado $7.000/u,
Macarrones $5.000/g, Papel parafinado $35/cm, Servilleta $5.000/u, Perejil $8.000/g). En valor
sumaban **$285 millones** de inventario inexistente.

**Las trece se corrigieron entre 1 y 2 horas después, con un ajuste negativo y otro positivo al precio
correcto, y la primera venta fue recién a las 19:09 del 2-sep.** Verificado movimiento por movimiento:
ninguna venta, producción, cortesía ni merma consumió un solo gramo de esos lotes. El único consumo
anterior a las correcciones fue la merma de Sal (−360 g), cuyo lote venía de una compra a $3/g y está
bien costeada. **Impacto en el P&G: cero.**

### 9.4 Lo que el conteo de ayer dejó en los libros
Fue un conteo completo (79 ítems). Los faltantes de septiembre quedaron en **$279.396** y los explican
pocos ítems: Papas fritas −12.183 g ($49.369), Tocineta recorte −1.480 g ($31.551), Queso cheddar
bloque −908 g ($28.939), Seven up 250ml −30 u ($25.000), Salsa barbacoa −1.244 g ($18.447), Tortilla
−12 u ($17.800), Manzana 400ml −7 u ($14.583). Los sobrantes entraron al costo estimado; el mayor con
diferencia es **Papel aluminio +49.700 cm = $155.313** (se contaron 50.000 cm ≈ 500 m contra 300 cm en
libros). Conviene confirmar que de verdad hay ~500 metros de aluminio: es el ítem que más peso agrega
al inventario valorizado.

### 9.5 Recetas que conviene revisar (no son errores del sistema)
- **Servilleta**: 6 unidades en nueve platos, pero **1** en Mac & Cheese y en Triple Smash.
- **Tenedor**: 1 por plato, pero **3** en Combo 1 y Combo 2.
Ninguna rompe cuentas; solo hacen que el costo de esos platos no sea comparable.
