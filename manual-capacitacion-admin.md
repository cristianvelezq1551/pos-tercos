# Manual de capacitación — Panel de Administración (POS Tercos)

> **Para quién es este documento:** capacitadores y personal administrativo (dueño, administrador). No requiere conocimientos técnicos. Explica *qué hace* cada parte del sistema, *por qué* funciona así y *cómo enseñarlo*.
>
> **Cómo está organizado:**
> - Parte 1 — La idea general (el modelo mental)
> - Parte 2 — Costos y ventas explicado en simple (lo más importante)
> - Parte 3 — Módulo por módulo, en detalle
> - Parte 4 — Roles y permisos (quién ve qué)
> - Parte 5 — Glosario
> - Parte 6 — Errores comunes y consejos para capacitar

---

## PARTE 1 — La idea general (el modelo mental)

Antes de tocar un botón, hay que entender **cómo "piensa" el sistema**. Todo gira alrededor de tres preguntas:

1. **¿Qué vendo?** → el **Catálogo** (productos, con sus recetas).
2. **¿Qué tengo y cuánto me costó?** → el **Inventario** (insumos, existencias, costos).
3. **¿Qué vendí y cuánto gané?** → las **Ventas** y los **Reportes**.

La cadena completa, contada como una historia:

> Compro **insumos** a un proveedor (pollo, pan, salsa) → los registro con una **factura** → eso aumenta mis **existencias** y guarda **cuánto me costaron** → con esos insumos preparo **productos** según una **receta** → el cajero **vende** un producto → el sistema **descuenta del inventario** exactamente los insumos que llevaba ese producto → al final del día sé **cuánto vendí, cuánto me costó de verdad y cuánto gané**.

La regla de oro para enseñar: **el sistema no adivina nada**. Cada número sale de algo que alguien registró (una compra, una venta, una merma). Si la información de entrada está mal, el número de salida estará mal. Por eso la disciplina al registrar es lo más importante.

### Los cuatro "objetos" del catálogo (clave para todo)

| Concepto | Qué es | Ejemplo | ¿Se vende solo? |
|---|---|---|---|
| **Insumo** | Materia prima que se compra y se consume | Pollo crudo, sal, pan, aceite | No |
| **Subproducto** | Algo que se **prepara** con insumos y se usa dentro de un producto | Salsa Nashville, masa fermentada | No |
| **Producto** | Lo que el cliente compra | Hamburguesa, combo, gaseosa | **Sí** |
| **Receta** | La "fórmula" que dice qué lleva un producto o subproducto | 1 hamburguesa = 150 g pollo + 1 pan + 30 g salsa | — |

> **Cómo explicarlo:** el insumo es el ingrediente crudo; el subproducto es una "preparación intermedia" (no se vende suelta, pero se usa en varios platos); el producto es lo que aparece en el menú. La receta los conecta.

### Un tipo especial de producto: la "reventa directa"

Algunos productos **se compran y se venden tal cual**, sin receta: una gaseosa en botella, un paquete de papas. A esos se les marca como **reventa directa**. El sistema los trata como insumo y producto a la vez: les lleva existencias y costo, pero no necesitan receta.

---

## PARTE 2 — Costos y ventas explicado en simple (lo más importante)

Esta es la parte que más cuesta y la que más valor da. Tómese su tiempo aquí.

### 2.1 Unidades: "compro en una, cocino en otra"

Casi siempre **se compra en una unidad y se cocina en otra**:

- Compro la sal por **bulto**, pero la receta la usa en **gramos**.
- Compro gaseosa por **caja**, pero la vendo por **unidad**.

Para que el sistema entienda eso, cada insumo tiene tres datos:

- **Unidad de compra** (cómo viene del proveedor): bulto, caja, kg.
- **Unidad de receta** (cómo lo usa la cocina): g, ml, unidad.
- **Factor de conversión** (cuántas unidades de receta hay en una de compra): *1 bulto = 1.000 g* → el factor es **1000**.

> **Cómo explicarlo:** "Si compras un bulto de sal de 1.000 gramos, el factor es 1000. Así el sistema sabe que cuando una receta usa 5 gramos, eso es 5/1000 del bulto."

