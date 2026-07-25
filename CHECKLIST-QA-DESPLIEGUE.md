# Checklist de QA para el despliegue

> **Para qué sirve.** Recorrer la app completa a mano y quedar tranquilo antes de
> abrir al público. Cada ítem es *acción → esperado*: si el esperado no se cumple,
> anotalo y no sigas al siguiente bloque hasta entender por qué.
>
> **Supersede a `qa-guiado.md`**, que quedó viejo (habla del POS en el puerto 3002
> y del KDS, los dos eliminados en §7.v10).
>
> **Cuánto toma.** El camino crítico (bloques 0 a 5) son ~90 minutos. La lista
> completa, una jornada. Si vas con el tiempo justo, hacé los bloques marcados
> con 🔴 — son los que tocan plata o pueden dejar el local sin vender.

---

## Preparación

- [ ] Postgres arriba: `docker compose up -d postgres`
- [ ] Todo levantado: `pnpm dev` desde la raíz
- [ ] URLs a mano:
  - API `http://localhost:3001` · Admin/Caja `http://localhost:3004`
  - Web cliente `http://localhost:3000` · Cocina `http://localhost:3006`
  - Pantalla del local `http://localhost:3005`
- [ ] Usuarios (clave `dev12345`): `dueno@` · `admin@` · `cajero@` · `cocinero@` (todos `@dev.local`)
- [ ] **Probá también contra una base VACÍA** al menos una vez (`pnpm prisma migrate reset`).
      Los errores de "primera vez" (sin stock, sin categorías, sin caja) solo aparecen ahí.

> **Convención de la lista:** 🔴 crítico · 🟡 importante · ⚪ conviene.

---

## Bloque 0 — Acceso, sesiones y roles 🔴

- [ ] Login en Admin con `dueno@` → entra al launcher.
- [ ] **Aislamiento de sesiones**: en el MISMO navegador, abrí Cocina (3006) y logueá `cocinero@`.
      Volvé a Admin y recargá. → *La sesión de Admin sigue siendo el Dueño.* No se mezclan.
- [ ] Cerrar sesión en Admin → vuelve a `/login` y no se puede volver con el botón "atrás".
- [ ] Login con clave incorrecta 11 veces seguidas → *a partir del intento 11 responde "demasiados intentos"* (tope 10/min).
- [ ] `cajero@` intenta entrar a `/finanzas/estado` → *pantalla de "no autorizado"*.
- [ ] `cajero@` intenta entrar a `/users` → *no autorizado* (solo Dueño).
- [ ] `cocinero@` intenta entrar a Admin (3004) → *no autorizado*.
- [ ] `admin@` (operativo) entra a `/bitacora` → *sí puede*; a `/audit` → *no* (auditoría completa es del Dueño).
- [ ] Con sesión abierta, esperá a que venza el access token (o borrá la cookie `admin_access`)
      y navegá → *renueva sola, no te saca al login.*

---

## Bloque 1 — Catálogo 🟡

**Categorías**
- [ ] Crear categoría "Bebidas" en `/categories`.
- [ ] Intentar crear un producto con una categoría que no existe → *lo rechaza*.

**Insumos** (`/ingredients`)
- [ ] Crear insumo: Carne · compra en `kg` · receta en `g` · factor 1000 · umbral 2000.
- [ ] Doble clic en Guardar → *no crea dos insumos.*
- [ ] Editar el umbral y verificar que persiste.
- [ ] Marcar un insumo como inactivo → *desaparece de los selectores de receta.*

**Subproductos** (`/subproducts`)
- [ ] Crear subproducto "Salsa de la casa" con rendimiento (`yield`) 20 porciones.
- [ ] Editar su receta: 2 insumos con merma % → guarda y recalcula.
- [ ] Ver el costo expandido → *coincide con la suma de sus insumos.*

**Productos** (`/products`)
- [ ] Crear producto preparado con receta (insumo + subproducto).
- [ ] Crear producto de **reventa directa** (gaseosa): pide unidad de compra, de stock y factor.
- [ ] Crear un **combo** con 2 componentes → el costo del combo suma sus partes.
- [ ] Crear producto con **tamaños** y **modificadores** → aparecen al venderlo.
- [ ] Subir foto a un producto → se ve en el menú web.
- [ ] Verificar que `precio de venta` y `último costo` son **campos distintos** y el margen se muestra en vivo.

