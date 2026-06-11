> ⚠️ **DOCUMENTO HISTÓRICO (congelado).** Describe planificación que YA SE EJECUTÓ — sus
> "pendientes" están casi todos hechos y verificados. NO planear trabajo desde acá.
> Estado real y vigente: `CLAUDE.md` (canónico) + `estado-del-sistema.md` (§10 lista
> qué items de este doc ya están implementados).

# FASE 4 — Ajustes pendientes y mejoras requeridas

> **Documento canónico de pendientes para FASE 4.** Este archivo lista
> exhaustivamente todos los ajustes detectados después de cerrar FASE 4
> (commits hasta `1ead706`). Se trabaja en una sesión dedicada antes de
> arrancar FASE 5.
>
> **Cómo se trabaja:** las áreas están agrupadas por dominio. Cada área
> tiene severidad (P0/P1/P2), archivos afectados y criterio de aceptación
> claro. Se hace **un commit por área** (no agrupar áreas).
>
> **Antes de tocar código:** confirmar el orden con el usuario y partir
> en TodoWrite con el plan completo.

---

## 0. Contexto

FASE 4 se cerró en términos de **funcionalidad mínima**:

- Backend de invoices (upload-photo, IA extract, confirm, reject, from-clone, raw-extraction)
- UI de invoices (uploader, modal con fuzzy match, edit drafts, clone)
- Suppliers CRUD (backend + UI)
- Polimorfismo Stockable (INGREDIENT/PRODUCT direct-resale)
- Cost vs Sale price separado (`Product.lastUnitCost` ≠ `Product.basePrice`)

Pero quedaron **gaps significativos** en:

1. **Crear/editar productos direct-resale fuera del flujo de factura** (gap mayor)
2. **Validaciones backend insuficientes** (totales, IVA, items vacíos)
3. **Audit log con `action` reusada incorrectamente** (todo es `INVENTORY_MOVEMENT_PURCHASE`)
4. **Trazabilidad inversa** (factura → movements no se ve, supplier → su histórico tampoco)
5. **Resume drafts** tiene edge cases
6. **UX rough en varios puntos** (combos no calculan costo, badge de margen hardcoded, etc.)
7. **Cero tests automatizados de FASE 4**

Este documento enumera y prioriza cada uno.

---

## 1. Resumen ejecutivo

| Severidad | Cantidad | Impacto |
|---|---|---|
| **P0 — bloqueante** | 4 | Funcionalidad rota o imposible sin tocar API directo |
| **P1 — alto** | 8 | Funciona pero con UX/UX inconsistente o sin trazabilidad |
| **P2 — medio** | 6 | Pulido visual, tests, performance |
| **TOTAL** | **18 áreas** | |

**Esfuerzo estimado total**: 2-3 sesiones (~10-14 horas). Se puede partir en mini-sprints.

---

## 2. Ajustes por área

### 🔴 P0 — Bloqueantes

#### 2.1 [P0] `ProductForm` no permite crear/editar productos direct-resale

**Archivo principal:** `apps/admin/src/features/products/components/ProductForm.tsx`

**Problema:**
El form NO tiene los campos `directResale`, `unitPurchase`, `unitStock`, `conversionFactor`, `thresholdMin`. Sólo el `CostInfoPanel` agregado en commit `848f215` es read-only y solo aparece en edit cuando ya se marcó como direct-resale por API.

**Resultado:** el dueño NO puede crear "Coca Cola 600ml" como producto direct-resale desde `/products/new` ni desde `/products/[id]`. Solo puede crearlo desde el modal de factura (`InvoiceItemRow → + Crear nuevo`) o llamando al API directo. Es un gap funcional crítico.

**Criterio de aceptación:**
- Toggle "Es producto de reventa directa" en el form (checkbox/switch).
- Cuando está activo:
  - Mostrar campos `unitPurchase`, `unitStock`, `conversionFactor`, `thresholdMin` (todos required).
  - Mostrar banner amber explicativo (similar al de `InvoiceItemRow`).
  - Bloquear toggle `isCombo` (mutuamente excluyentes — ya validado en backend `CreateProductSchema.superRefine`).
