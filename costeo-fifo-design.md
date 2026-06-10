# Diseño técnico — Costeo real FIFO por lote (COGS)

> **Estado:** propuesta para aprobación. **No implementado.** Autor: sesión de auditoría 2026-05-25.
> **Decisiones tomadas con el dueño:** método **FIFO por lote**; arrancar por **diseño** antes de codear.
> **Contexto clave:** los **precios de venta son fijos**. El objetivo NO es fijar precios (costo de reposición), sino **medir cuánto costó realmente lo vendido** (COGS) con trazabilidad por lote, para tener claridad financiera del negocio.

---

## 1. Objetivo

Responder con exactitud, en cualquier período:

- ¿Cuánto me **costó realmente** lo que vendí? (COGS real, no estimado con "último precio")
- ¿Cuánto **gané de verdad** por producto y en total? (precio fijo − COGS real)
- ¿Cuánto vale **hoy** mi inventario? (a costo real de los lotes que quedan)
- ¿Cuánta plata **perdí en mermas**? (valorizada al costo del lote consumido)
- ¿De qué **lote** salió lo que consumí y a qué costo?

El método es **FIFO** (first-in, first-out): se consume primero el lote más viejo, a su costo real. Es lo más fiel para perecederos rotados y el único que da trazabilidad por lote (el promedio ponderado disuelve los lotes).

---

## 2. Qué ya existe y sirve de base

Nada de esto hay que reconstruirlo — es exactamente el sustrato de FIFO:

- **`inventory_movements`** (insert-only, con trigger que bloquea UPDATE/DELETE): compras (`PURCHASE` +), ventas (`SALE` −), merma (`WASTE` −), ajustes (`MANUAL_ADJUSTMENT` ±), carga inicial (`INITIAL` +). Ordenados por `createdAt`. Polimórfico (`entityType` INGREDIENT|PRODUCT).
- **Trazabilidad de origen**: `sourceType`/`sourceId` ya conectan cada movimiento a su causa:
  - `PURCHASE` → `sourceType:'invoice'`, `sourceId: invoiceId` (`invoices.service.ts:341`).
  - `SALE` → `sourceType:'sale'`, `sourceId: saleId` (`sales.service.ts:363`).
- **`expandRecipe`** (`@pos-tercos/domain`): dado un producto/venta, calcula cuánto de cada **insumo** consume (aplicando merma y `yield` de subproductos transitivamente). Ya alimenta el descuento de stock al vender.
- **Reversión de anulaciones**: al anular una venta `PAGADO`, se crean movimientos `SALE` compensatorios (delta positivo) con el mismo `sourceId` (`sales.service.ts:811-844`).

---

## 3. La brecha (lo único que falta en los datos)

**Los movimientos NO guardan el costo unitario.** El costo vive en `invoice_items.unitPrice` (en `unit_purchase`, ej. $/caja). Hoy solo se persiste `ingredient.lastUnitCost` / `product.lastUnitCost` (el ÚLTIMO precio), que se sobrescribe en cada factura → imposible reconstruir el costo histórico por lote.

**Para FIFO, cada entrada de stock (PURCHASE / INITIAL / ajuste positivo) debe llevar su costo unitario**, en la **misma unidad que `delta`** (unidad de receta/stock).

Conversión: `unit_cost_stock = invoice_item.unitPrice / conversionFactor`
(es exactamente la fórmula que ya usa `compute-cost.ts`: `lastUnitCost / conversionFactor`).

---

## 4. Cambios de modelo de datos

### 4.1 Migración A — costo unitario en el movimiento

```
inventory_movements
  + unit_cost   Decimal(14,4)  NULL   // costo por unidad de stock/recipe; solo entradas (delta > 0)
```

- Se llena en creación para `PURCHASE`, `INITIAL` y ajustes manuales positivos.
- `NULL` permitido = "lote sin costo conocido" (facturas viejas sin item mapeable, INITIAL sin costo declarado). Se propaga como "costo desconocido" en los reportes (igual que hoy hace `lastUnitCost = null`).
- En consumos (`SALE`, `WASTE`, ajuste negativo) queda `NULL` — su costo lo determina el motor FIFO al consumir lotes.

### 4.2 Migración B (opcional, recomendada para exactitud por producto) — atribución de consumo

Hoy un movimiento `SALE` es **por insumo, por venta** (agregado de todos los ítems de esa venta) → no se puede saber qué **producto** consumió qué. Para **COGS exacto por producto** se necesita etiquetar el consumo:

```
inventory_movements
  + sale_item_id  String  NULL   // o product_id de consumo
```

