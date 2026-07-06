# POS Tercos — Funcionalidad general del sistema (2026-07-06)

> Documento FUNCIONAL: qué hace el sistema y qué puede hacer cada persona en
> cada aplicación. No es documentación técnica (para eso: `CLAUDE.md` y
> `ARCHITECTURE.md`) ni manual paso a paso (para eso: `manual-capacitacion-admin.md`
> y `qa-guiado.md`).

## ¿Qué es?

Sistema completo de punto de venta para un restaurante de comida rápida
(1 local, 1 caja): venta en mostrador y pedidos web, inventario con costeo
FIFO real, cocina, finanzas del dueño, nómina, y notificaciones automáticas
por WhatsApp. Corre como monorepo: 1 API central + 5 aplicaciones web + 1
agente de impresión local.

## Mapa de aplicaciones

| App | Quién la usa | Dónde corre | Rol requerido |
|---|---|---|---|
| **POS Cajero** (`apps/pos`) | El cajero, en la tablet/PC del mostrador | Vercel (PWA instalable, funciona sin internet) | CAJERO, ADMIN_OPERATIVO, DUENO |
| **Admin** (`apps/admin`) | El dueño y el admin operativo | Vercel | ADMIN_OPERATIVO, DUENO (algunas cosas solo DUENO) |
| **Web pública** (`apps/web`) | Los clientes | Vercel | Sin login |
| **Cocina** (`apps/cocina`) | El cocinero | Vercel (responsive, tablet de cocina) | COCINERO, ADMIN_OPERATIVO, DUENO |
| **Pantalla del local** (`apps/public-display`) | Nadie la opera — es la TV | Vercel (modo kiosko) | Sin login |
| **Print Agent** (`apps/print-agent`) | Nadie — servicio local | PC/Raspberry del mostrador | — |
| **API** (`apps/api`) | Todas las anteriores | Railway (NestJS + Postgres) | — |

---

## 1. POS Cajero — la caja del mostrador

### Vender
- **Catálogo táctil** con categorías, búsqueda visual, precios, foto de "Agotado"
  en vivo (se calcula contra el stock real: un preparado se agota si falta un
  insumo de su receta) y toggle manual de "86/agotado" con motivo.
- **Carrito** con tamaños (proteínas), modificadores, notas de cocina por línea
  ("sin cebolla"), cantidades, y **promociones automáticas** aplicadas en vivo
  (porcentaje, monto fijo, BOGO, combo) con precio tachado.
- **Nombre del cliente** opcional en cualquier venta de mostrador.

### Cobrar
- Métodos configurables por el admin (efectivo, Nequi, Daviplata, QR
  Bancolombia, transferencia, tarjeta). Efectivo calcula el vuelto; los
  digitales exigen doble verificación del comprobante.
- **Cuenta dividida** (2–10 personas): partes iguales con reparto exacto del
  remanente, por productos (cada unidad asignada a una persona, promos
  prorrateadas) o montos libres. Cada parte con su método y su vuelto.
- **Descuento manual**: por línea y/o sobre el total, en monto fijo o
  porcentaje. Excluyente con promociones, exige motivo, y el dueño recibe
  aviso por WhatsApp de cada descuento.
- Al cobrar: **comanda a cocina** e **impresión de factura automáticas** (con
  ruteo multi-impresora configurable por terminal). Si una comanda no imprime,
  aparece un aviso rojo persistente con botón de reintento.

### Cuentas abiertas (cliente conocido que paga al final)
- Abrir cuenta a nombre del cliente: la comanda de lo pedido sale a cocina y
  la cuenta queda viva (horas o días, cruza cierres de caja).
- Agregar productos en cualquier momento → a cocina sale **solo lo nuevo**
  (comanda incremental rotulada "ADICIÓN").
- Panel de pedidos en la pantalla principal: cuentas abiertas con acciones
  **Cobrar / Agregar / A cocina / Cancelar** + últimos pedidos del día con estado.
- Cancelar una cuenta con tandas ya enviadas imprime en cocina un ticket de
  **ANULACIÓN** con el número gigante.

### Pedidos web
- Campana + badge en vivo (WebSocket) cuando entra un pedido de la web.
- El cajero **verifica el comprobante y confirma el pago** (el cliente recibe
  WhatsApp automático), y luego marca **"Listo para retirar"** (otro WhatsApp).
  También puede rechazar pedidos no pagados.

### Correcciones
- **Editar un pedido cobrado** (agregar/cambiar productos): recalcula precios,
  promos, stock y ajusta el pago por la diferencia; reimprime comanda
  "PEDIDO MODIFICADO".