### 2.2 Merma y rendimiento (lo que se pierde y lo que rinde)

- **Merma**: lo que se pierde al preparar (limpiar, recortar, evaporar). Si una porción usa **180 g netos** de pollo pero al limpiarlo se pierde **5%**, en realidad del inventario salen **~189 g**. El sistema descuenta la cantidad *real* (la "bruta"), no solo la que queda en el plato.
- **Rendimiento** (de un subproducto): cuántas **porciones** rinde una preparación. Si una olla de salsa rinde 7 porciones, el rendimiento es 7. Así el sistema reparte el costo de la olla entre las 7 porciones.

### 2.3 El inventario es un "libro contable" que no se borra

Cada cambio de existencias queda como un **movimiento**:

- **Compra** (entra stock, con su costo).
- **Venta** (sale stock al cobrar).
- **Merma** (se daña/bota).
- **Ajuste manual** (corrección de conteo).
- **Stock inicial** (la carga única al arrancar el sistema).

**Regla dura:** los movimientos **nunca se editan ni se borran**. Si hubo un error, se arregla con **otro movimiento** que lo compensa. Esto es a propósito: garantiza que el historial sea confiable y auditable (igual que en contabilidad, no se borra un asiento, se hace uno de ajuste).

> **Cómo explicarlo:** "El inventario es como la libreta del banco: no se tacha, se hace un movimiento nuevo que corrige."

### 2.4 Las dos formas de ver el costo (¡esto confunde, enséñelo bien!)

El sistema maneja **dos números de costo** y sirven para cosas distintas:

**A) "Último costo"** — el precio de la última compra.
- Dónde aparece: en el editor de recetas, en la ficha del producto, en la tabla de insumos, en el reporte "Productos".
- Para qué sirve: como **referencia rápida** ("¿más o menos cuánto me cuesta hoy esta hamburguesa?"). Cambia cada vez que confirmas una factura con un precio nuevo.
- Limitación: si el precio del pollo subió, este número salta de inmediato al precio nuevo, aunque todavía tengas pollo comprado barato.

**B) "Costo real FIFO"** — lo que *de verdad* costó lo que vendiste.
- Dónde aparece: en **Reportes → Costos y margen real** (solo el Dueño).
- Para qué sirve: para saber tu **ganancia real** y tu **estado de resultados**. Es el número financiero serio.

> **Cómo explicarlo:** "El 'último costo' es un estimado para el día a día. El 'costo real FIFO' es la verdad contable de cuánto te costó lo que vendiste."

### 2.5 ¿Qué es FIFO? (la parte estrella)

**FIFO** = *"lo primero que entra es lo primero que sale"* — igual que la leche en la nevera: usas primero la que vence antes.

Ejemplo concreto:
- Compras **10 kg de pollo a $8.000/kg** (lote viejo).
- Después compras **10 kg a $12.000/kg** (lote nuevo).
- Vendes platos que consumen 15 kg en total.

Con FIFO, el sistema usa **primero los 10 kg baratos** y luego 5 kg de los caros:
> Costo real = 10 kg × $8.000 + 5 kg × $12.000 = **$140.000**.

Y te quedan 5 kg a $12.000 ($60.000) en bodega. **Eso es exactamente lo que pasó en la vida real**, por eso es el método más fiel.

Como **los precios de venta son fijos**, lo único que cambia tu ganancia es el costo. FIFO te dice el costo verdadero → te dice tu **ganancia verdadera**.

### 2.6 Margen y ganancia

- **Ganancia (por producto)** = Precio de venta − Costo.
- **Margen %** = Ganancia ÷ Precio de venta × 100. ("De cada $100 que cobro, ¿cuántos son ganancia?")

Colores del margen en el sistema (escala unificada): **verde** sano (≥30%), **ámbar** ajustado (10–30%), **naranja** bajito (0–10%), **rojo** pérdida (<0%).

### 2.7 El flujo de una venta, paso a paso

1. El cajero arma el pedido y **cobra** → la venta queda **PAGADA**.
2. En ese momento el sistema **descuenta del inventario** los insumos (usando la receta + merma + FIFO).
3. La venta entra al **cierre de caja** del turno y a los **reportes**.
4. Si fue un pedido **web**, el cliente recibe avisos automáticos por WhatsApp (instrucciones de pago, "pago recibido", "listo para retirar").

