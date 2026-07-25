# QA guiado — Derrotero de punta a punta (base limpia)

> ## ⛔ DOCUMENTO SUPERADO (2026-07-25)
>
> Usá **`CHECKLIST-QA-DESPLIEGUE.md`**, que cubre la app actual módulo por módulo.
>
> Este derrotero quedó desactualizado: habla del POS en el puerto 3002 y del KDS,
> los dos eliminados (§7.v10 — el POS se unificó dentro del admin y la cocina es
> ahora una app web en el 3006). Se conserva como historial del proceso de QA.

> **Estado de partida:** base de datos de desarrollo **vacía**, solo con 4 usuarios de acceso.
> Sigue las fases **en orden** (cada una depende de la anterior). Marca cada casilla y revisa el **Esperado**.
>
> ⚠️ **2026-06-27 (CLAUDE.md §7.v10): turnero + KDS ELIMINADOS.** Ignorá la "FASE 8 — Cocina (KDS) + Pantalla pública" y el "recibo con número de turno": hoy COUNTER termina en PAGADO (recibo con # de recibo), el pedido web se marca "listo para retirar" desde el POS, y la pantalla del local solo muestra productos + publicidad + música.

## Prerrequisitos

- Postgres corriendo (`docker compose up -d postgres`).
- Levantar todo: `pnpm dev` (desde la raíz).
- URLs:
  - **API:** http://localhost:3001
  - **Admin:** http://localhost:3004
  - **POS (cajero):** http://localhost:3002
  - **Web (cliente):** http://localhost:3000
  - **Pantalla pública:** http://localhost:3005
  - **KDS (cocina):** app Flutter (emulador/tablet)
- Usuarios (clave **dev12345** todos):
  - `dueno@dev.local` (Dueño), `admin@dev.local` (Admin operativo), `cajero@dev.local` (Cajero), `cocinero@dev.local` (Cocinero).

---

## FASE 0 — Acceso y sesiones

- [ ] Abrir **Admin** (3004) → login `dueno@dev.local`.
  - *Esperado:* entra al Dashboard. Como no hay datos, las tarjetas muestran 0 / "sin datos".
- [ ] **Prueba de cookies por app** (bug histórico): en el MISMO navegador, abrir **POS** (3002) y loguear `cajero@dev.local`. Volver a la pestaña de Admin y recargar.
  - *Esperado:* la sesión de Admin **sigue activa como Dueño** (no se "convierte" en cajero ni te saca). Cada app tiene su propia sesión.

---

## FASE 1 — Personal (crear un trabajador) · *Dueño*

- [ ] Admin → **Personal → Usuarios** → "Nuevo usuario". Crear, por ejemplo, un **cajero adicional** (`cajero2@dev.local`, rol Cajero, clave 8+ chars) y un **trabajador** (rol Trabajador).
  - *Esperado:* aparecen en la lista con su rol y estado Activo.
- [ ] En el cajero2: **PIN** → poner un PIN de 6 dígitos. **Clave** → resetear contraseña.
  - *Esperado:* el botón PIN solo aparece para roles admin/cajero-aprobador; al resetear avisa que deberá cambiarla.
- [ ] **Desactivar** al trabajador → reactivar.
  - *Esperado:* cambia el estado; el sistema NO te deja desactivar al único Dueño ni a vos mismo.
- [ ] Al crear/editar un empleado, cargá **Fecha de vinculación** y **Salario diario** (sección "Empleo (para la nómina)").
- [ ] **Personal → Asistencia** → registrar entrada/salida del trabajador (esos días alimentan la nómina).
- [ ] **Personal → Nómina quincenal** → ver la quincena actual: por empleado, días trabajados × salario diario = a pagar. Probá "Quincena anterior/actual".

---

## FASE 2 — Catálogo (en orden: insumos → subproducto → productos)

### 2.1 Insumos · Admin → Catálogo → Insumos
Crear estos (mirá que el recuadro guía muestre "1 compra = N receta"):

- [ ] **Pollo** — compra `kg`, receta `g`, factor **1000**, mínimo 500.
- [ ] **Pan** — compra `paquete`, receta `unidad`, factor **10**, mínimo 10.
- [ ] **Especias** — compra `kg`, receta `g`, factor **1000**, mínimo 100.
  - *Esperado:* aparecen en la lista; columna "Último costo" en "—" (todavía sin compras).

### 2.2 Subproducto · Admin → Catálogo → Subproductos
- [ ] **Salsa Nashville** — rendimiento **10** (porciones), unidad `porción`. Guardar.
- [ ] Entrar a su **Receta** → agregar Especias 50 g (merma 0). Guardar.
  - *Esperado:* abajo aparece "Costo estimado por unidad" (saldrá "—" hasta que Especias tenga costo).

### 2.3 Productos · Admin → Catálogo → Productos
- [ ] **Alitas Terco** (tipo *con receta*) — precio venta **9000**. (la usaremos para verificar el costo FIFO exacto)
  - Receta: Pollo **600 g** (merma 0).
- [ ] **Hamburguesa Nashville** (tipo *con receta*) — precio **18000**.
  - Receta: Pollo 200 g + Pan 1 u + Salsa Nashville 1 porción.
- [ ] **Gaseosa** (tipo *reventa directa*) — precio **4000**. Unidad compra `caja`, venta `unidad`, factor **24**, mínimo 12.
- [ ] **Combo Terco** (tipo *combo*) — precio combo **20000** = Hamburguesa + Gaseosa.
  - *Esperado:* en combo se ve "suma de componentes" y el ahorro.
- [ ] (Opcional) un producto **con variantes** (tamaños/proteína) con receta de variante, para ver el costo por variante.

---

## FASE 3 — Compras (proveedor + facturas) · el corazón del costo

### 3.1 Proveedor · Admin → Compras → Proveedores
- [ ] Crear **Distribuidora Demo** (NIT, teléfono).

### 3.2 Facturas (cargar costo + stock) · Admin → Compras → Facturas → Nueva
> Podés subir foto (la IA extrae) o cargar manual. Para el QA exacto, usá estos valores.

- [ ] **Factura 1** — Distribuidora Demo:
  - Pollo: **1 kg a $8.000** (total 8.000)
  - Pan: 5 paquetes a $10.000 (total 50.000)
  - Especias: 1 kg a $30.000
  - Gaseosa: 2 cajas a $36.000 (total 72.000)
  - Confirmar.
  - *Esperado:* "Confirmar y sumar al inventario" OK. En **Insumos** el "Último costo" se llena. En **Inventario → Movimientos** aparecen las compras.
- [ ] **Factura 2** — solo **Pollo: 1 kg a $12.000** (precio distinto a propósito). Confirmar.
  - *Esperado:* ahora hay 2 lotes de pollo (1000 g @ $8/g y 1000 g @ $12/g).

---

## FASE 4 — Inventario

- [ ] **Existencias:** Pollo 2.000 g, Pan 50 u, Gaseosa 48 u, Especias 1.000 g; con su "Último costo".
- [ ] **Movimientos:** filtrar por **Pollo** → 2 compras. Filtrar por **producto Gaseosa** → su compra (verifica el filtro por producto, antes roto).
- [ ] **Ajuste / merma:** entrar a un insumo → registrar una **merma** (ej. 50 g de pollo dañado).
  - *Esperado:* baja el stock; queda registrado como WASTE.
- [ ] **Stock inicial (guard):** intentar registrar "Stock inicial" en un insumo que ya tiene movimientos.
  - *Esperado:* lo **rechaza** ("ya tiene Stock inicial; usá ajuste manual").

---

## FASE 5 — Promociones (opcional) · Admin → Catálogo → Promociones
- [ ] Crear una promo **% de descuento** sobre Gaseosa (días/horas/fechas que cubran "ahora").
  - *Esperado:* en el POS, al agregar Gaseosa, se ve el precio tachado con el descuento.

---

## FASE 6 — Venta en mostrador (POS) · `cajero@dev.local` (3002)

- [ ] Login POS como cajero → **Abrir caja** (efectivo inicial, ej. 50.000).
  - *Esperado:* una sola caja por negocio; si ya hay una abierta, no deja abrir otra.
- [ ] **Venta 1:** agregar **1 Alitas Terco** → Cobrar **efectivo** (recibido ≥ total) → confirmar.
  - *Esperado:* recibo con número de **turno**, vuelto correcto, descuenta stock. (Pollo: 600 g del lote @ $8 → costo real $4.800.)
- [ ] **Venta 2:** otra **1 Alitas Terco** → cobrar **digital** (Nequi) con la doble verificación.
  - *Esperado:* exige confirmar app + comprobante. (Pollo: 400 g @ $8 + 200 g @ $12 = **$5.600** → cruza lotes, esto es FIFO.)
- [ ] **Venta 3:** un **Combo Terco** → cobrar.
- [ ] **Anular:** anular la Venta 1 (PAGADA, no iniciada en cocina) con PIN.
  - *Esperado:* pide PIN + motivo; repone el stock; queda registrada la anulación. (Solo se pueden anular ventas PAGADAS no iniciadas.)

---

## FASE 7 — Pedido web + WhatsApp · Web (3000) → POS

- [ ] En la **Web** (3000, sin login): armar un pedido para **recoger** (WEB_PICKUP), datos del cliente (teléfono +57…), confirmar.
  - *Esperado:* pantalla de seguimiento + instrucciones de pago. (WhatsApp en dev = "mock", queda en logs del API.)
- [ ] En el **POS** → bandeja de **pedidos web** → confirmar el pago.
  - *Esperado:* exige caja abierta; al confirmar entra a cocina y se notifica "pago recibido".

---

## FASE 8 — Cocina (KDS) + Pantalla pública

- [ ] **KDS** (Flutter) login `cocinero@dev.local` → ver los pedidos pagados → **Iniciar** → **Marcar listo**.
  - *Esperado:* el pedido cambia de estado; "marcar listo" dispara WhatsApp "listo para retirar" (mock).
- [ ] **POS → Turnos:** llamar el turno listo a la **Pantalla pública** (3005).
  - *Esperado:* la pantalla muestra el número con flash + campana.

---

## FASE 9 — Cierre de caja · POS (cajero)

- [ ] POS → **Cerrar turno** → contar efectivo por denominación (arqueo) / conteo ciego → cerrar.
  - *Esperado:* compara contado vs esperado (apertura + ventas efectivo + entradas − salidas); marca el descuadre si lo hay.
- [ ] (Opcional) registrar una **entrada/salida de efectivo** del cajón antes de cerrar.

---

## FASE 10 — Reportes (el premio) · Admin → Dueño

- [ ] **Ventas:** ver serie + desglose por tipo y método de pago.
- [ ] **Productos:** ranking "más vendidos" con margen estimado (último costo).
- [ ] **Operación:** cobertura WhatsApp, IA, mapa de calor.
- [ ] ⭐ **Costos y margen real** (solo Dueño) — **verificación FIFO exacta**:
  - **Estado de resultados:** ingresos = suma de las ventas válidas; **costo real** = costo FIFO; ganancia = ingresos − costo − merma.
  - **Margen real por producto:** *Alitas Terco* con 2 unidades vendidas → **costo real = $4.800 + $5.600 = $10.400** (¡cruzó lotes!). Si anulaste la Venta 1, queda 1 unidad y costo $5.600. La merma de pollo aparece valorizada.
  - **Inventario valorizado:** el pollo restante a su costo real de lote.
  - *Esperado:* los números cuadran con la realidad; si algún insumo quedó sin costo, lo **avisa** (no pone $0).
- [ ] **Anomalías** (Dueño) y **Reconciliación** (subir un CSV de prueba).

---

## FASE 11 — Roles y permisos

- [ ] Cerrar sesión del Dueño en Admin → login `admin@dev.local` (Admin operativo).
  - *Esperado (NO debe ver):* Usuarios, Auditoría completa, Anomalías, **Costos y margen real**.
  - *Esperado (SÍ debe ver):* Catálogo, Compras, Inventario, Caja, Personal (asistencia/nómina), Ventas/Productos/Operación, **Bitácora**, **Reconciliación**, **Sugerencias IA**.

---

## FASE 12 — Trazabilidad

- [ ] Admin (Dueño) → **Bitácora** → filtrar por categorías (Caja, Anulaciones, Cajón, Aprobaciones, Sesiones, Cocina).
  - *Esperado:* se ve, en lenguaje claro, todo lo hecho en el QA.
- [ ] **Auditoría completa** (Dueño): el registro técnico inmutable.

---

## Anexo — Resumen de la verificación de costo (para chequear los números)

| Acción | Efecto en costo (FIFO) |
|---|---|
| Compra Pollo 1 kg @ $8.000 | lote 1: 1.000 g a **$8/g** |
| Compra Pollo 1 kg @ $12.000 | lote 2: 1.000 g a **$12/g** |
| Vender 1 Alitas (600 g) | consume 600 g del lote 1 → costo **$4.800** |
| Vender otra Alitas (600 g) | 400 g @ $8 + 200 g @ $12 → costo **$5.600** (cruza lotes) |
| Merma 50 g | sale del lote más viejo disponible, valorizada a su costo |
| Anular venta | repone el stock al costo exacto; esa venta no cuenta en el P&L |

> Si los números del reporte **Costos y margen real** coinciden con esta tabla, el costeo funciona perfecto de punta a punta.

---

## Cómo volver a dejar la base limpia (repetir el QA)

```bash
cd apps/api
# Requiere consentimiento explícito (acción destructiva):
PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="<tu confirmación>" pnpm prisma migrate reset --force --skip-seed
pnpm dlx tsx prisma/seed-users.ts
```