- **Cambiar el método de pago** registrado (corrige descuadres antes del cierre).
- **Anular** una venta pagada no iniciada (PIN de admin/dueño): revierte stock,
  sale de la caja, ticket de anulación a cocina, aviso WhatsApp al dueño.
- **Reembolsar** un pedido ya preparado (PIN): la pérdida queda costeada en el P&G.
- **Cortesías**: regalar un pedido (queda a costo real FIFO, el dueño lo ve y
  puede anularlo desde el admin).

### Caja
- **Apertura** con base de efectivo (caja única del negocio, una por día).
- **Movimientos de caja** (entradas/salidas) por método — un egreso por
  transferencia ajusta el arqueo digital, no el cajón.
- Badge **"En caja"** en vivo.
- **Cierre con conteo ciego**: arqueo por denominación (el esperado se oculta
  hasta revelar), arqueo digital por método contra lo que dice cada app,
  propinas aparte. Descuadre ≥ $5.000 → alerta WhatsApp al dueño.
- **Arqueos**: historial completo de cierres con detalle expandible.
- **Historial** del día con estados, reimpresión de recibos y todas las acciones.

### Sin internet (modo offline)
- El POS detecta la caída (incluso si la API está viva pero la base de datos
  no) y **sigue vendiendo**: encola las ventas localmente, imprime recibo
  provisional OFF-N y comanda, calcula disponibilidad con las mismas reglas
  del servidor, y sincroniza todo solo al volver la red (sin duplicar jamás).
- Bandeja de revisión para ventas que el servidor rechazó al sincronizar.
- Límite conocido: la caja debe haberse abierto con internet.

### Otros
- Configuración de impresoras por terminal (qué documento sale por cuál).
- PIN propio (admin/dueño), sesión que se renueva sola.

---

## 2. Admin — el panel del dueño

### Catálogo
- **Insumos** (unidades de compra/receta, factor de conversión, umbral de alerta,
  tamaño de porción), **subproductos** (rinde, receta propia, pasos de
  preparación para la biblia) y **productos** (precio de venta, combos,
  tamaños/proteínas, modificadores, reventa directa, foto).
- **Editor de recetas** en árbol (producto → subproductos → insumos, con merma)
  y **costo expandido** en vivo de cada producto con margen.

### Inventario
- Stock unificado de insumos + subproductos + reventa, con porciones,
  alertas de bajo stock y valorización FIFO por lotes.
- Movimientos (libro inmutable), ajustes manuales, mermas, conteos físicos.
- **Aprobación de conteos del cocinero** (llegan pendientes, el admin aprueba
  o rechaza; aprobar aplica la diferencia contada).

### Compras
- **Facturas con IA**: foto de la factura del proveedor → Claude extrae los
  ítems → el admin los mapea (con sugerencias por similitud) → al confirmar
  entra el stock y se actualizan los costos. Clonado de facturas recurrentes,
  pagos de facturas (contado/crédito → cuentas por pagar).
- **Proveedores** con histórico de precios por ítem.
- **Sugerencias de compra IA**: cron horario detecta bajo stock, el dueño puede
  pedir una evaluación con IA (contexto de últimas compras) y aceptar/rechazar.

### Reportes
- Ventas (serie temporal, por tipo y método), top productos con margen,
  heatmap por hora/día, uso y mermas ($ perdido), métricas WhatsApp e IA.
- **Anomalías por cajero** (descuadres/anulaciones/cajón sin venta vs su
  histórico personal, 2σ).
- **Reconciliación bancaria**: subir el CSV de Nequi/Bancolombia → match
  automático contra los pagos digitales → rojo lo que está en el POS y no en
  el banco. Con histórico persistente.

### Finanzas (dueño)
- **Estado financiero mensual real**: ingresos − COGS FIFO − costos fijos −
  nómina = neto. Con mes del negocio configurable, análisis IA del resultado,
  punto de equilibrio y tendencia.
- **Tesorería** (saldos efectivo/banco, traspasos), **cuentas por pagar**,
  **costos fijos** con pagos por período, **cortesías** (autorizar las
  pendientes, anular las erróneas — devuelven stock a costo real).
- **Kill-switch de pedidos web**: pausar/reactivar los pedidos online al
  instante ante abuso.

### Personal
- Usuarios y roles, **nómina semanal** (días trabajados, ajustes, pago con
  comprobante y salida de caja/tesorería automática, reparto de propinas).

### Operación
- **Bitácora** legible (caja, anulaciones, cajón, aprobaciones, sesiones,
  cocina) + **auditoría completa** inmutable (solo dueño).
- **Cocina admin**: incidencias reportadas por el cocinero + administrar el
  checklist de apertura/cierre.
- **Turnero/TV**: administrar las diapositivas de productos y la música de la
  pantalla del local. **Publicidad web**: imágenes/videos del hero del sitio.