- Cuando está inactivo: ocultar esos campos.
- En edit: si ya es direct-resale, NO permitir desactivar el toggle (sería un cambio de modelo de datos peligroso). Mostrar nota explicativa.
- Validar en el cliente todo lo que el `CreateProductSchema.superRefine` ya valida en backend.

**Archivos a modificar:**
- `apps/admin/src/features/products/components/ProductForm.tsx`
- (Posiblemente extraer en sub-componentes para no pasar de 200 líneas — partir si crece)

**Tests manuales requeridos:**
- Crear nuevo producto direct-resale `Coca Cola 600ml` (caja=24, botella, factor=24, threshold=12, basePrice=3500). Verificar que aparece en `/inventory` con stock=0.
- Editar un producto NO direct-resale e intentar marcarlo como direct-resale → debe pedir todos los campos.
- Editar un producto YA direct-resale → toggle disabled con explicación.
- Verificar que el banner cost vs sale price aparece y tiene mismo wording que `InvoiceItemRow`.

---

#### 2.2 [P0] Combos no calculan costo desde sus componentes

**Archivos:**
- `packages/domain/src/recipes/expand-recipe.ts` (existe `expandRecipe` para productos no-combo)
- `apps/api/src/products/products.service.ts` (endpoint `/products/:id/expanded-cost`)
- `apps/admin/src/features/products/components/ProductsTable.tsx` (display)

**Problema:**
- `expandRecipe` opera sobre productos individuales (con `recipe_edges`). Pero un combo tiene `combo_components: [{productId, quantity}]` que apuntan a productos hijos.
- El endpoint `/products/:id/expanded-cost` retorna ingredientes consumidos para productos individuales, pero NO suma los costos de los productos componentes para combos.
- En `ProductsTable`, la columna "Costo / u" muestra `lastUnitCost / conversionFactor` (que solo aplica a direct-resale). Para combos siempre muestra "—". El margen tampoco calcula.

**Decisión a tomar (preguntar al usuario):**
- ¿Implementar `computeComboCost(comboId): number` en domain como suma de `expandRecipe` por cada componente × quantity? O ¿postergar para FASE 13 reportes?

**Criterio de aceptación (si se implementa ahora):**
- Función pura `computeComboCost` en `@pos-tercos/domain` que:
  - Itera `combo_components` del combo
  - Para cada componente: si tiene receta → expandRecipe + costo de ingredientes; si es direct-resale → usa `lastUnitCost`
  - Retorna costo total estimado del combo
- Endpoint `GET /products/:id/expanded-cost` extendido para combos
- `ProductsTable` muestra costo + margen también para combos

**Si se posterga:** documentar explícitamente en `ProductsTable` con tooltip "Costo de combos disponible en FASE 13".

---

#### 2.3 [P0] `confirm()` no valida que items.sum(total) ≈ invoice.total

**Archivo:** `apps/api/src/invoices/invoices.service.ts`, método `confirm()`

**Problema:**
El backend acepta una factura donde `total: 1000000` pero `items: [{total: 500}]`. El frontend muestra warning amber (línea 365 del modal) pero el backend no lo bloquea ni lo loguea.

**Criterio de aceptación:**
- En `confirm()`, comparar `Math.abs(input.total - sum(items.total))` contra una tolerancia configurable (ej. 1% o 1000 COP, lo que sea mayor).
- Si excede: tirar `BadRequestException` con mensaje claro: `"Total de la factura ($X) no coincide con la suma de items ($Y). Diferencia: $Z."`
- En el modal frontend, escalar el warning amber a error si excede el mismo umbral, deshabilitando el botón "Confirmar".

**Tests manuales:**
- Confirmar factura con total=10000 + items=[total:5000] → 400.
- Confirmar factura con total=10000 + items=[total:9999] → 200 (dentro de tolerancia).

---

#### 2.4 [P0] `confirm()` no valida que `iva <= total`

**Archivo:** `apps/api/src/invoices/invoices.service.ts`, método `confirm()`