- Solo aplica de aquí en adelante (las ventas históricas no lo tienen → para ellas el COGS por producto se atribuye proporcionalmente, ver §6.3).
- Implica cambiar `confirmPayment` para expandir y registrar el consumo **por `sale_item`** en vez de agregado. Es un cambio acotado pero toca el camino crítico de venta → se hace con cuidado y tests.

> **Decisión abierta D1:** ¿hacemos B ahora (COGS exacto por producto desde ya) o lo diferimos (COGS exacto a nivel insumo/período + por producto proporcional)? Recomendación: hacer B, porque "margen real por producto" es justo lo que pediste.

### 4.3 Backfill (datos históricos)

Script idempotente, una vez:

1. Para cada `PURCHASE` con `sourceType:'invoice'`: buscar su `invoice_item` (por `invoiceId` + entidad). Si hay 1 match → `unit_cost = item.unitPrice / conversionFactor`. Si hay ambigüedad (varios items del mismo insumo en una factura) → registrar y resolver manual o prorratear.
2. `INITIAL` histórico: sin fuente de costo. Opciones: (a) dejar `NULL`, (b) usar el `lastUnitCost` vigente del insumo a esa fecha si existe. Recomendación: `NULL` + reporte que lo liste para que el dueño lo complete si quiere.
3. Ajustes manuales positivos históricos: `NULL` (no había costo).

El backfill NO viola el insert-only: es un `UPDATE` de una columna nueva sobre filas existentes, ejecutado una vez en la migración (el trigger se puede suspender para la migración o la columna se llena en la creación de la tabla nueva — definir en implementación).

---

## 5. El motor FIFO (función pura, `@pos-tercos/domain`)

Determinístico y testeable. Reproduce ("replay") el ledger **por insumo** en orden cronológico.

### 5.1 Estructura

```
costFifo(movements: LedgerMovement[]): FifoResult

LedgerMovement = { id, createdAt, delta, type, unitCost|null, sourceType, sourceId, saleItemId? }

FifoResult = {
  consumptions: Array<{          // un registro por cada consumo (SALE/WASTE/ajuste−)
    movementId, createdAt, type, qty,
    cost: number | null,         // costo FIFO real del consumo
    sourceId, saleItemId?,       // para atribuir a venta/producto
    unknownQty: number,          // qty que no se pudo costear (lotes sin costo / faltantes)
  }>,
  remainingLots: Array<{ purchaseMovementId, qty, unitCost, createdAt }>, // inventario valorizado
}
```

### 5.2 Algoritmo

```
cola = []   // FIFO de lotes {qty, unitCost, createdAt, movementId}
para cada mov en movimientos ordenados por createdAt asc:
  si mov es ENTRADA (delta > 0: PURCHASE/INITIAL/ajuste+):
     cola.push({ qty: delta, unitCost: mov.unitCost, ... })   // unitCost puede ser null
  si mov es SALIDA (delta < 0: SALE/WASTE/ajuste−):
     restante = |delta|; costo = 0; desconocido = 0
     mientras restante > 0 y cola no vacía:
        lote = cola[0]
        toma = min(restante, lote.qty)
        si lote.unitCost == null: desconocido += toma
        si no: costo += toma * lote.unitCost
        lote.qty -= toma; restante -= toma
        si lote.qty == 0: cola.shift()
     si restante > 0:   // consumí más de lo que el ledger conoce (stock negativo)
        desconocido += restante   // política: marcar como costo desconocido
     registrar consumption { qty:|delta|, cost: desconocido>0 ? parcial/null : costo, unknownQty: desconocido }
```

### 5.3 Casos borde (todos contemplados)

- **Reversión de anulación (void)**: el movimiento `SALE` compensatorio tiene `delta > 0` → entra como ENTRADA. Para no inventar costo, su `unit_cost` se setea al **costo FIFO del consumo que revierte** (se puede resolver en el replay: una reversión re-inyecta exactamente los lotes/costos que el SALE original sacó). Decisión de implementación: o (a) reversión = entrada al costo promedio del consumo original, o (b) el motor reconoce pares SALE↔reversión por `sourceId`. Recomendado (b) para exactitud.
- **Merma (`WASTE`)**: consume FIFO igual que una venta; su `cost` es la **merma valorizada**. No es COGS de venta (se reporta aparte como pérdida).
- **Ajuste manual −**: consume FIFO (corrección de inventario). **+**: entra como lote; su `unit_cost` debería pedirse al crear el ajuste (decisión D2) o quedar `NULL`.
- **Lotes sin costo (`unitCost null`)**: el consumo acumula `unknownQty`; el reporte muestra "costo parcialmente desconocido" en vez de mentir con $0.
- **Consumo > stock conocido** (stock negativo por descuadre): el sobrante va a `unknownQty` y se marca; señal de disciplina de inventario.
- **Unidades**: todo en unidad de receta/stock; `unit_cost` se guarda en esa unidad → multiplicación directa.