- Medios de pago habilitados, día de corte del mes del negocio.

---

## 3. Web pública — los clientes

- **Menú** con categorías, fotos, precios, promociones y "agotado" en vivo;
  hero con publicidad configurable (imágenes/video).
- **Carrito** persistente y **checkout de 1 página** (retiro en local): nombre +
  celular → el pedido llega al POS y el cliente recibe por WhatsApp las
  instrucciones de pago (Nequi/transferencia).
- **Seguimiento del pedido** con URL propia (sin cuenta): pendiente de pago →
  pago confirmado → listo para retirar, actualizado en vivo + avisos WhatsApp.
- Protecciones: límite de pedidos pendientes por teléfono/día y kill-switch
  general del dueño.

---

## 4. Cocina — la tablet del cocinero

- **Biblia de recetas** (solo lectura): composición exacta y paso a paso de
  cada producto y subproducto.
- **Producción**: registrar tandas de subproductos (salsas, carnes porcionadas)
  con foto de evidencia — consume los insumos de la receta y crea stock del
  subproducto al costo FIFO real.
- **Inventario de cocina**: stock sin costos, registro de **mermas** con motivo,
  y **conteo físico ciego** (no ve el esperado; queda pendiente de aprobación
  del admin).
- **Incidencias**: avisar al dueño de problemas (insumo, equipo, producción).
- **Checklist** de apertura y cierre del día.

---

## 5. Pantalla del local (TV)

- Carrusel de productos con foto/precio/descripción + publicidad (B-roll) y
  música ambiente, todo administrado desde el admin. Modo kiosko 24/7 con
  reconexión y wake-lock automáticos.

---

## 6. Print Agent — la impresora

- Servicio local en la PC/Raspberry del mostrador: recibe los bytes ESC/POS
  del navegador del POS y los manda a la térmica (facturas, comandas de
  cocina, comandas completas, tickets de anulación) + abre el cajón monedero.
- Multi-impresora por nombre, cola serializada, funciona aunque la API esté
  caída (recibos offline), empaquetable como .exe de Windows.

---

## 7. Lo que pasa solo (backend)

- **WhatsApp automático** (Kapso, Cloud API oficial): instrucciones de pago al
  crear el pedido web, "pago confirmado", "listo para retirar", "cancelado";
  y al dueño: descuadres de caja, anulaciones, descuentos manuales, cortesías,
  cajón sin venta, subas de costos, errores del sistema y el **digest diario
  21:30** con el resumen del día generado por IA. Los envíos fallidos se
  reintentan solos.
- **Crons**: barrido de cobros abandonados, detección de saltos de recibo,
  scan horario de bajo stock, purgas de retención (idempotencia, WhatsApp 90d,
  auditoría 24 meses), limpieza de archivos huérfanos.
- **Backup nocturno verificado** de la base a Cloudflare R2 (retención 30 días).

---

## 8. Roles — quién puede qué (resumen)

| Capacidad | CAJERO | COCINERO | ADMIN_OPERATIVO | DUENO |
|---|---|---|---|---|
| Vender, cobrar, caja, pedidos web | ✅ | — | ✅ | ✅ |
| Anular/reembolsar (con PIN de aprobación) | pide PIN | — | su PIN | su PIN |
| Cocina (biblia, producción, merma, conteo) | — | ✅ | ✅ | ✅ |
| Catálogo, inventario, facturas, promos | — | — | ✅ | ✅ |
| Ver costos de compra | — | — | ✅ | ✅ |
| Reportes operativos, bitácora | — | — | ✅ | ✅ |
| Finanzas, tesorería, nómina, auditoría, anomalías, usuarios | — | — | — | ✅ |

---

## 9. Garantías de robustez (lo que sostiene todo lo anterior)

- **Idempotencia end-to-end**: reintentar un cobro (por red o doble click)
  jamás duplica una venta, online u offline.
- **Invariantes de plata en la base de datos**: la suma de los pagos debe
  cuadrar con el total, solo puede existir una caja abierta, el descuento no
  puede exceder el subtotal, el libro de inventario y la auditoría son
  inmutables (correcciones por compensación, nunca edición).
- **Concurrencia segura**: cobros, cierres de caja, producciones y conteos
  corren serializados — dos operaciones simultáneas sobre el mismo stock o la
  misma caja no pueden descuadrarla.
- **Costeo FIFO real**: cada peso de costo viene de lotes de compra reales;
  ventas, producciones, mermas, cortesías y reembolsos se costean del libro.
- **Degradación con aviso**: impresora caída → alerta con reintento; WhatsApp
  caído → reintento automático; API/DB caída → POS offline; 5xx inesperado →
  WhatsApp al dueño; todo lo demás → bitácora.