**Problema:**
No hay validación de coherencia entre `iva` y `total`. Una factura puede tener `iva: 99999` con `total: 100`.

**Criterio de aceptación:**
- Si `input.iva` está definido: validar `iva <= total`.
- Si no se cumple: `BadRequestException("IVA ($X) no puede ser mayor al total ($Y).")`.
- Validar también en el modal frontend con feedback inline.

---

### 🟠 P1 — Alto impacto

#### 2.5 [P1] Audit log usa `INVENTORY_MOVEMENT_PURCHASE` para todos los stages de invoice

**Archivo:** `apps/api/src/invoices/invoices.service.ts` (4 lugares: uploadPhoto, confirm, reject, cloneFrom)

**Problema:**
Todos los métodos del service llaman `auditService.log({ action: 'INVENTORY_MOVEMENT_PURCHASE', ... })` con un campo `metadata.stage` para distinguir uploaded/confirmed/rejected/cloned. Esto rompe la semántica del action y dificulta filtrar el audit log.

**Criterio de aceptación:**
- Definir actions específicos:
  - `INVOICE_UPLOADED` — cuando se sube foto y se crea draft
  - `INVOICE_CONFIRMED` — cuando se confirma (los movements sí siguen siendo `INVENTORY_MOVEMENT_PURCHASE`, pero la invoice tiene su propio action)
  - `INVOICE_REJECTED`
  - `INVOICE_CLONED`
- Actualizar las 4 llamadas en `invoices.service.ts`.
- Actualizar UI `/audit` (`apps/admin/src/features/audit/`) para mapear los nuevos actions con label/tone correctos.
- Backwards compat: dado que esto es dev y no hay datos de prod aún, NO migrar entries históricos.

**Tests manuales:**
- Subir foto → audit muestra `INVOICE_UPLOADED`.
- Confirmar → audit muestra `INVOICE_CONFIRMED`.
- Clone de confirmada → audit muestra `INVOICE_CLONED`.
- Reject → audit muestra `INVOICE_REJECTED`.

---

#### 2.6 [P1] Detalle de factura no enlaza a sus inventory_movements

**Archivos:**
- `apps/admin/src/app/(authenticated)/invoices/[id]/page.tsx`
- (Opcional) `apps/api/src/invoices/invoices.service.ts` para incluir `relatedMovements`

**Problema:**
Al confirmar una factura se crean N `inventory_movements PURCHASE` con `sourceType='invoice'` + `sourceId={invoiceId}`. Pero el detalle de la factura no muestra esos movimientos ni linkea a `/inventory/movements?source_id=...`.

**Criterio de aceptación:**
- En el detalle de factura confirmada, mostrar sección "Movimientos generados" con tabla de los `inventory_movements` creados.
- Cada fila linkea a `/inventory/[type]/[id]/...` para ver stock actual del item afectado.
- Si la factura está PENDING_REVIEW o REJECTED: no mostrar la sección.

**Implementación sugerida:**
- Backend: el endpoint `GET /inventory/movements?source_id=X&source_type=invoice` ya existe — reusarlo en SSR.
- Frontend: agregar bloque condicional al final del detalle.

---

#### 2.7 [P1] Detalle de proveedor no existe — no hay vista de su histórico

**Archivos:**
- (Nuevo) `apps/admin/src/app/(authenticated)/suppliers/[id]/...`
- `apps/admin/src/features/suppliers/`
- (Posiblemente) `apps/api/src/suppliers/` — agregar endpoint `GET /suppliers/:id/products` o `GET /suppliers/:id/invoices`

**Problema:**
El form de `/suppliers/[id]` solo permite editar datos básicos. NO muestra:
- Productos comprados (`SupplierProduct[]`) con su `lastUnitPrice`
- Histórico de facturas de ese proveedor
- Total comprado en últimos N meses

**Criterio de aceptación:**
- En `/suppliers/[id]`: además del form, sección "Productos comprados" con tabla de `supplier_products` (entityType + nombre + último precio + última fecha).
- Sección "Facturas" con últimas 10 facturas de ese supplier (link a detalle).
- Backend: endpoint `GET /suppliers/:id/products` y reusar `GET /invoices?supplier_id=X` para facturas.
- O alternativamente: sub-ruta `/suppliers/[id]/products` para no saturar el form.