---

## 6. Atribución: de insumos a ventas, productos y períodos

### 6.1 COGS por venta
COGS(venta) = Σ `cost` de las `consumptions` con `sourceId = saleId` y `type=SALE`.
Margen(venta) = `sale.total` − COGS(venta).

### 6.2 COGS por período / P&L
- COGS período = Σ `cost` de consumptions `SALE` con `sale.paidAt` en el rango (excluyendo VOID, igual que los reportes actuales).
- **P&L** = ventas (revenue) − COGS real − merma valorizada (Σ `cost` de consumptions `WASTE` del período).

### 6.3 COGS por producto
- **Con Migración B** (consumo etiquetado por `sale_item`/producto): exacto. COGS(producto) = Σ `cost` de consumptions cuyo `saleItemId` pertenece a ese producto.
- **Sin B** (histórico): proporcional — se reparte el COGS por insumo entre los productos que lo usaron esa venta, según `expandRecipe`. Aproximado pero razonable.

### 6.4 Subproductos y combos
- El consumo ya se registra a nivel **insumo** (expandRecipe disuelve subproductos y combos hasta insumos). FIFO opera sobre insumos → el roll-up a producto/combo es automático.

### 6.5 Valor de inventario
Valor = Σ (`remainingLots.qty × unitCost`) por insumo. Lotes sin costo → "valor parcialmente desconocido".

---

## 7. Reportes / UI (admin, rol Dueño/Admin según sensibilidad)

| Reporte | Qué muestra | Fuente |
|---|---|---|
| **Margen real por producto** | Revenue, COGS real, margen $ y % por producto/período | §6.3 |
| **P&L del período** | Ventas − COGS real − merma valorizada | §6.2 |
| **Costo por lote** | Cada compra: costo, consumido, queda, valor restante | FifoResult.remainingLots |
| **Inventario valorizado** | Valor actual de bodega a costo real | §6.5 |
| **Merma valorizada** | Pérdida $ por mermas, por insumo/período | consumptions WASTE |
| **Ventas con costo desconocido** | Ventas/insumos con `unknownQty>0` (señal de datos faltantes) | unknownQty |

Reemplaza/complementa el actual `/reports/products` (que usa "último costo" estimado) con el COGS real.

---

## 8. Fases de implementación (incremental y verificable)

1. **Datos**: Migración A (`unit_cost`) + capturar costo en compras/INITIAL/ajustes nuevos + backfill histórico. *(Sin cambio de comportamiento visible.)*
2. **Motor**: `costFifo` puro en `@pos-tercos/domain` + suite de tests Vitest (lotes, FIFO multi-lote, reversión, merma, sin-costo, stock negativo).
3. **(Si D1=sí) Migración B** + cambio de `confirmPayment` para consumo etiquetado por `sale_item` + tests del camino de venta.
4. **Reportes backend**: servicio COGS + endpoints (margen real por producto, P&L, inventario valorizado, merma).
5. **UI admin**: páginas de reportes nuevas + valor de inventario + merma valorizada.
6. **(Opcional futuro) Modelo B "capas persistentes"**: tabla `cost_layers` viva para margen por venta en tiempo real, si el replay se queda corto.

---

## 9. Salvedad que define la exactitud

FIFO es tan exacto como la **disciplina de inventario**. Si hay merma/robo/conteos sin registrar, el "queda en bodega" del sistema se desalinea de la realidad y el costo deriva. Requiere registrar mermas y ajustes con constancia (el módulo de inventario ya lo permite). El reporte "costo desconocido / stock negativo" (§7) es justamente el termómetro de esa disciplina.

---

## 10. Decisiones abiertas (para confirmar antes de codear)

- **D1 — COGS exacto por producto**: ¿incluimos Migración B (etiquetar consumo por `sale_item`, toca el camino de venta) para tener margen real por producto exacto desde ya? *(Recomendado: sí.)*
- **D2 — Ajuste manual + e INITIAL**: ¿pedir costo unitario al cargar stock inicial / ajuste positivo (más exacto) o permitir `NULL`? *(Recomendado: pedir costo en INITIAL; `NULL` permitido en ajustes con aviso.)*
- **D3 — Reversión de anulación**: ¿emparejar SALE↔reversión por `sourceId` para devolver el costo exacto (más preciso) o reinyectar a costo promedio del consumo? *(Recomendado: emparejar.)*
- **D4 — Productos `directResale`**: entran al mismo FIFO (ya son stockables). Confirmar que sí.
- **D5 — Rol de los reportes**: ¿Dueño-only (como anomalías) o Admin+Dueño? *(P&L y márgenes son sensibles → sugiero Dueño-only.)*
```