---

## Bloque 2 — Inventario 🔴

- [ ] Cargar **stock inicial** a un insumo con costo unitario → aparece en `/inventory`.
- [ ] Intentar cargar un SEGUNDO stock inicial al mismo insumo → *lo rechaza* (solo uno).
- [ ] Ajuste manual **positivo** con costo → sube el stock y la valuación.
- [ ] Ajuste manual **negativo** → baja el stock.
- [ ] Registrar **merma** con motivo → baja el stock y aparece en el P&G como pérdida.
- [ ] **Anular esa merma completa** (botón "Anular" en `/inventory/movements`)
      → *el stock vuelve entero Y la pérdida desaparece del P&G.*
- [ ] Registrar merma de 10 y **anular solo 9** (parcial)
      → *el P&G queda con la pérdida de 1, no de 10.*
- [ ] Intentar anular dos veces la misma merma completa → *lo rechaza.*
- [ ] Ver `/inventory/movements`: el libro **no permite editar ni borrar** ningún renglón.
- [ ] Conteo físico en `/inventory/counts` → genera el ajuste por la diferencia.
- [ ] `/inventory/negativos` lista los stocks en rojo (deudas por venta forzada).

---

## Bloque 3 — Compras y facturas 🟡

- [ ] Crear proveedor en `/suppliers`.
- [ ] `/invoices/new`: subir **foto de una factura real** → la IA extrae ítems.
- [ ] Corregir a mano un ítem mal leído antes de confirmar.
- [ ] Emparejar un ítem con un insumo existente (sugerencia difusa) y **crear uno nuevo** desde el modal.
- [ ] Confirmar la factura → *sube el stock, actualiza el último costo y queda en el histórico.*
- [ ] Verificar en `/inventory/movements` que se crearon los movimientos de compra.
- [ ] Confirmar una factura **marcándola como pagada** con comprobante → aparece en Tesorería.
- [ ] Confirmar una **sin pagar** → aparece en `/finanzas/compromisos` como cuenta por pagar.
- [ ] Clonar una factura confirmada (proveedor recurrente) → nace como borrador editable.
- [ ] Borrar un borrador sin confirmar → desaparece.
- [ ] Subir un archivo que **no es imagen** (un PDF renombrado a .jpg) → *lo rechaza.*
- [ ] Subir una imagen de más de 10 MB → *lo rechaza.*

---

## Bloque 4 — Caja y ventas 🔴

*El bloque más importante. Si algo falla acá, no se abre el local.*

**Apertura**
- [ ] Abrir caja con fondo $100.000 → el badge "En caja" muestra $100.000.
- [ ] Intentar abrir una SEGUNDA caja → *lo rechaza* (caja única por negocio).

**Venta simple**
- [ ] Agregar productos al carrito, con tamaño y modificadores.
- [ ] Cambiar cantidades y quitar una línea → el total se recalcula.
- [ ] Cobrar en **efectivo** con $50.000 por una venta de $27.000 → *muestra vuelto $23.000.*
- [ ] Cobrar en **transferencia** → *exige marcar que verificaste el comprobante.*
- [ ] El recibo se imprime y el badge "En caja" sube solo por lo cobrado en efectivo.

**Cuenta dividida**
- [ ] Dividir en **partes iguales** entre 3 personas con un total que no divide exacto (ej. $10.000)
      → *las partes suman EXACTO; las primeras llevan $1 más.*
- [ ] Dividir **por productos**: asignar unidades a cada persona.
- [ ] Dividir en **montos libres**: la última parte se autocompleta con el resto.
- [ ] Mezclar métodos (una parte efectivo, otra transferencia) → cobra bien y el arqueo lo refleja.
- [ ] Intentar confirmar con las partes sumando de menos → *lo rechaza.*

