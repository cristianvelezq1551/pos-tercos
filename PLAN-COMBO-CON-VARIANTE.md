# Plan — combos con componentes con variante

> Rama `feat/combo-componente-variante`. Nacido el 2026-10-20 de una pregunta del
> dueño: armar "2 Papas TERCOS · Pollo y Miel ahumada por $40.000" y que descuente,
> costee y dé margen bien. La condición dura: **lo que hoy funciona en prod no se
> puede mover**. Este documento se escribió ANTES de tocar código.

## 0. El problema

Un combo guarda sus componentes como `producto × cantidad`, sin variante. Los
productos con variantes (Papas TERCOS, Burros, Mac & Papas…) tienen la proteína en
la receta de la VARIANTE, no en la base. Hoy, un combo "Papas TERCOS × 2":

- descuenta solo papas y salsas — **no el pollo**;
- costea solo la base (el margen sale ~80 % cuando el real ronda 55 %);
- la disponibilidad no mira el pollo;
- **nada impide guardarlo**: la validación del combo solo rechaza combos anidados.

## 1. Decisiones del dueño (no re-discutir)

1. **Cualquier combinación fija**: el mismo combo puede llevar productos iguales o
   distintos, cada uno con su variante ("2 Papas · Pollo", "Papas · Pollo +
   Sandwich", "Papas · Pollo + Papas · Mixto", con o sin bebidas). Hoy los combos
   del dueño son siempre de pollo, pero la funcionalidad tiene que permitirlo todo.
   **Fuera de alcance**: que el cliente ELIJA la variante dentro del combo, y
   extras sobre un componente.
2. **Variante obligatoria** si el producto la tiene; prohibida si no la tiene.
3. **La comanda imprime los componentes con su variante**
   ("Papas TERCOS · Pollo y Miel ahumada × 2") **en TODOS los combos**. El Combo
   Double Smash pasa a imprimir también "Double smash × 2": es el único cambio
   visible en lo que ya existe, y es solo papel. El recibo del cliente no cambia.
4. **Canal por producto** (solo web / solo caja / ambos) es OTRA pieza, después de
   esta (ver §8). Mientras tanto un combo se comporta como cualquier producto:
   activo = caja y web.
5. **Si un producto de un combo GANA variantes después** (ej. el Double smash
   pasa a tener "con tocineta"), **el combo se apaga** hasta que lo edites: no se
   ofrece en caja ni web (motivo "Falta elegir la variante de X en el combo"),
   no se puede agregar a un pedido y el cobro lo rechaza. Nunca descuenta ni
   costea con la receta base. Ojo: el servidor NO obliga a elegir variante en una
   venta suelta (eso lo controla la pantalla), así que esta regla es propia del
   combo. Hoy no aplica a nada (ver §2).

## 2. Fase 0 — lo que hay en prod (consulta de solo lectura, 2026-10-20)

| Qué | Resultado |
|---|---|
| Combos | Uno: **Combo Double Smash**, activo, $50.000, sin grupos a elegir |
| Sus componentes | **Double smash × 2** (sin variantes) |
| Opciones de grupos con variantes | Ninguna |
| Ventas de combos | 1 línea, 1 unidad |
| Receta por variante de Papas TERCOS | Pollo 5 líneas · Carne 4 · Mixto 7 |
| Última migración | `20260921120100_promotion_variants_and_fixed_price` (= main) |

**Consecuencia**: ningún combo existente tiene un componente con variantes. La
regla nueva no puede afectar nada de lo que hay, y hasta que se cree el primer
combo con variante el código nuevo recorre el mismo camino que hoy.

⚠️ Aparte: la descripción del Combo Double Smash dice "2 x gaseosa" pero el combo
no descuenta ninguna. O la descripción está vieja, o se entregan gaseosas que el
inventario no registra.

## 3. El diseño

`combo_components.size_id` **opcional** (FK a `product_sizes`, `ON DELETE
RESTRICT`, índice). **Vacío = exactamente lo de hoy.** El precio del combo sigue
siendo su `comboPrice`; el recargo de la variante no participa.

### Los 7 lugares que leen los componentes (inventario verificado en código)

| # | Lugar | Alimenta |
|---|---|---|
| 1 | `sales-consumption.service.ts` — `computeConsumptionSpecs` | cobro, edición de pedido cobrado, venta sin red al sincronizar, cortesía |
| 2 | `recipes.service.ts` — `expandedCost` | ficha del combo, costo de la cortesía |
| 3 | `recipes.service.ts` — `catalogCosts` → `buildCostLookup` | tabla de productos, ganancia por pedido del turno, top de productos |
| 4 | `financial-reports.service.ts` — `catalogMargin` | **equilibrio de la carta** (cálculo PROPIO del combo, no pasa por el 3) |
| 5 | `cogs.service.ts` — `getProductMargins` | reporte de márgenes por producto |
| 6 | `evaluate.ts` (domain) + `loadAvailabilityData` | disponibilidad en caja, web y caja sin red |
| 7 | `recipe-book.service.ts` | biblia de cocina |

Más guardar/borrar en `products.service.ts`: crear combo, `setCombo`, validación y
`setOptions` (borrar una variante).

**Lo que queda bien solo** (verificado): el COGS del estado financiero sale de los
movimientos de inventario por el motor FIFO; anular una venta devuelve lo que se
registró; editar un pedido cobrado topa sus reversos en lo realmente descontado.

## 4. Las promesas y su prueba

| # | Promesa | Cómo se demuestra |
|---|---|---|
| L1 | **Lo de prod no cambia** | Copia de la base de prod (solo lectura) y el API de `main` y el de la rama contra esa copia: las respuestas de todas las pantallas de plata, costos y disponibilidad tienen que ser idénticas |
| L2 | El motor de costos no se mueve | Prueba de oro de 300 historias, sin regenerarla |
| L3 | **El combo descuenta lo mismo que vender sus componentes sueltos** con su variante | Comparar movimientos insumo por insumo: combo vs. sueltas (online, edición, venta sin red y cortesía) |
| L4 | **Un solo costo en todas partes** | Ficha, tabla, tabla con variantes, detalle del turno, top, equilibrio de la carta, margen por producto, cortesía y COGS del mes dan el MISMO número, igual a Σ (costo de cada componente con su variante) |
| L5 | El estado financiero cuadra | La simulación financiera vende combos con variante y la contabilidad sombra lo verifica |
| L6 | Lo que la caja ofrece se puede cobrar | Se acaba el pollo → el combo se apaga y el cobro lo rechaza; se acaba un consumible → no frena |
| L7 | Anular deja todo en cero | Neto por insumo = 0 tras anular |
| L8 | Lo mal configurado no se guarda | Sin variante / variante ajena / variante en producto sin variantes / borrar variante en uso → mensaje claro, nunca un 500 |
| L9 | Un componente que se quedó sin variante no vende | El producto gana variantes → el combo se apaga, no entra a un pedido, el cobro lo rechaza sin descontar; al editar el combo vuelve |

**Regla del proceso**: L3–L9 se escriben ANTES del código y se comprueba que
**fallan en `main`**. Una prueba que nunca falló no demuestra nada.

## 5. Dos entregas

**Entrega 1 — solo API, sin pantalla.** Migración + lectura de la variante en los 7
lugares + validaciones. En prod ningún combo puede tener variante (no hay
pantalla), así que nada cambia: se confirma en prod, solo leyendo, que menú,
disponibilidad y costos responden igual antes y después. Revertirla es trivial.

**Entrega 2 — pantallas y papel.** Selector de variante en el formulario del combo
(con el ahorro calculado sobre el precio de la variante), ficha, biblia y comanda
con componentes. Para entonces el API ya entiende el campo: el riesgo de orden de
despliegue desaparece. QA por la interfaz real; después backup y prod.

## 6. Rollback

- Revertir la entrega 2: sin riesgo.
- Revertir la entrega 1 **después** de crear combos con variante: el código viejo
  ignoraría la variante y esos combos dejarían de descontar la proteína. **Primero
  se apagan esos combos, después se revierte.**

## 7. Limitaciones que YA existen y siguen igual

- Caja sin conexión: su inventario local ignora las variantes (también en una venta
  suelta). El servidor corrige al sincronizar.
- Reporte de márgenes: recalcula con la receta y composición ACTUALES.
- "Más vendidos": el combo cuenta como combo.

## 8. Pieza 2 (después): canal por producto

Como el canal de las promociones: cada producto se vende en caja, web o ambos.
Todos los actuales nacen en "ambos" (= hoy). Lleva su propio inventario (menú web,
catálogo de caja, rechazo al crear un pedido con un producto de otro canal, caja
sin red, formulario) y sus propias leyes. Se diseña cuando esta pieza esté en prod.