> **Punto clave para enseñar:** el stock **NO se descuenta al armar el pedido, sino al COBRAR**. Un pedido sin pagar no afecta inventario.

---

## PARTE 3 — Módulo por módulo

> En cada módulo: **qué es**, **para qué sirve**, **cómo se usa**, **qué enseñar** y **quién puede entrar**.

### 3.1 Inicio (Dashboard)
- **Qué es:** la pantalla principal: el "pulso del día".
- **Qué muestra:** ingresos de hoy y comparación contra la semana pasada, número de ventas, pedidos web por confirmar, stock crítico, pedidos en cocina y listos, sugerencias de compra pendientes, y un **resumen del día hecho por IA**.
- **Para qué sirve:** echar un vistazo rápido al arrancar el día y al cerrar.
- **Quién entra:** Administrador y Dueño.

### 3.2 Catálogo

#### Insumos
- **Qué es:** la lista de materias primas que compras.
- **Datos clave por insumo:** nombre, unidad de compra, unidad de receta, factor de conversión, **mínimo de alerta** (cuándo avisar que está bajo) y **último costo** (con su fecha).
- **Qué enseñar:** cómo llenar las unidades y el factor (sección 2.1). Es el cimiento de todo el costeo: si el factor está mal, todos los costos quedan mal.

#### Subproductos
- **Qué es:** preparaciones intermedias (salsas, masas) que se usan dentro de los productos.
- **Datos clave:** **rendimiento** (porciones por preparación) y su **receta**. El sistema calcula y muestra el **costo por porción** del subproducto.
- **Qué enseñar:** la diferencia entre insumo, subproducto y producto (Parte 1).

#### Productos
- **Qué es:** lo que el cliente compra.
- **Tres tipos** (se elige al crear y **no se puede cambiar después**):
  1. **Con receta** (hamburguesa): lleva una fórmula de insumos/subproductos.
  2. **Reventa directa** (gaseosa): se compra y vende igual, sin receta.
  3. **Combo**: junta varios productos a un precio especial.
- **Variantes/tamaños:** un producto puede tener variantes (ej. proteína: carne o pollo); cada variante suma su propia receta encima de la base, y se le ve su **costo y margen** propio.
- **Datos clave:** precio de venta (lo que cobras), y un panel de **costo y margen** (referencia) que se recalcula mientras editas el precio.
- **Qué enseñar:** precio de venta ≠ costo. En productos con variantes, el "precio de referencia" no es lo que paga el cliente (paga el precio de cada variante).

#### Recetas
- **Qué es:** el editor donde defines qué lleva cada producto/subproducto.
- **Cómo se usa:** agregas insumos o subproductos, con su **cantidad neta** y su **% de merma**. El sistema muestra cuánto **se descuenta del stock** (la cantidad bruta) y el **costo estimado por unidad**, marcando con ámbar los insumos cuyo costo está desactualizado.
- **Qué enseñar:** la idea de neto vs. lo que se descuenta, y leer el costo estimado.

#### Promociones
- **Qué es:** descuentos configurables.
- **Cuatro tipos:** % de descuento, monto fijo de descuento, "lleva 2 paga 1" y descuento de combo.
- **Cómo se usa:** se eligen los productos, los días/horas y el rango de fechas. Los campos del tipo de promo no se editan después (para cambiarlos se desactiva y se crea otra).

### 3.3 Compras

#### Facturas
- **Qué es:** donde registras lo que le compras a los proveedores.
- **Cómo funciona (la magia):** subes una **foto de la factura**, una **IA lee** proveedor, productos, cantidades y precios, y arma un borrador. Tú revisas, corriges y **confirmas**.
- **Qué pasa al confirmar:** aumenta tus existencias, **guarda el costo de cada compra** (la base del FIFO), actualiza el "último costo" de cada insumo y deja registrado al proveedor.
- **Qué enseñar:** confirmar una factura es lo que "alimenta" el inventario y los costos. Si no se confirman las facturas, el sistema cree que no compraste nada.

#### Proveedores
- **Qué es:** la libreta de proveedores, con su historial de compras y precios.