**Descuentos**
- [ ] Descuento **por línea** (fijo y porcentaje) con motivo obligatorio.
- [ ] Descuento **sobre el total**.
- [ ] Con un descuento manual puesto, verificar que **las promociones se desactivan** para toda la venta.
- [ ] El descuento queda en la bitácora y le llega alerta al dueño.

**Cuentas abiertas**
- [ ] Abrir cuenta con nombre de cliente → queda pendiente sin límite de tiempo.
- [ ] Agregar productos y mandar **"A cocina"** → imprime solo lo nuevo.
- [ ] Agregar más y volver a mandar → *la segunda comanda dice "ADICIÓN" y trae solo lo agregado.*
- [ ] Cobrar la cuenta → la comanda no se re-imprime entera.
- [ ] Cancelar una cuenta que ya fue a cocina → *imprime comanda de ANULACIÓN.*

**Correcciones**
- [ ] **Editar** una venta ya pagada: agregar una bebida → ajusta el stock por la diferencia.
- [ ] Intentar editar una línea de preparación de un pedido ya en cocina → *lo rechaza.*
- [ ] **Cambiar el método de pago** de una venta cobrada → el arqueo se corrige.
- [ ] **Anular** una venta pagada con PIN de aprobación y motivo → *devuelve el stock.*
- [ ] Intentar anular sin PIN o con PIN incorrecto → *lo rechaza y queda en bitácora.*
- [ ] **Reembolsar** una venta ya preparada → *NO devuelve el stock* (la comida se gastó) y el costo queda como pérdida en el P&G.

**Movimientos de caja**
- [ ] Registrar una **salida** de efectivo con motivo → baja el esperado.
- [ ] Registrar una **entrada** → sube el esperado.
- [ ] Registrar una salida por **transferencia** → *NO toca el efectivo esperado*, ajusta el arqueo digital de ese método.
- [ ] Editar y borrar un movimiento con la caja abierta → se puede.
- [ ] Con la caja ya cerrada, intentar editarlo → *no se puede.*

**Cierre**
- [ ] Cerrar con el efectivo **exacto** → descuadre $0.
- [ ] Cerrar con $6.000 de menos → *marca descuadre y le avisa al dueño* (umbral $5.000).
- [ ] Usar el **arqueo por denominación** y el **conteo ciego** (no muestra el esperado hasta revelar).
- [ ] Arquear los métodos **digitales** contra lo que dice la app.
- [ ] Ingresar **propinas** al cerrar → *van a un bote aparte, NO suman al efectivo esperado.*
- [ ] Con una cuenta abierta sin cobrar, intentar cerrar → *no deja*: obliga a Cobrar, Traspasar o Cancelar.
- [ ] **Traspasar** la cuenta abierta → sale del arqueo de esa caja y se puede cobrar en la siguiente.
- [ ] Ver el cierre en `/caja/arqueos` con todo el detalle.

**Día de negocio (corte 4 AM)**
- [ ] Con una caja abierta ayer a las 8 PM, operar a la 1 AM → *deja vender* (misma jornada).
- [ ] Después de las 4 AM con esa caja aún abierta → *bloquea y obliga a cerrarla primero.*

---

## Bloque 5 — Pedidos del cliente (web) 🔴

**Menú y carrito** (`http://localhost:3000`)
- [ ] El menú muestra productos con foto y precio; los agotados salen marcados.
- [ ] Agregar al carrito, cambiar cantidad, vaciar.
- [ ] Recargar la página → *el carrito sobrevive.*
- [ ] Una promoción activa se ve con precio tachado y el descuento aparece en el carrito.

**Retiro en tienda**
- [ ] Checkout con nombre y celular (+57 y 10 dígitos) → crea el pedido.
- [ ] Celular con 9 dígitos → *lo rechaza.*
- [ ] El cliente recibe las instrucciones de pago (en dev quedan en el log del backend).
- [ ] En Caja, el pedido aparece en "Pedidos web" con su contador.
- [ ] El cajero **confirma el pago** → entra a la caja y descuenta stock.
- [ ] El cajero marca **"Listo para retirar"** → el cliente lo ve en su pantalla de seguimiento.
- [ ] Compartir el link de seguimiento en otro navegador → *funciona con el token de la URL.*
- [ ] Quitar o alterar el `token` de la URL → *no muestra el pedido.*