**Schemas:** `SupplierProductSchema` ya está en `packages/types/src/suppliers.ts` pero solo soporta `ingredientId`. Hay que extenderlo a polimórfico (`entityType + ingredientId/productId`) para reflejar el refactor.

---

#### 2.8 [P1] `SupplierProductSchema` en types NO es polimórfico (incoherencia con DB)

**Archivo:** `packages/types/src/suppliers.ts`, líneas 30-41

**Problema:**
```ts
export const SupplierProductSchema = z.object({
  id: z.string().uuid(),
  supplierId: z.string().uuid(),
  ingredientId: z.string().uuid(),  // ❌ no contempla productId
  ingredientName: z.string().optional(),
  lastUnitPrice: z.number().nullable(),
  ...
});
```

La DB ya es polimórfica (`entity_type + ingredient_id xor product_id`), pero el schema Zod compartido no refleja esto. **NO está expuesto en ningún endpoint actualmente** (solo se usa internamente en `confirm()` para upserts), por eso no rompe runtime, pero es deuda técnica.

**Criterio de aceptación:**
- Refactorizar `SupplierProductSchema` para que sea polimórfico (similar a `InvoiceItemSchema`).
- Si en el ajuste 2.7 se expone vía endpoint, el endpoint debe usar el schema actualizado.

---

#### 2.9 [P1] Modal de factura no muestra la imagen original

**Archivo:** `apps/admin/src/features/invoices/components/InvoiceConfirmModal.tsx`

**Problema:**
Cuando el dueño está revisando una extracción IA, no puede ver la foto que subió para comparar. Tiene que confiar ciegamente en lo que la IA extrajo.

**Criterio de aceptación:**
- En el modal, agregar tab/columna lateral con thumbnail de la imagen original.
- Click en thumbnail → modal lightbox con imagen full size.
- Backend: agregar endpoint `GET /invoices/:id/photo` que sirve la imagen desde `StorageProvider.get(key)` con autenticación.
- Frontend: usar `<img src="/api/invoices/{id}/photo" />`.
- Para drafts clonados (sin imagen): mostrar "Esta factura no tiene foto (fue ingresada manualmente o clonada)".

**Notas:**
- El `LocalFilesystemStorageAdapter` actual solo escribe; necesita método `get(key): Buffer`.
- En prod (R2) sería signed URL temporal — postergar para FASE 14.

---

#### 2.10 [P1] No hay forma de eliminar drafts

**Archivos:**
- `apps/api/src/invoices/invoices.service.ts` (nuevo método `delete`)
- `apps/api/src/invoices/invoices.controller.ts`
- UI en `/invoices/[id]/edit` o `/invoices/[id]`

**Problema:**
Si un dueño sube una factura y se da cuenta que es errónea (foto borrosa, factura duplicada), solo puede `reject()`, que la deja en histórico como REJECTED. No puede borrarla.

**Decisión a tomar (preguntar al usuario):**
- ¿Borrado físico (DELETE de DB) o lógico (campo `deleted_at`)?
- ¿Permitir borrar también imagen de storage?

**Recomendación inicial:**
- Solo permitir DELETE en drafts `PENDING_REVIEW` (los CONFIRMED nunca se borran porque generaron movements).
- DELETE físico de la `invoice` row → cascade borra `invoice_items`.
- Borrar imagen del storage (si existe).
- Audit log `INVOICE_DELETED` con metadata.
- En UI: botón "Eliminar borrador" en `/invoices/[id]/edit` o `/invoices/[id]` solo si PENDING_REVIEW.

---

#### 2.11 [P1] `InvoiceItemRow` `+ Crear nuevo` no valida coherencia con la unidad de factura

**Archivo:** `apps/admin/src/features/invoices/components/InvoiceItemRow.tsx`, función `CreateStockableInline`