#### Sugerencias inteligentes (IA)
- **Qué es:** el sistema revisa solo (cada hora) qué insumos están por debajo del mínimo y sugiere **qué comprar**. La IA puede explicar el porqué de cada sugerencia.
- **Cómo se usa:** revisas la lista, puedes pedir que la IA la evalúe, y aceptas o rechazas.

### 3.4 Inventario

#### Existencias
- **Qué es:** cuánto tienes hoy de cada insumo y producto de reventa.
- **Qué muestra:** cantidad actual, unidad, **mínimo de alerta** y último costo. Resalta lo que está bajo mínimo.

#### Movimientos
- **Qué es:** el historial de **todos** los cambios de stock (compras, ventas, mermas, ajustes).
- **Cómo se usa:** se filtra por insumo, por producto o por tipo. Es el "libro contable" del inventario (no se borra; ver 2.3).
- **Ajustes manuales:** para corregir un conteo o registrar una merma. El **stock inicial** solo se carga **una vez** por item (el sistema lo bloquea si ya existe).

### 3.5 Caja

#### Turnos
- **Qué es:** la lista de cajas (turnos) abiertas y cerradas, con su cuadre.
- **Conceptos importantes:**
  - **Caja única por negocio:** solo hay una caja abierta a la vez (la abre quien empieza el día).
  - **Cierre de caja:** al cerrar, se cuenta el efectivo y el sistema compara contra lo esperado (apertura + ventas en efectivo + entradas − salidas). Si hay diferencia grande, queda marcada.
  - **Movimientos de efectivo:** entradas/salidas del cajón aparte de las ventas (pagar un domicilio, sacar para un mandado).
  - **Análisis IA del descuadre:** la IA puede explicar por qué no cuadró una caja.
- **Qué enseñar:** el turno se cierra **contando el efectivo**, no con cerrar sesión.

### 3.6 Personal (RRHH)

#### Usuarios *(solo Dueño)*
- **Qué es:** crear y gestionar a los empleados: alta, cambio de rol, **resetear contraseña**, configurar **PIN de aprobación** y **desactivar** a quien ya no trabaja.
- **Qué enseñar:** es la acción más sensible (crear un usuario puede dar acceso administrativo); por eso solo el Dueño. El sistema impide quedarse sin ningún Dueño activo.

#### Asistencia
- **Qué es:** registro de entradas y salidas de los trabajadores, con horas trabajadas.

#### Comisiones
- **Qué es:** configuración de comisiones por trabajador (% del turno o monto fijo por venta). El historial es **inmutable**: cada cambio crea una fila nueva.

#### Nómina del período
- **Qué es:** resumen por trabajador de horas + comisión estimada en un rango de fechas.

### 3.7 Reportes

#### Ventas
- **Qué es:** cuánto y cómo vendiste en un período: serie en el tiempo, y desglose por tipo (mostrador/web) y por método de pago.

#### Productos
- **Qué es:** ranking de los **más vendidos**, con costo y margen **estimados** (usa el "último costo").

#### Operación
- **Qué es:** cobertura de los WhatsApp automáticos, métricas de IA y un **mapa de calor** de día × hora (a qué horas vendes más).

#### Costos y margen real *(solo Dueño)* ⭐
- **Qué es:** el reporte financiero serio, con **costo real FIFO** (Parte 2):
  - **Estado de resultados:** ingresos − costo real − merma valorizada = **ganancia bruta**.
  - **Margen real por producto:** cuánto ganaste de verdad por cada producto.
  - **Inventario valorizado:** cuánto vale tu bodega a costo real.
- **Qué enseñar:** este es el reporte para tomar decisiones de plata. Si un insumo no tiene costo registrado, el reporte lo **avisa** (no inventa $0).

#### Anomalías *(solo Dueño)*
- **Qué es:** detección de comportamientos raros por cajero (descuadres, anulaciones, aperturas de cajón) comparados con su propio historial. Es una herramienta **anti-fraude**.

#### Reconciliación
- **Qué es:** subir el extracto (CSV) de Nequi/Bancolombia y **cruzarlo** con las ventas digitales del sistema, para detectar pagos que no coinciden.

### 3.8 Auditoría

