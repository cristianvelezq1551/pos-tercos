# POS Comida Rápida — Brief Técnico v1

> Documento maestro de Fase 1. Cierra el alcance del MVP, declara qué NO entra, y abre los GAPs que se resolverán en Fase 2 (grill-me).

---

## 1. Resumen del negocio (5 líneas)

1. Restaurante de comida rápida en mostrador (estilo McDonald's), Colombia, 1 punto de venta.
2. Venta inmediata: cliente pide, paga, recibe turno, se va con el pedido o lo recoge cuando esté listo.
3. Operación con 1 cajero por turno + cocina con KDS, sin sistema previo (parto de cero).
4. Equipo de desarrollo: yo solo + Claude Code; presión de plazo: 1-2 meses para tener v1 vendiendo.
5. Stack: NestJS + Next.js + Postgres en monorepo, online-first con tolerancia a caídas de internet en tienda.

## 2. Objetivo del MVP v1 (1 frase)

**Vender en tienda y por web pública con control total de inventario por receta, en producción dentro de 8 semanas, sin pasarela de pagos ni facturación electrónica.**

## 3. Alcance v1 (lista cerrada)

Solo entra a v1 lo que está aquí. Cualquier cosa fuera de esta lista vive en v2 hasta nuevo aviso.

### 3.1 Apps shippeables
- **POS Cajero** (tienda, online + offline) — toma de pedido, cobro, impresión, apertura de cajón, cierre de caja.
- **KDS Cocina** (tienda, online + offline) — pantalla con tarjetas por orden, tap para cambiar estado, tiempos por etapa.
- **Pantalla Pública de Turnos** (tienda, read-only) — números preparándose / listos.
- **Web Pública de Pedidos** (online-only) — menú, carrito, checkout sin login (nombre, número, dirección si domicilio).
- **Admin / Dueño** (online) — productos, recetas, inventario, reportes, alertas, auditoría.

### 3.2 Funcionalidades de negocio (núcleo v1)
- Catálogo de productos con tamaños, combos y modificadores opcionales por producto.
- Promociones simples (por hora y por día) — aplicación automática al pasar al carrito.
- Costeo por receta con árbol producto → subproducto → insumo, con yields y mermas. Descuento de inventario al confirmar venta.
- Inventario con ledger inmutable de movimientos (entrada por factura, salida por venta, ajuste manual auditado).
- Alertas de stock crítico visibles en POS y Admin.
- Carga de facturas de proveedor por IA (foto/PDF → ítems + NIT + IVA). Sin entrada manual en formulario.
- Pagos en tienda: efectivo (con apertura de cajón) y digital (Nequi / Daviplata / QR Bancolombia / transferencia) con confirmación visual del cajero.
- Pedido por web: estado `PENDIENTE_PAGO` → WhatsApp con instrucciones → cajero confirma → `PAGADO` → KDS → notificaciones de avance al cliente.
- Domicilio propio (sin app de repartidor: el cajero/admin asigna y marca entregado).
- Cierre de caja con conteo de efectivo, comparación contra esperado, alerta de descuadre al dueño.
- Anti-fraude básico: log inmutable de anulaciones, descuentos manuales, correcciones de inventario, aperturas de cajón sin venta.
- Reportes operativos básicos (ventas, top productos, hora pico, COGS por plato, descuadres) — gráficos sin narrativa IA.
- Web de trabajadores (RRHH ligero): registro de asistencia, pago por día o mensual, nómina simple.

### 3.3 Hardware soportado
- Impresora térmica (ESC/POS) conectada al POS — driver vía servicio local en la máquina del cajero.
- Cajón monedero accionado por la térmica.
- Pantalla pública: tablet o TV (decisión hardware en GAP-6).

## 4. No-objetivos v1 (lista explícita)

- ❌ Facturación electrónica DIAN.
- ❌ Pasarela de pagos / datáfono integrado.
- ❌ Lector de código de barras.
- ❌ Integración con Rappi / Didi / Uber Eats.
- ❌ App nativa (todo es web/PWA).
- ❌ Login / cuentas / fidelización para cliente final.
- ❌ Multi-tienda, multi-cajero simultáneo, multi-tenant.
- ❌ App de repartidor (asignación de domicilio se hace desde el admin/POS).
- ❌ IA narrativa en reportes financieros y operativos.
- ❌ Auto-pedido a proveedor por WhatsApp/email cuando cae el stock.
- ❌ Detección anómala con IA en anti-fraude (solo logs auditables).
- ❌ Alertas avanzadas de inventario (vencimientos, rotación lenta, consumo anómalo).
- ❌ Sugerencias de causa de descuadre por IA en cierre de caja.
- ❌ Catálogo de proveedores con contactos y términos.
- ❌ Permisos granulares por feature (solo roles fijos: cajero / cocinero / admin-dueño / trabajador).

## 5. v1 vs v2 — Qué se difiere y por qué

| Diferido a v2 | Razón |
|---|---|
| DIAN | Implementación regulatoria + certificación con proveedor toma 4-6 semanas y bloquea ventas si falla. v1 imprime recibo interno; v2 hace facturación. |
| Pasarela de pagos | No hay urgencia: el negocio ya cobra por Nequi/Bancolombia hoy. Confirmación manual cubre v1. |
| Rappi / agregadores | Solo si el negocio decide entrar a estas plataformas. Arquitectura deja puerto/adapter listo. |
| IA narrativa (estados financieros, reportes operativos, sugerencias de descuadre) | No genera valor el primer mes: requiere acumular datos. Costo IA mensual sin ROI claro. |
| Auto-pedido a proveedor | Requiere catálogo de proveedores y aprobación humana. Mes 2-3, no es bloqueante para vender. |
| Alertas avanzadas (vencimientos, rotación, anomalías) | Necesitan histórico (mínimo 4-8 semanas de datos) para ser útiles. |
| Detección anómala anti-fraude por IA | v1 deja audit logs completos; v2 le pone IA encima. |
| App de repartidor | Domicilio propio en v1 se gestiona desde admin (1 repartidor o cajero llamando). |
| Fidelización / CRM | Producto separado, no es parte del flujo de venta. |
| Permisos granulares | Roles fijos cubren v1; granularidad llega cuando haya múltiples turnos y empleados. |

## 6. Stack confirmado

| Capa | Tecnología | Notas |
|---|---|---|
| Backend | NestJS (TypeScript) | API REST + WebSocket (KDS, pantalla pública, sync). |
| Frontend | Next.js (App Router) | 4 superficies separadas dentro del monorepo. |
| DB | PostgreSQL (managed) | Único origen de verdad. |
| Persistencia local POS/KDS | IndexedDB (PWA) o SQLite local (decisión en GAP-2) | Cola de operaciones offline. |
| Realtime | WebSocket nativo de NestJS o socket.io | Para KDS y pantalla pública. |
| Tiempo de respuesta | — | Hardware local maneja impresora; backend remoto maneja datos. |
| Monorepo | Turborepo o Nx | Comparte tipos entre apps. |
| IA (facturas) | Modelo multimodal (decisión en GAP-10) | Solo procesamiento de facturas en v1. |
| WhatsApp | Cloud API o Twilio (decisión en GAP-3) | Notificaciones transaccionales. |
| Despliegue | Vercel (frontends) + Railway/Render/Fly (backend + DB) | Definir en Fase 3. |

## 7. Las 5 apps (responsabilidad en una línea)

1. **POS Cajero** — toma de pedido, cobro, impresión y cierre de caja en mostrador, con operación offline.
2. **KDS Cocina** — pantalla en cocina que recibe órdenes y permite cambiar el estado por etapas con un tap.
3. **Pantalla Pública de Turnos** — display read-only para que el cliente vea su número listo o en preparación.
4. **Web Pública de Pedidos** — sitio del negocio donde el cliente arma el pedido (recoger o domicilio) sin login.
5. **Admin / Dueño** — panel para gestionar productos, recetas, inventario, alertas, reportes y auditoría.

> **Nota:** la "Web de trabajadores" (RRHH ligero) está dentro del Admin como módulo, no es app separada. Lo confirmamos en grilling.

## 8. Tabla de funcionalidades F-A…F-P

| ID | Feature | Propuesta | Justificación |
|---|---|---|---|
| F-A | Alertas de stock crítico (POS + Admin) | **V1** | Base operativa. Sin esto el inventario es ciego. Implementación barata sobre el ledger. |
| F-B | Auto-pedido a proveedor (WhatsApp/email) | **V2** | Requiere catálogo de proveedores y workflow de aprobación. v1 alerta y dueño escribe manual. |
| F-C | Carga de facturas por IA (foto/doc) | **V1** | Bloqueante para alimentar [F-D] sin fricción. **Riesgo de plazo — ver GAP-1.** |
| F-D | Costeo por receta (árbol producto/subprod/insumo) | **V1** | Columna vertebral. Sin esto no hay margen, ni reportes, ni decisiones de menú. |
| F-E | Alertas avanzadas (vencimientos, rotación, anomalías) | **V2** | Necesita histórico para ser útil. Vencimientos básicos pueden colarse a v1 si sobra tiempo. |
| F-F | IA estados financieros narrativos | **V2** | Cero ROI en el mes 1. Costo IA recurrente sin retorno. |
| F-G | IA reportes operativos narrativos | **V2** | Reportes con gráficos cubren v1; narrativa es cosmética sin datos acumulados. |
| F-H | Web pública con WhatsApp + pago manual + estados | **V1** | Pedida explícitamente. Es un canal de venta nuevo, no opcional. |
| F-I | Gestión productos + recetas (UX) | **V1** | Sin esto no hay nada que vender ni medir. UX prioritaria. |
| F-J | UX simple para cajero | **V1** | Cero curva. Cajero rota, no se entrena 3 días. |
| F-K | Cierre de caja con comparación + alerta | **V1 (sin IA) / V2 (con IA)** | El conteo y la alerta de descuadre son v1; la sugerencia de causa por IA es v2. |
| F-M | Anti-fraude | **V1 (logs + reportes) / V2 (IA anómala)** | v1: log inmutable de anulaciones/descuentos/cajón/correcciones + reporte por cajero. v2: detección. |
| F-N | Pantalla pública de turnos | **V1** | Pedida explícitamente. Implementación simple sobre el bus de eventos del KDS. |
| F-P | Uso de IA con costo contenido | **Directriz transversal** | No es feature; es regla. Solo IA en facturas en v1. Cap mensual definido en Fase 2. |

**Conteo v1 estricto:** F-A, F-C, F-D, F-H, F-I, F-J, F-K (parcial), F-M (parcial), F-N. Todo lo demás → v2.

## 9. GAPs — Ambigüedades reales por criticidad

> Estos son los puntos que **bloquean arquitectura** o **mueven el plazo** si no se resuelven antes de Fase 3. Se atacan en Fase 2 (grill-me).

### Críticos (bloquean diseño)

- **[GAP-1] IA de facturas como única vía de carga.** Si la IA falla en una factura (foto borrosa, formato raro), ¿el inventario queda parado? ¿Hay fallback de "carga manual de emergencia" oculto al usuario regular? Esta decisión define si [F-C] entra a v1 o se difiere y se permite carga manual en v1.
- **[GAP-2] Estrategia offline.** ¿El POS es web/PWA pura con IndexedDB + service worker, o app local (Electron / Tauri / app nativa) con SQLite local? La impresora térmica vía web requiere o un servicio HTTP local o WebUSB/WebSerial (no soportado en todos los navegadores). Esto define la arquitectura del POS.
- **[GAP-5] Hardware de impresora térmica.** ¿Marca/modelo elegido? ¿Conexión USB / Ethernet / Bluetooth? Esto determina driver y si el POS puede ser navegador puro o necesita un agente local.
- **[GAP-7] Unidades de medida en recetas.** Pollo se compra por kg, la receta usa "1 unidad de 180g". ¿El sistema modela conversión kg↔unidad por insumo? ¿Mermas configurables por insumo (ej. 5% de pérdida en limpieza)? ¿Yields por subproducto (ej. 1 kg pollo crudo → 7 unidades de 180g cocido)?

### Altos (afectan timeline o costo)

- **[GAP-3] Proveedor de WhatsApp.** Cloud API oficial (Meta) requiere número aprobado + plantillas pre-aprobadas + costos por conversación + tiempo de aprobación. Twilio es más caro pero arranca en horas. Librerías no oficiales (Baileys) son gratis pero con riesgo real de baneo del número del negocio. Se necesita decisión que balancee plazo vs costo vs riesgo.
- **[GAP-4] Validación visual del pago digital.** ¿El cajero ve la app de Nequi/Bancolombia del cliente? ¿Pide screenshot? ¿Tiene la app del negocio abierta y verifica saldo? ¿Qué fricción hay en hora pico? Esto afecta la UX del POS y los controles anti-fraude (un cajero malicioso podría aceptar comprobantes falsos).
- **[GAP-6] Hardware de pantalla pública.** Tablet de 10" + soporte (~$300-500k COP), TV con Chromecast/HDMI stick (~$700k-1.2M COP), o mini-PC + monitor (más caro y más complejo). Decisión afecta deployment y mantenimiento.
- **[GAP-9] Roles y permisos.** ¿Hay distinción entre **dueño** y **admin operativo**? El anti-fraude solo funciona si quien aprueba ajustes de inventario / anulaciones no es la misma persona que vende. v1 propuesto: cajero, cocinero, admin (dueño), trabajador. ¿Es suficiente o falta admin operativo?
- **[GAP-12] Domicilio propio.** ¿Cuántos repartidores en v1 (1, 2, "depende del día")? ¿La asignación es del cajero/admin manual, o auto-asigna al disponible? ¿El repartidor confirma entrega desde su celular (entonces sí necesita app/web mínima) o el admin lo hace por él? Esto puede expandir el scope.

### Medios (decisiones que se pueden tomar más adelante)

- **[GAP-8] Catálogo de proveedores (para [F-B] en v2).** Aunque la feature es v2, conviene saber si en v1 al menos guardamos NIT + nombre del proveedor extraído de la factura para no perder esos datos.
- **[GAP-10] Modelo de IA y costo mensual.** ¿Cuál modelo para [F-C]? Costo estimado mensual depende de # facturas procesadas/mes. Necesito asunción de volumen (ej. 50, 100, 300 facturas/mes) para estimar.
- **[GAP-11] Despliegue.** Vercel + Railway / Render / Fly.io. Costo mensual estimado y región (Sudamérica para latencia). Decidible en Fase 3.
- **[GAP-13] Promociones por hora y día.** ¿Cómo se aplican en POS — automáticas al cumplir condición o el cajero las elige? ¿Acumulables con combos? ¿Quién las edita (admin)? Esta decisión afecta la complejidad del motor de pricing.
- **[GAP-14] Recibo interno sin DIAN.** Verificar requisito legal en Colombia para POS sub-DIAN (umbral RST y obligación de "documento equivalente"). Si hay un mínimo legal, debe estar en el recibo desde v1.
- **[GAP-15] Backups.** Frecuencia, retención, ubicación. Aplica a Postgres + facturas escaneadas. Decidible en Fase 3 pero útil cerrarlo antes.

---

**Estado:** Fase 1 completada con un alcance v1 deliberadamente recortado (solo IA en [F-C]; todo lo demás IA va a v2) y 15 GAPs identificados.

**FASE 1 COMPLETADA, ¿OK, sigue?**