**Problema:**
Si la factura dice `5 kg` y el dueño crea un nuevo insumo con `unitPurchase: 'caja'`, hay incoherencia: la cantidad 5 está en `kg` pero el insumo espera `caja`. Al confirmar, `computeStockQty` hace match case-insensitive (`'kg'.toLowerCase() === 'kg'`) y si no matchea aplica `conversionFactor`, pero el factor está pensado para `caja → unidad`, no `kg → unidad`. Resultado: stock incorrecto.

**Criterio de aceptación:**
- Validar en el form de `CreateStockableInline` que `unitPurchase` coincida con `row.unit` (la unidad declarada en la factura). Si no coincide: warning explícito.
- Mensaje: "La factura declara la cantidad en `kg`, pero estás creando el {tipo} con `unitPurchase: caja`. Esto puede causar stock incorrecto al confirmar."
- Permitir overridear el warning (a veces es legítimo: factura en `kg` pero el dueño compra `cajas` de 10kg → factor=10).
- Considerar agregar campo "Unidad declarada en factura" como readonly informativo.

---

#### 2.12 [P1] `cloneFrom` permite clonar facturas sin items

**Archivo:** `apps/api/src/invoices/invoices.service.ts`, método `cloneFrom`

**Problema:**
Si una factura CONFIRMED tiene 0 items (caso patológico), `cloneFrom` crea un draft también con 0 items. El modal después no se puede confirmar (validación `items.length >= 1`).

**Criterio de aceptación:**
- En `cloneFrom`, si `source.items.length === 0`: `BadRequestException("La factura origen no tiene items, no se puede clonar.")`.

---

### 🟡 P2 — Medio impacto / pulido

#### 2.13 [P2] Badge de margen tiene umbrales hardcoded

**Archivos:**
- `apps/admin/src/features/products/components/ProductsTable.tsx`, función `MarginBadge`
- `apps/admin/src/features/products/components/ProductForm.tsx`, función `Stat` con tone

**Problema:**
Los umbrales (`>=30 verde`, `>=10 amber`, `>=0 orange`, `<0 red`) son arbitrarios y están duplicados.

**Criterio de aceptación:**
- Centralizar en `apps/admin/src/lib/margin-thresholds.ts` o similar:
  ```ts
  export const MARGIN_THRESHOLDS = {
    excellent: 30,  // verde
    good: 10,       // amber
    poor: 0,        // orange
  } as const;
  
  export function marginTone(value: number): 'good' | 'warn' | 'poor' | 'bad' { ... }
  ```
- Reusar en ambos archivos.
- Documentar en `CLAUDE.md` (o este doc) que estos umbrales son negociables con el usuario.

---

#### 2.14 [P2] Formatters de COP / fecha duplicados en muchos archivos

**Archivos afectados:** todos los componentes de admin que muestran moneda o fecha (al menos 8 archivos).

**Problema:**
La función `formatCop(n) = n.toLocaleString('es-CO', { style: 'currency', ... })` está duplicada en:
- `InvoicesTable.tsx`, `InvoiceItemRow.tsx`, `InvoiceConfirmModal.tsx`
- `ProductsTable.tsx`, `ProductForm.tsx`
- `app/(authenticated)/invoices/[id]/page.tsx`
- Y más.

Lo mismo con `formatDate`.

**Criterio de aceptación:**
- Crear `apps/admin/src/lib/format.ts` con:
  ```ts
  export function formatCop(n: number): string;
  export function formatNumber(n: number, opts?: { decimals?: number }): string;
  export function formatDate(iso: string, format?: 'short' | 'long' | 'datetime'): string;
  ```
- Reemplazar todos los duplicados.
- (Opcional) mover a `@pos-tercos/ui` si las otras 5 apps los usan después.

---

#### 2.15 [P2] `EditDraftScreen` re-fetchea suppliers + stockables al montar (doble fetch innecesario)

**Archivo:** `apps/admin/src/features/invoices/components/EditDraftScreen.tsx`, líneas 40-49

**Problema:**
El SSR ya carga suppliers + stockables, pero el `useEffect` en `EditDraftScreen` los re-pide al montar el cliente. Doble fetch innecesario en cada apertura del modal.