#### Bitácora
- **Qué es:** una vista **legible** de todo lo que pasó (caja, anulaciones, cajón, aprobaciones, sesiones, cocina), filtrable por categoría.

#### Auditoría completa *(solo Dueño)*
- **Qué es:** el registro técnico completo e **inmutable** de todas las acciones sensibles. Es la "caja negra" del sistema.

---

## PARTE 4 — Roles y permisos (quién ve qué)

El sistema tiene cinco roles; al **Panel de Administración** solo entran dos: **Dueño** y **Administrador operativo**. (Cajero y Cocinero usan otras pantallas; Trabajador es para RRHH.)

| Módulo | Administrador operativo | Dueño |
|---|---|---|
| Inicio, Catálogo, Compras, Inventario, Caja, Personal (asistencia/comisiones/nómina), Reportes (Ventas/Productos/Operación), Bitácora, Reconciliación | ✅ | ✅ |
| **Costos y margen real** | ❌ | ✅ |
| **Anomalías (anti-fraude)** | ❌ | ✅ |
| **Auditoría completa** | ❌ | ✅ |
| **Usuarios** | ❌ | ✅ |

> **La lógica:** el administrador maneja la **operación**; el dueño guarda lo **financiero y de control** (ganancias, anti-fraude, gestión de personal).

---

## PARTE 5 — Glosario

- **Insumo:** materia prima que se compra (pollo, sal).
- **Subproducto:** preparación intermedia (salsa) que se usa en productos.
- **Producto:** lo que el cliente compra.
- **Reventa directa:** producto que se compra y vende igual, sin receta.
- **Receta:** fórmula de lo que lleva un producto/subproducto.
- **Combo:** varios productos juntos a un precio especial.
- **Unidad de compra / de receta:** cómo se compra vs. cómo se cocina.
- **Factor de conversión:** cuántas unidades de receta hay en una de compra.
- **Merma:** lo que se pierde al preparar (en %).
- **Rendimiento:** porciones que rinde una preparación de subproducto.
- **Movimiento:** cada cambio de inventario (compra, venta, merma, ajuste, inicial).
- **Último costo:** precio de la última compra (referencia).
- **Costo real / FIFO:** lo que de verdad costó lo vendido (lo viejo se usa primero).
- **COGS / costo de lo vendido:** suma del costo real de todo lo que se vendió.
- **Margen:** ganancia ÷ precio de venta.
- **Estado de resultados:** ingresos − costos − mermas = ganancia.
- **Turno / Caja:** la jornada de cobro; se abre y se cierra contando efectivo.
- **PIN de aprobación:** clave de 6 dígitos para autorizar acciones sensibles (anular, abrir cajón).

---

## PARTE 6 — Errores comunes y consejos para capacitar

**Errores comunes (y cómo prevenirlos):**
1. **Factor de conversión mal puesto** → todos los costos quedan mal. *Verificar siempre con un ejemplo: "1 bulto = ¿cuántos gramos?".*
2. **No confirmar las facturas** → el sistema cree que no hay stock ni costo. *Confirmar es obligatorio.*
3. **No registrar mermas/ajustes** → el inventario "real" se despega del sistema y el costo FIFO se desalinea. *La exactitud del costeo depende de la disciplina del inventario.*
4. **Cargar "stock inicial" más de una vez** → el sistema lo bloquea; las correcciones van por **ajuste manual**.
5. **Confundir precio de venta con costo** → son cosas distintas; el costo lo pone la factura, el precio lo pones tú.

**Consejos para el capacitador:**
- Enseñe en el **orden de la cadena**: primero insumos y unidades, luego recetas, luego compras, luego ventas, y al final reportes. Cada paso depende del anterior.
- Use **el ejemplo del pollo en dos lotes** (sección 2.5) para que FIFO quede claro de una vez.
- Repita el mantra: **"el sistema no adivina; refleja lo que registraste"**.
- Para el dueño, enfatice **Reportes → Costos y margen real**: es donde está la verdad de la plata.
- Practique un **ciclo completo** en capacitación: cargar un insumo → confirmar una factura → crear un producto con receta → simular una venta → mirar el reporte de costo real. Ver la cadena entera de punta a punta es lo que hace "clic".