**Domicilio**
- [ ] Pedido a domicilio con dirección y ubicación.
- [ ] Dirección **fuera del radio** configurado → *lo rechaza.*
- [ ] En Caja: intentar cobrar sin asignar el costo del envío → *lo rechaza.*
- [ ] Asignar el envío → el total sube y así se cobra.
- [ ] Editar el pedido después de asignar el envío → *el envío no se pierde ni se duplica.*

**Bordes**
- [ ] Hacer 4 pedidos sin pagar con el mismo teléfono el mismo día → *el 4º se rechaza* (tope 3 pendientes).
- [ ] Apagar los pedidos web desde `/finanzas/estado` → *la web muestra el aviso y bloquea el checkout.*
- [ ] Pedir **fuera del horario** configurado → *lo rechaza.*
- [ ] Rechazar un pedido desde Caja → el cliente ve "cancelado".
- [ ] Crear una venta de mostrador y abandonar el cobro 30 min → *se cancela sola* (no ensucia la caja).

---

## Bloque 6 — Cocina 🟡

*(`http://localhost:3006`, usuario `cocinero@`)*

- [ ] **Biblia**: ver la receta y el paso a paso de un producto → *es solo lectura.*
- [ ] Verificar que **NO se ven costos** en ninguna pantalla de cocina.
- [ ] **Producción**: producir una tanda de un subproducto
      → *sube el stock del subproducto y baja el de sus insumos.*
- [ ] Producir más de lo que alcanza el stock → *lo rechaza* (no deja stock negativo).
- [ ] **Inventario**: ver stock, registrar **merma** con motivo obligatorio.
- [ ] **Conteo ciego**: la pantalla de conteo no muestra lo esperado.
- [ ] **Incidencias**: registrar una → el dueño la ve en `/cocina` y puede resolverla.
- [ ] **Checklist** de apertura y de cierre → exige cubrir todos los ítems activos.
- [ ] El admin agrega un ítem nuevo al checklist → aparece en cocina.

---

## Bloque 7 — Promociones 🟡

- [ ] Crear promo de **% de descuento** sobre un producto y verificar en la venta.
- [ ] Crear promo de **monto fijo**.
- [ ] Crear **2x1 (BOGO)**: comprar 2 llevar 1 → el descuento aplica solo en sets completos.
- [ ] Crear promo de **combo**.
- [ ] Dos promos que compiten sobre el mismo producto → *gana la de mayor descuento en pesos.*
- [ ] Promo con **ventana horaria**: probar dentro y fuera del horario.
- [ ] Promo que **cruza la medianoche** (22:00 a 02:00) → aplica a la 1 AM.
- [ ] Promo por **días de la semana**: no aplica el día que no corresponde.
- [ ] Promo con canal **solo WEB** → aparece en la web, no en la caja. Y viceversa con **solo POS**.
- [ ] Desactivar una promo → deja de aplicar de inmediato.

---

## Bloque 8 — Finanzas 🔴

- [ ] **`/finanzas/estado`**: revisar el P&G del mes.
- [ ] Cargar un **costo fijo recurrente** (arriendo) → baja el neto y entra al punto de equilibrio.
- [ ] Cargar un **gasto puntual** (un horno) → baja el neto pero **NO** infla el punto de equilibrio.
- [ ] Registrar un empleado con salario **mensual** → aparece como "Nómina (auto)" por el mes completo.
- [ ] **Tesorería**: revisar los dos bolsillos (Efectivo y Cuenta).
- [ ] Registrar un **traspaso** entre bolsillos → los saldos se mueven, el total no cambia.
- [ ] Registrar un **ajuste** manual con motivo.
- [ ] **Pagar nómina en efectivo** desde Tesorería
      → *el arqueo de la caja del turno NO se mueve* (la nómina no toca el cajón).
- [ ] Pagar una factura pendiente desde `/finanzas/pagos` → sale del bolsillo elegido y de los compromisos.
- [ ] **Compromisos**: ver lo pendiente por pagar agrupado por responsable.
- [ ] Pedir el **análisis con IA** del estado financiero → devuelve un resumen coherente con los números.