**Criterio de aceptación:**
- Eliminar el `useEffect` que re-fetchea.
- Si se quiere mantener "freshness" en caso que el usuario tenga otras pestañas abiertas: usar `router.refresh()` solo cuando el usuario crea un stockable nuevo, no on mount.

---

#### 2.16 [P2] Sidebar no tiene icons

**Archivo:** `apps/admin/src/components/AdminSidebar.tsx`

**Problema:**
Solo texto. Es funcional pero menos escaneable. Heroicons o lucide-react resuelve esto.

**Criterio de aceptación:**
- Decidir librería de icons (recomendado: `lucide-react`, ya común en stacks Next).
- Agregar icon a cada `NavItem`.
- Si se elige otra librería, justificar (peso bundle, etc.) y documentar en `CLAUDE.md`.

**Notas:**
- Esto NO está en el alcance v1 obligatorio. Es pulido. Si se decide postergar, dejar TODO en sidebar.

---

#### 2.17 [P2] Cero tests automatizados de FASE 4

**Archivos:** todo `apps/api/src/invoices/`, `apps/api/src/suppliers/`, `apps/api/src/adapters/llm/`.

**Problema:**
- No hay `.spec.ts` para `InvoicesService`, `SuppliersService`.
- No hay e2e para flujo completo (upload → confirm → movements).
- `testing-guide.md` cubre FASES 0-3 pero no FASE 4.

**Criterio de aceptación:**
- Agregar tests unit para `InvoicesService.cloneFrom` (caso happy + source no existe + source no CONFIRMED + source sin items).
- Agregar tests unit para `InvoicesService.confirm` (caso happy + total mismatch + iva > total + ingredient inactivo + product no direct-resale).
- Agregar test e2e supertest para `POST /invoices/upload-photo` con LLM mockeado.
- Extender `testing-guide.md` con sección "12. FASE 4 — Invoices + Suppliers" con ~10 tests manuales.

**Decisión:**
Si la velocidad es crítica, posponer e2e y dejar solo unit + testing-guide manual.

---

#### 2.18 [P2] `audit_log.action` es free-form String

**Archivos:**
- `apps/api/prisma/schema.prisma` (campo `audit_log.action`)
- `apps/api/src/audit/audit.service.ts`
- `packages/types/src/audit.ts`

**Problema:**
El campo `action` en `audit_log` es `String` libre. Cualquier código puede escribir cualquier cosa. Combinado con el ajuste 2.5, estamos cambiando de un valor monolítico a varios — es buen momento para tipar.

**Criterio de aceptación:**
- Definir enum/union type en `@pos-tercos/types`:
  ```ts
  export const AuditActionEnum = z.enum([
    'AUTH_LOGIN', 'AUTH_LOGIN_FAILED', 'AUTH_LOGOUT',
    'INVENTORY_MOVEMENT_MANUAL', 'INVENTORY_MOVEMENT_PURCHASE',
    'INVENTORY_MOVEMENT_WASTE', 'INVENTORY_MOVEMENT_INITIAL',
    'INVOICE_UPLOADED', 'INVOICE_CONFIRMED', 'INVOICE_REJECTED', 'INVOICE_CLONED', 'INVOICE_DELETED',
    'PRODUCT_CREATED', 'PRODUCT_UPDATED',  // futuros
  ]);
  export type AuditAction = z.infer<typeof AuditActionEnum>;
  ```
- Tipar `AuditService.log({ action: AuditAction, ... })`.
- NO migrar la columna a enum en DB (cambio breaking) — mantener `String` y validar en aplicación.

---

## 3. Plan de acción recomendado

**Orden por dependencia + impacto:**

### Sprint A — Backend hardening (P0 backend + P1 backend)
1. **2.3** Validación total/items mismatch
2. **2.4** Validación iva ≤ total
3. **2.12** `cloneFrom` rechaza source sin items
4. **2.5** Audit actions específicos (`INVOICE_*`)
5. **2.18** Tipar `AuditAction` en types

**Commit 1:** `fix(invoices): tighten confirm + cloneFrom validations`
**Commit 2:** `refactor(audit): typed AuditAction + invoice-specific actions`

### Sprint B — Productos direct-resale en form (P0)
6. **2.1** ProductForm soporta direct-resale full

**Commit 3:** `feat(products): support direct-resale fields in ProductForm`

### Sprint C — Trazabilidad y detalle (P1)
7. **2.6** Detalle de factura muestra movements generados
8. **2.10** Borrar drafts
9. **2.7** + **2.8** Detalle de proveedor con histórico (requiere schema polimórfico de `SupplierProduct`)

**Commit 4:** `feat(invoices): show generated movements + delete drafts`
**Commit 5:** `feat(suppliers): supplier detail with products + invoices history`

### Sprint D — Modal UX (P1)
10. **2.9** Mostrar imagen original
11. **2.11** Validación de coherencia de unidad

**Commit 6:** `feat(invoices): show photo + validate unit coherence in modal`

### Sprint E — Pulido (P2)
12. **2.13** Centralizar margin thresholds
13. **2.14** Formatters compartidos
14. **2.15** Eliminar doble fetch en EditDraftScreen
15. **2.16** Sidebar icons (opcional)

**Commit 7:** `chore(admin): centralize formatters + margin thresholds`
**Commit 8:** `perf(invoices): drop redundant fetch in EditDraftScreen`
**Commit 9:** (opcional) `feat(admin): add lucide icons to sidebar`

### Sprint F — Cobertura (P0/P2)
16. **2.2** Combos cost calculation (decisión: ahora vs FASE 13)
17. **2.17** Tests + extender testing-guide.md

**Commit 10:** (si se hace ahora) `feat(domain): computeComboCost for combo products`
**Commit 11:** `test(invoices): unit + e2e tests + testing-guide ext`

---

## 4. Cómo validar al final

```bash
# Después de cada sprint
pnpm typecheck       # 12/12 packages
pnpm lint            # 0 warnings/errors
pnpm test            # cuando haya tests

# Al cerrar todos los sprints
pnpm -F @pos-tercos/api dev    # localhost:3001
pnpm -F @pos-tercos/admin dev  # localhost:3004

# Ejecutar testing-guide.md sección 12 completa
```

**Definition of Done de FASE 4 ajustes:**
- [ ] `pnpm typecheck` 12/12 OK
- [ ] `pnpm lint` 0 errores 0 warnings
- [ ] `pnpm test` (donde aplique) 0 fallos
- [ ] testing-guide.md sección 12 completa y todos los checks ✅
- [ ] CLAUDE.md actualizado con cambios mayores reflejados (especialmente sección 4 si cambia decisión arquitectónica)
- [ ] Cada sprint en commit separado, sin "dead" code
- [ ] No se rompió ningún flujo existente (regresión cero en FASES 0-3)

---

## 5. Out of scope (NO entra en este chat)

Estos puntos NO se tocan en esta sesión de ajustes — son features genuinos de fases posteriores:

- **R2 storage adapter** (FASE 14)
- **WebSocket gateway** (FASE 6)
- **Sales / POS Cajero** (FASE 5)
- **Promociones aplicadas a productos direct-resale** (FASE 10)
- **Reportes de margen agregado** (FASE 13)
- **Print de factura PDF** (FASE 15)
- **Integración con DIAN para facturación electrónica** (kickoff externo)
- **Mobile responsive de tablas grandes** (FASE 14 hardening)

Si durante el trabajo aparece alguno, **flagearlo via `mcp__ccd_session__spawn_task` o anotar en este doc bajo "out of scope" para tomar después** — NO bundle en este sprint.

---

## 6. Notas finales

- **Todo en este doc se discute con el usuario antes de tocar código.** Especialmente las decisiones marcadas explícitamente (combos cost, borrar drafts, sidebar icons).
- Si aparece algo más durante el trabajo, agregar acá con severidad apropiada antes de seguir.
- Al cerrar el último sprint, **borrar este archivo** (o mover a `docs/archive/`) y actualizar `CLAUDE.md` con cualquier decisión nueva que haya quedado.