---

## Bloque 9 — Reportes 🟡

- [ ] `/reports/sales`: serie del día y del mes, desglose por tipo y por método.
- [ ] `/reports/products`: ranking con margen por producto.
- [ ] `/reports/costos`: COGS real y valuación del inventario.
- [ ] `/reports/usage`: consumo, mermas y % de pérdida por insumo.
- [ ] `/reports/anomalies`: comportamiento por cajero (necesita ≥5 cierres para tener base).
- [ ] `/reports/reconciliation`: subir un CSV del banco → concilia contra los pagos digitales.
- [ ] Guardar el reporte de conciliación y volver a abrirlo desde el histórico.
- [ ] `/reports/operations`: cobertura de WhatsApp y mapa de calor por hora.
- [ ] Cambiar el rango de fechas en cada reporte → los números cambian de forma coherente.

---

## Bloque 10 — RRHH y nómina 🟡

- [ ] Crear empleado con salario **diario** y días de descanso.
- [ ] `/workers/semana`: revisar la semana, marcar días trabajados y descansos.
- [ ] Agregar una **novedad** (bono o descuento).
- [ ] **Pagar la semana** → sale del bolsillo de tesorería elegido.
- [ ] **Anular** un pago de la semana → la plata vuelve al bolsillo.
- [ ] Un empleado dado de baja antes del mes → *no devenga nada en el P&G.*
- [ ] Verificar que el total de nómina del P&G **coincide** con lo que muestra la nómina semanal.

---

## Bloque 11 — Cortesías 🟡

- [ ] Registrar una cortesía desde Caja con motivo → *descuenta stock al instante.*
- [ ] Verificar que aparece como pérdida en el P&G (a costo, no a precio de venta).
- [ ] Doble clic al registrarla → *no descuenta el stock dos veces.*
- [ ] **Anular** una cortesía desde el admin → devuelve el stock y sale del costo.
- [ ] `/solicitudes`: ver el histórico.

---

## Bloque 12 — Pantalla del local y publicidad ⚪

- [ ] `/turnero` (admin): subir imágenes al carrusel y pistas de música.
- [ ] `/publicidad`: configurar el banner de la web (imagen y video).
- [ ] Abrir la pantalla (3005) → *muestra productos y publicidad, sin pedir login.*
- [ ] Cortar la red un momento y devolverla → *la pantalla se reconecta sola.*
- [ ] Verificar que el video de publicidad se ve en la web del cliente.

---

## Bloque 13 — Impresión ⚪

*(requiere la impresora física; si no, los recibos caen a archivos)*

- [ ] Imprimir un recibo de venta → sale completo y legible.
- [ ] Re-imprimir el mismo recibo → *sale marcado como DUPLICADO.*
- [ ] Imprimir comanda de cocina → *sin precios.*
- [ ] Abrir el **cajón monedero** después de un cobro en efectivo.
- [ ] Apertura de cajón **sin venta** → exige PIN y motivo, queda en bitácora.
- [ ] Apagar el print-agent y cobrar → *la venta se cobra igual* (la impresión es best-effort).

---

## Bloque 14 — Sin conexión (offline) 🔴

*Con las herramientas del navegador en modo "offline".*

- [ ] Instalar la caja como app (PWA) desde el navegador.
- [ ] **Cortar la red** y hacer una venta en efectivo → *se cobra y queda en la bandeja pendiente.*
- [ ] Hacer 3 ventas más sin red.
- [ ] **Devolver la red** → *las 4 ventas se sincronizan solas y aparecen en el historial.*
- [ ] Verificar que el stock se descontó una sola vez por venta.
- [ ] **Abrir caja sin red** → funciona local; al volver la red se sincroniza antes que las ventas.
- [ ] Recargar la app sin red → *sigue funcionando* (el service worker sirve las pantallas).
- [ ] Verificar que "Dividir cuenta" y los descuentos manuales **no aparecen** sin red.

---

## Bloque 15 — Seguridad y permisos 🔴

- [ ] **Matriz de roles**: con cada usuario, intentar entrar a las secciones de los otros.
      Ninguno debe ver lo que no le toca.
- [ ] El **cocinero no ve costos** en ninguna pantalla ni en las respuestas de la API.
- [ ] Pedir la URL de una factura (`/invoices/:id/photo`) sin sesión → *la rechaza.*
- [ ] Cambiar el PIN de aprobación propio y verificar que el viejo ya no sirve.
- [ ] Revisar `/audit` (Dueño): las acciones sensibles quedaron registradas
      (anulaciones, descuentos, cierres, cambios de precio).
- [ ] Revisar `/bitacora`: se entiende sin ser técnico.
- [ ] Desactivar un usuario → *no puede volver a entrar.*

---

## Bloque 16 — Vista en celular 🟡

*Probar en un teléfono real, o con el navegador en 375px de ancho.*

- [ ] **Web del cliente**: menú, carrito y checkout completos. Ninguna pantalla se corre de lado.
- [ ] Los botones "Agregar" y los chips de categoría se tocan sin fallar.
- [ ] La barra de abajo no tapa el final de la página.
- [ ] **Caja** en celular: la barra de arriba entra completa, se puede vender y cobrar.
- [ ] **Cocina** en celular o tablet: producción e inventario usables.
- [ ] Girar el teléfono (horizontal) en las tres apps → sigue usable.

---

## Bloque 17 — Cuadres cruzados 🔴

*Este bloque es el que de verdad da tranquilidad: no prueba pantallas, prueba que los
números de un lado coincidan con los del otro. Hacelo al final de un día de pruebas
con movimiento real.*

- [ ] **Arqueo vs. ventas**: efectivo esperado del cierre = fondo + ventas en efectivo + entradas − salidas. Calculalo a mano y compará.
- [ ] **Z-report vs. reporte de ventas**: lo vendido en la sesión coincide con `/reports/sales` del día.
      *(Ojo: si la noche cruzó la medianoche, van a diferir a propósito — el Z agrupa por caja y el reporte por fecha de cobro.)*
- [ ] **P&G vs. ventas**: el ingreso del mes en `/finanzas/estado` = suma de las ventas cobradas del mes.
- [ ] **P&G cierra**: neto = margen bruto − costos fijos − gastos puntuales − cortesías − reembolsos − mermas.
- [ ] **COGS vs. inventario**: lo comprado = lo consumido + lo que queda valorizado.
- [ ] **Tesorería vs. pagos**: el saldo de cada bolsillo = saldo inicial + ingresos − gastos registrados ± traspasos.
- [ ] **Nómina**: el total del P&G coincide con la suma de las semanas pagadas.
- [ ] **Métodos de pago**: la suma por método del arqueo = la del reporte de ventas.
- [ ] Anular una venta y repetir TODOS los cuadres → *siguen cerrando.*

---

## Bloque 18 — Antes de abrir al público 🔴

- [ ] Todo probado en el entorno de **QA**, no solo en local (ver `ir-a-prod-y-entornos.md`).
- [ ] Variables de entorno de producción cargadas y el arranque no tira advertencias.
- [ ] `TZ=America/Bogota` en el servidor (de esto dependen los cortes de día y los crons).
- [ ] **Prueba de restauración del backup**: bajar un respaldo y restaurarlo en una base vacía.
      *Un backup que nunca se restauró no es un backup.*
- [ ] WhatsApp real enviando (chip y plantillas aprobadas).
- [ ] Impresora y cajón probados con el hardware definitivo.
- [ ] **Carga inicial de datos reales**: catálogo, recetas, stock inicial de todo,
      y **producir las tandas de subproductos que ya estén hechas** — si no, los preparados salen "agotados".
- [ ] Usuarios reales creados con claves propias; los de prueba (`dev12345`) eliminados.
- [ ] PIN de aprobación cambiado.
- [ ] Un cierre de caja completo en producción antes del primer cliente.

---

## Si algo falla

Anotá: **qué hiciste**, **qué esperabas**, **qué pasó** y la **hora** (para cruzar con
`/audit` y los logs del servidor). Con eso se reproduce; sin eso, se adivina.
