# POS Tercos — Guía exhaustiva Sprint 5.E + FASES 6 a 15

> **Documento canónico de roadmap.** Cubre desde el último sprint pendiente
> de FASE 5 (UI POS) hasta cierre v1 (FASE 15). Diseñado para que un agente
> codeador en chat dedicado pueda implementar TODO sin omitir nada y sin
> romper el código actual.
>
> **Cómo usarlo:**
> 1. Leer Sección 0 (estado actual) + Sección 1 (reglas universales) → contrato base.
> 2. Trabajar Sprint 5.E con la Sección 2 (detalladísima) — un commit por feature.
> 3. Al cerrar 5.E, **arrancar nuevo chat** y pasar a FASE 6 con la Sección 3.1.
> 4. Cada fase 6-15 tiene su sub-sección con alcance, schema, endpoints, DoD, dependencias.
> 5. Al cerrar cada fase, **actualizar `CLAUDE.md`** con commits + estado.
>
> **Documentos canónicos referenciados** (NO contradecir):
> - `pos-spec.v1.md` — alcance v1 cerrado
> - `architecture.md` — arquitectura técnica
> - `implementation-plan.md` — plan por fases con DoD
> - `kickoff-plan.md` — pendientes externos (hardware, cuentas, etc.)
> - `CLAUDE.md` — estado vigente (módulos, commits, decisiones)

---

# Sección 0 — Estado actual al cierre de FASE 5.D

**Commits en `main`:** 29 (último: `ff462c5 feat(printer,cash-drawer): FASE 5.D adapters + receipt HTML rendering`).

## 0.1 Lo que está vivo y funcionando

### Backend (`apps/api`, NestJS 11 + Prisma 6 + PostgreSQL 16, puerto 3001)

| Dominio | Endpoints | Estado |
|---|---|---|
| Auth | `POST /auth/login`, `/refresh`, `/logout`, `GET /auth/me` | ✅ FASE 1 |
| Catálogo | CRUD `/ingredients`, `/subproducts`, `/products` + `GET/PUT /:id/recipe` + `GET /products/:id/expanded-cost` | ✅ FASE 2 |
| Inventario | `GET /inventory/stock`, `GET /:type/:id`, `GET/POST /movements` polimórfico, `GET /audit` (Dueño) | ✅ FASE 3 |
| Suppliers | `GET/POST/PATCH/DELETE /suppliers` | ✅ FASE 4 |
| Invoices | `POST /upload-photo`, `from-clone`, `GET /:id/raw-extraction`, `POST /:id/confirm` `/reject`, `GET /` `/:id` | ✅ FASE 4 |
| Approvals | `POST /approvals/pin` (Dueño-only) | ✅ FASE 5.B |
| Shifts | `POST /shifts/open`, `GET /current` `/:id` `/` | ✅ FASE 5.B |
| Sales | `POST /sales` (Idempotency-Key), `/:id/confirm-payment`, `/:id/void` (X-Approval-Pin), `GET /sales` `/:id` `/:id/status-log`, `POST /:id/print` (text/html), `/:id/open-drawer`, `/open-drawer/no-sale` (X-Approval-Pin), `POST /admin/check-receipt-gaps` (Dueño-only) | ✅ FASE 5.B-D |
| Promotions | CRUD `/promotions` (Cajero+ read, Admin/Dueño write) | ✅ FASE 5.C |

### Crons activos (`@nestjs/schedule`)
- `IdempotencyService.purgeExpired` — diario 3:00 AM
- `ReceiptIntegrityService.detectGaps` — diario 4:00 AM, audit `RECEIPT_GAP_DETECTED` si gap>0

### Adapters concretos vivos
- `LocalFilesystemStorageAdapter` (`./tmp/uploads/...`) ← R2 en FASE 15
- `AnthropicLLMAdapter` (Claude Haiku 4.5 vision) + `OpenAILLMAdapter` (GPT-4o-mini fallback)
- `LocalFsPrinterAdapter` (`./tmp/receipts/`) ← ESC/POS en FASE 15
- `LogCashDrawerAdapter` ← ESC/POS RJ11 en FASE 15

### Frontend (`apps/admin`, Next.js 15, puerto 3004)

Rutas vivas: `/login`, `/unauthorized`, `/` (dashboard), `/ingredients`, `/subproducts`, `/products`, `/products/[id]/recipe`, `/subproducts/[id]/recipe`, `/inventory`, `/inventory/[type]/[id]/adjust`, `/inventory/movements`, `/invoices`, `/invoices/new`, `/invoices/[id]`, `/invoices/[id]/edit`, `/suppliers`, `/suppliers/new`, `/suppliers/[id]`, `/audit`.

### Apps placeholder (no tocadas todavía)
- `apps/pos` ← **Sprint 5.E construye TODO acá**
- `apps/kds` ← FASE 6
- `apps/public-display` ← FASE 6
- `apps/web` ← FASE 7
- `apps/repa` ← FASE 10
- `apps/print-agent` ← **NO existe aún, se crea en FASE 15** (en 5.D se difirió porque mock no aporta valor)

### Schema DB (24 tablas + 10 enums + sequence `receipt_seq`)
Detalle en `CLAUDE.md` sección 5.

## 0.2 Pendientes conocidos (NO bloqueantes para 5.E)

`fase4-ajustes-pendientes.md` lista 18 áreas de ajustes a FASE 4 (algunos P0):
- ProductForm no permite crear/editar productos direct-resale (gap funcional)
- Combos no calculan costo desde componentes
- Validaciones backend insuficientes en confirm de invoice
- Audit reuses `INVENTORY_MOVEMENT_PURCHASE` para todos los stages

**Estos ajustes son trabajo paralelo** — el agente de FASES 5-15 NO los aborda salvo que los necesite directamente.

---

# Sección 1 — Reglas universales (NO violar)

## 1.1 Anti-spaghetti backend
- Un módulo NestJS por dominio en `apps/api/src/<dominio>/`.
- ❌ NUNCA `PrismaService` en controller, solo en service.
- ❌ NUNCA lógica de negocio en controller (controller = parsear input + llamar service + serializar output).
- ❌ NUNCA acceder a entidades de otro dominio con Prisma directo — pedirle al `<X>Service` inyectado.
- ❌ NUNCA mezclar adapters externos con lógica de dominio (van en `apps/api/src/adapters/<provider>/` detrás de interfaces de `@pos-tercos/domain`).
- ✅ SIEMPRE validar input con Zod en `@Body(new ZodValidationPipe(<Schema>))`. **NO usar `@UsePipes()` cuando hay `@CurrentUser()` en el método** (el pipe se aplicaría a TODOS los args y trataría de validar el JwtAccessPayload contra el schema → "Required").
- ✅ SIEMPRE tipar DTOs explícitos, nunca retornar entidades Prisma crudas.
- ✅ SIEMPRE registrar acciones sensibles vía `AuditService.log({ action: <AuditAction>, ... })`.

## 1.2 Anti-spaghetti frontend
- Feature-based: `apps/<app>/src/features/<feature>/{api,components,hooks,server.ts,index.ts}`.
- Pages thin: `app/<route>/page.tsx` solo compone features.
- ❌ NUNCA `fetch()` directo en componente — siempre por `features/<x>/api/`.
- ❌ NUNCA `'use client'` sin necesidad real.
- ❌ NUNCA importar de un feature ajeno sin pasar por su `index.ts` (barrel).
- ✅ Componentes <200 líneas. Si crece, partir.
- ✅ Tipos compartidos: `import type { ... } from '@pos-tercos/types'`.

## 1.3 Polimorfismo Stockable (FASE 4) — NO MODIFICAR
- `inventory_movements`, `invoice_items`, `supplier_products` son polimórficos: `entity_type StockableType` + `ingredient_id xor product_id`.
- `Stockable` unifica Insumos + Productos `direct_resale=true`.
- Productos `direct_resale=false` NO tienen stock propio — descuentan vía `expandRecipe`.

## 1.4 Cost vs Sale price (FASE 4) — NO conflar
- `Product.basePrice` = precio de **VENTA al cliente**, lo define el dueño.
- `Product.lastUnitCost` (+ `lastUnitCostDate`) = **COSTO histórico** auto-actualizado al confirmar facturas. Está en `unit_purchase`.
- En cualquier UI que tome dato de factura: **NUNCA prefilear `basePrice` con `unit_price` de la factura**. Banner amber explicativo obligatorio.

## 1.5 Adapter pattern OBLIGATORIO (`architecture.md:880`)
Para WhatsApp, IA, pagos, billing, delivery aggregator, storage, printer, cash drawer:
1. Interface en `@pos-tercos/domain/<provider>/types.ts`
2. Impl concreta en `apps/api/src/adapters/<provider>/<impl>.adapter.ts`
3. Module `@Global` con DI token (`Symbol('XXX_PROVIDER')`)
4. Service inyecta vía `@Inject(<TOKEN>) private readonly xxx: XxxProvider`

## 1.6 Mock-first siempre (`implementation-plan.md:11-21`)
**NUNCA usar APIs reales en dev**: WhatsApp Meta, R2, ESC/POS impresora, etc. Cada provider tiene mock. Cuando entren en prod (FASE 15) se reemplaza el adapter, no la lógica.

## 1.7 Idempotency (FASE 5.A+)
- POSTs críticos (sales, movements) aceptan header `Idempotency-Key` (`@pos-tercos/types/idempotency`).
- Cache responses en tabla `idempotency_keys` con TTL 7 días.
- `IdempotencyService` (@Global) ya tiene `findCached(key, endpoint)` y `cache(...)`.
- En el service hacés `findCached` antes de procesar; si hit → retornar + audit `IDEMPOTENCY_HIT`.
- Después del work → `cache(key, endpoint, response, statusCode, userId)`.

## 1.8 Insert-only enforcement (FASE 3+)
- Tablas `inventory_movements`, `audit_log`, `sale_status_log`: trigger `reject_update_delete()` bloquea UPDATE/DELETE.
- **TODO cambio retroactivo se hace por movement compensatorio**, NUNCA editando.
- En tests, si necesitás limpiar test data: `ALTER TABLE ... DISABLE TRIGGER` y volver a habilitar.

## 1.9 Audit log
- Existe `AuditService.log({ userId?, action, entityType?, entityId?, before?, after?, metadata? })` en `apps/api/src/audit/`.
- `AuditAction` enum tipado en `@pos-tercos/types/audit`. Si necesitás un action nuevo, agregarlo al enum primero.
- Audit NUNCA debe romper la operación de negocio (try/catch interno, log si falla).

## 1.10 RBAC y decoradores
Decoradores en `apps/api/src/auth/decorators/roles.decorator.ts`:
- `@OnlyDueno()` → DUENO
- `@AdminAccess()` → ADMIN_OPERATIVO | DUENO
- `@CashierAccess()` → CAJERO | ADMIN_OPERATIVO | DUENO
- `@InternalAccess()` → todos los roles internos
- `@Public()` → sin auth (rutas públicas)

Roles del sistema (`UserRole` enum): `DUENO, ADMIN_OPERATIVO, CAJERO, COCINERO, REPARTIDOR, TRABAJADOR`.

## 1.11 Aprobación inline (X-Approval-Pin)
Cuando el cajero intenta una acción sensible (void, descuento >15%, abrir cajón sin venta):
1. Cliente envía header `X-Approval-Pin: <6-digit>` (`APPROVAL_PIN_HEADER` en types).
2. `ApprovalsService.verify(pin)` busca PINs activos de Admin/Dueño con bcrypt sweep.
3. Si pasa: ejecuta acción + audit `APPROVAL_GRANTED` con `approverId`.
4. Si falla: `ForbiddenException` + audit `APPROVAL_DENIED`.

## 1.12 Naming y commits
- Filenames: `kebab-case`. Components React: `PascalCase`.
- Functions/vars: `camelCase`. Constantes top-level: `SCREAMING_SNAKE`.
- Zod schemas: sufijo `Schema`. Tipos inferidos: sin sufijo.
- Conventional commits: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`.
- Mensaje en español o inglés — consistencia dentro del commit.
- **Un commit por feature/sprint**, no agrupar áreas.

## 1.13 Validación pre-commit (siempre)
```bash
pnpm typecheck   # 12/12 successful
pnpm lint        # 0 errores 0 warnings
pnpm -F api build # cuando tocaste backend
pnpm -F api test # cuando hay tests
```

---

# Sección 2 — Sprint 5.E: POS Cajero UI completa

> **Estado:** Sprint final de FASE 5. Backend completo (5.A-5.D); UI POS NO existe (placeholder vacío).
> **Estimación:** 2 sesiones. Es el sprint MÁS GRANDE de FASE 5 por la cantidad de features.
> **Apps a tocar:** SOLO `apps/pos`. NO tocar admin/api.

## 2.1 Alcance literal (de `implementation-plan.md:223-253`)

Submódulos pendientes:
- **5.3** "UI POS layout: catálogo izquierda, carrito derecha"
- **5.4** "Selección de producto → modificadores → tamaño → al carrito"
- **5.5** "Combos"
- **5.7 (UI tachado)** "tachado del precio original"
- **5.8** "Apertura de turno (`POST /shifts/open` con `opening_cash`)"
- **5.9** "UI cobro: efectivo o digital con doble validación"
- **5.10 (consumo)** "MockPrinterAdapter renderiza recibo, abre nueva pestaña"

**NO entra en 5.E** (postergado a FASE 15):
- Service worker / PWA hardening
- IndexedDB / cola offline
- Print Agent local (`apps/print-agent`)
- ESC/POS real

## 2.2 DoD literal de FASE 5 (`implementation-plan.md:250-252`)

> [ ] Vendo en POS sin internet (mock printer + mock drawer + IndexedDB) — pruebo offline en Chrome devtools.
> [ ] Promoción "Lunes -10%" se aplica automáticamente en cobro.
> [ ] Recibo PDF tiene todos los campos definidos en spec (sin método de pago).

**Aclaración:** "sin internet" en el DoD se relaja en 5.E porque PWA hardening completo es FASE 15. En 5.E debe funcionar **online**; offline DoD se cierra en FASE 15. Las otras 2 condiciones SÍ deben cerrar en 5.E.

## 2.3 Reglas de negocio explícitas para POS (`pos-spec.v1.md`)

- **Cajero NO puede** (línea 58):
  - Anular ventas confirmadas (sí puede iniciar void → backend exige X-Approval-Pin)
  - Aplicar descuento manual >15% sin aprobación
  - Abrir cajón sin venta sin aprobación
- **Cajero PUEDE**: vender, cobrar, imprimir, abrir cajón con venta, hacer cierre de caja.
- **Recibo** (línea 167-169):
  - Contenido: nombre + NIT + dirección + teléfono del negocio, "DOCUMENTO INTERNO", consecutivo continuo, fecha/hora, cajero, turno, ítems con cant/precio/subtotal, descuentos, total, "*** NO ES FACTURA ***", URL pedidos web.
  - **NO se imprime el método de pago** (compliance pos-spec.v1.md:168). El backend YA cumple esto en `renderReceiptHtml`.
- **Cobro digital** (`implementation-plan.md:235`): UI muestra "Verificá en app del negocio + comprobante del cliente" antes del botón confirmar; el backend exige `digitalDoubleVerified=true` para NEQUI/DAVIPLATA/QR_BANCOLOMBIA/TRANSFER.

## 2.4 Estructura exacta a crear

```
apps/pos/src/
├── middleware.ts                           # Edge JWT verify (jose), copia adaptada de admin
├── lib/
│   ├── api-server.ts                       # serverFetchJson + ApiError (copia de admin)
│   ├── auth-config.ts                      # POS_ALLOWED_ROLES = [CAJERO, ADMIN_OPERATIVO, DUENO]
│   └── format.ts                           # formatCop, formatNumber, formatDate (compartido)
├── app/
│   ├── layout.tsx                          # root, sin shell
│   ├── globals.css                         # Tailwind + estilos base POS
│   ├── login/page.tsx                      # LoginScreen (replicar de admin)
│   ├── unauthorized/page.tsx               # mismo que admin
│   └── (authenticated)/
│       ├── layout.tsx                      # POSShell wrapper
│       ├── page.tsx                        # Home: gate de shift OPEN o PanelVenta
│       ├── shift/
│       │   └── open/page.tsx               # Form apertura de turno
│       └── sales/
│           └── [id]/
│               └── receipt/page.tsx        # Vista del recibo en iframe + acciones
├── components/
│   ├── POSShell.tsx                        # header con cajero + turno + logout
│   └── POSTopbar.tsx
└── features/
    ├── auth/                               # 1:1 con admin/features/auth
    │   ├── api/{login,me,logout}.ts
    │   ├── components/LoginScreen.tsx
    │   ├── components/LogoutButton.tsx
    │   ├── server.ts
    │   └── index.ts
    ├── shifts/
    │   ├── api/client.ts                   # openShift, getCurrent
    │   ├── components/OpenShiftForm.tsx
    │   ├── components/CurrentShiftBadge.tsx
    │   └── index.ts
    ├── catalog/
    │   ├── api/client.ts                   # listProducts, listPromotions
    │   ├── components/CatalogGrid.tsx      # grid productos por categoría
    │   ├── components/ProductCard.tsx      # con tachado si tiene promo
    │   ├── components/ProductPickerModal.tsx # modal: tamaño + modifiers + qty + agregar
    │   └── index.ts
    └── sales/
        ├── api/client.ts                   # createSale, confirmPayment, voidSale, printReceipt, openDrawer, getSale
        ├── store/cartStore.ts              # Zustand local del feature (NO global)
        ├── components/CartPanel.tsx        # lado derecho
        ├── components/CartLine.tsx
        ├── components/CartTotals.tsx       # subtotal, descuento, total con tabular-nums
        ├── components/CheckoutModal.tsx    # método pago + doble validación
        ├── components/VoidModal.tsx        # razón + PIN
        ├── components/ReceiptViewer.tsx    # iframe del HTML retornado por /print
        └── index.ts
```

## 2.5 Decisiones técnicas clave para 5.E

### 2.5.1 Estado del carrito: Zustand local del feature
- Instalar: `pnpm add -F @pos-tercos/pos zustand` (~3KB)
- Store en `features/sales/store/cartStore.ts`. **NO global** (regla CLAUDE.md sec 3 frontend).
- Persistir en `localStorage` con `persist` middleware → si el cajero recarga, el carrito sobrevive.
- API del store mínima:
  ```ts
  interface CartState {
    items: Array<{ tempId: string; productId: string; productName: string; sizeId?: string; sizeName?: string; modifiers: AppliedModifier[]; quantity: number; }>
    addItem(input): void
    updateQty(tempId, qty): void
    removeItem(tempId): void
    clear(): void
  }
  ```
- Carrito calcula PREVIEW de totales en cliente (basePrice + size + modifiers + promo guess); el backend RECALCULA al hacer POST /sales y manda totales reales en la respuesta.

### 2.5.2 Cómo aplicar promociones en el preview
- En `apps/pos/src/features/sales/`, importar `applyPromotion` y `PromotionDef` de `@pos-tercos/domain`.
- Cargar promociones activas vía `GET /promotions?only_active=true` al montar el panel.
- Para cada item del carrito, llamar `applyPromotion({productId, lineSubtotal, at: new Date()}, activePromotions)` para mostrar tachado.
- **Importante**: el preview es informativo; el backend siempre re-resuelve y CONGELA en `sale_items.applied_promotion_id`.

### 2.5.3 Idempotency-Key
- Generar `crypto.randomUUID()` al click de "Crear venta".
- Guardar en `cartStore` mientras la venta no se confirme; si el usuario refresca, mismo key → no duplica.
- Pasar como header `Idempotency-Key` en `POST /sales`.

### 2.5.4 Recibo: iframe + window.open
- Después de `confirm-payment`, navegar a `/sales/[id]/receipt`.
- Esa ruta hace `fetch('/api/sales/[id]/print', {method: 'POST'})` y guarda el blob HTML.
- Renderiza `<iframe srcDoc={html} />` con altura completa.
- Botón "Imprimir": `iframe.contentWindow.print()`.
- Botón "Reimprimir": `POST /sales/[id]/print` de nuevo (HTML lleva DUPLICADO automáticamente).
- Botón "Abrir cajón": `POST /sales/[id]/open-drawer` (sin PIN porque sale ya está PAGADO).

### 2.5.5 Cobro digital con doble validación
En `CheckoutModal.tsx`:
- Selector método: CASH / NEQUI / DAVIPLATA / QR_BANCOLOMBIA / TRANSFER.
- Si CASH: input `amountReceived` (default = total), muestra vuelto en vivo.
- Si digital: 
  - Banner amber: "Antes de confirmar, verifica:
    1. La transacción aparece en la app del negocio
    2. El comprobante del cliente coincide con el monto y la cuenta"
  - Checkbox **obligatorio**: "Confirmo doble validación".
  - Botón Confirmar disabled hasta checkbox marcado.
  - Al submit: enviar `digitalDoubleVerified: true` (Zod backend lo exige).
- Submit → `POST /sales/:id/confirm-payment` → si éxito navega a `/sales/[id]/receipt`.

### 2.5.6 Void modal
- Botón "Anular venta" SOLO visible cuando sale ya está PAGADO/EN_PREPARACION/etc.
- Modal con:
  - Textarea `reason` (min 5 chars, requerido).
  - Input PIN de 6 dígitos.
- Submit → `POST /sales/:id/void` con `X-Approval-Pin: <pin>` header.
- Si 403 (PIN inválido) → mensaje de error inline, sin cerrar modal.
- Si 200 → cerrar modal + toast "Venta anulada" + refresh.

### 2.5.7 Gate de shift OPEN
- En `(authenticated)/page.tsx` (Server Component): `serverFetchJson('/shifts/current')`.
- Si null → redirect a `/shift/open`.
- Si OPEN → render `PanelVenta` (catálogo + carrito).
- `OpenShiftForm` pide `openingCash` + `notes` opcionales → POST → redirect a `/`.
- `CurrentShiftBadge` en topbar muestra: turno #N · openingCash · botón "Cerrar turno" (cierre real es FASE 11; en 5.E el botón NO existe todavía o muestra "Cierre disponible en FASE 11").

## 2.6 Sub-tareas en orden recomendado

| # | Tarea | Files |
|---|---|---|
| 5.E.1 | Setup base: `package.json` con zustand + jose + Tailwind config + middleware Edge | apps/pos/package.json, middleware.ts, next.config.ts |
| 5.E.2 | `features/auth` (replicar de admin con `POS_ALLOWED_ROLES`) | apps/pos/src/features/auth/, lib/auth-config.ts |
| 5.E.3 | Shell + login + unauthorized + (authenticated) layout | apps/pos/src/app/, src/components/POSShell.tsx |
| 5.E.4 | `features/shifts` con OpenShiftForm + CurrentShiftBadge + gate | apps/pos/src/features/shifts/, app/shift/open/page.tsx |
| 5.E.5 | `features/catalog` con CatalogGrid + ProductCard + ProductPickerModal (tamaño + modifiers + qty) | apps/pos/src/features/catalog/ |
| 5.E.6 | `features/sales` con cartStore (Zustand persist), CartPanel + CartLine + CartTotals (con preview de promos via applyPromotion) | apps/pos/src/features/sales/store/, components/ |
| 5.E.7 | CheckoutModal con método pago + doble validación digital + Idempotency-Key generation | apps/pos/src/features/sales/components/CheckoutModal.tsx |
| 5.E.8 | `/sales/[id]/receipt` con iframe + window.print + reimprimir + abrir cajón | apps/pos/src/app/(authenticated)/sales/[id]/receipt/page.tsx |
| 5.E.9 | VoidModal con razón + PIN + integración con backend | apps/pos/src/features/sales/components/VoidModal.tsx |
| 5.E.10 | E2E manual completo + typecheck + lint + commit | — |

## 2.7 Tests manuales obligatorios (DoD ampliado)

```
[ ] Login cajero → middleware redirige a /login si sin cookie
[ ] Login admin que NO tiene shift → redirige a /shift/open
[ ] Open shift con $50000 → redirige a / con badge visible
[ ] Catálogo carga productos activos agrupados por categoría
[ ] Click en producto sin sizes/modifiers → agrega al carrito qty=1 con un click
[ ] Click en producto con modifiers → modal con checkboxes + size selector
[ ] Combo en catálogo muestra precio del combo (no suma de componentes)
[ ] Carrito muestra tachado y discount cuando hay promo activa para producto
[ ] Total = sum(lineSubtotal) - sum(lineDiscount), redondeado a entero COP
[ ] Click "Cobrar" → CheckoutModal abre con total
[ ] Selección CASH → input amountReceived → vuelto calculado en vivo
[ ] Selección NEQUI sin checkbox doubleVerified → botón disabled
[ ] Selección NEQUI con checkbox → botón enabled → POST con digitalDoubleVerified=true
[ ] Idempotency: si refresco a la mitad del checkout, mismo Idempotency-Key reusa la sale draft
[ ] Post-payment redirige a /sales/[id]/receipt
[ ] Recibo muestra HTML con totales correctos, sin método de pago visible
[ ] Botón "Imprimir" abre print dialog del browser
[ ] Botón "Reimprimir" muestra recibo con DUPLICADO
[ ] Botón "Abrir cajón" → toast "Cajón abierto"
[ ] Botón "Anular venta" → modal con razón + PIN
[ ] PIN inválido → mensaje rojo, modal NO cierra
[ ] PIN válido → toast "Venta anulada" + redirect a /
[ ] Cajero rechazado a UI admin (cookies admin diferentes) → /unauthorized
```

## 2.8 Variables de entorno necesarias en `apps/pos/.env`

```bash
# Heredado de admin
NEXT_PUBLIC_API_URL=http://localhost:3001
JWT_SECRET=<mismo que api>

# Nuevas para POS
NEXT_PUBLIC_BUSINESS_NAME="Tercos POS"  # display en POS topbar
```

Branding del recibo está en backend `apps/api/.env` (BUSINESS_NAME/ADDRESS/NIT/PHONE).

## 2.9 Confirmación con usuario antes de codear 5.E

Decisiones que el agente codeador DEBE confirmar antes de empezar:

1. **¿Zustand para carrito?** Recomendado. Alternativas: useReducer + context (más boilerplate). Si se acepta Zustand, instalar.
2. **¿Persist del carrito en localStorage?** Recomendado. Permite refresh sin perder.
3. **¿Tachado preview con motor de domain o solo backend?** Recomendado: usar `applyPromotion` de domain en cliente para preview; backend siempre re-resuelve.
4. **¿Generar Idempotency-Key en cliente con `crypto.randomUUID()`?** Sí. Estándar.
5. **¿Sidebar en POS?** NO. POS es full-screen catálogo+carrito. Topbar mínima con cajero + turno + logout.
6. **¿Botón "Cerrar turno" en topbar?** NO en 5.E (es FASE 11). Mostrar deshabilitado con tooltip "Disponible en FASE 11".

---

# Sección 3 — FASES 6 a 15 (estructura por fase)

> Cada sección 3.X tiene el mismo formato: alcance, schema, endpoints, apps, adapters, reglas, tests, DoD, dependencias, decisiones, pendientes externos.
> Cuando el agente arranque cada fase, debe: confirmar plan con usuario → TodoWrite con sub-tareas → commits separados → actualizar CLAUDE.md.

---

## 3.1 FASE 6 — KDS Cocina + Pantalla Pública

**Estimación:** 3-4 días.

### Alcance (`implementation-plan.md:256-275`)
- 6.1 NestJS WebSocket gateway `/ws/kds` con socket.io + auth JWT en handshake
- 6.2 Eventos: `order.created` (cuando sale → PAGADO), `order.status.changed`
- 6.3 UI KDS: tarjetas con cronómetro + botón grande "Iniciar / Listo"
- 6.4 Endpoints: `POST /kds/orders/:id/start`, `/ready`
- 6.5 Cada cambio escribe en `sale_status_log` (insert-only, ya disponible) con timestamps
- 6.6 NestJS SSE controller `/public-display/stream`
- 6.7 UI Pantalla Pública: número grande centrado + 1-2 próximos abajo
- 6.8 Cuando una orden pasa a `LISTO_DESPACHO` y `type=COUNTER`, actualiza el feed SSE

### Endpoints
- `GET /kds/orders [cocinero]` (PAID + EN_PREPARACION)
- `POST /kds/orders/:id/start` (status PAID → EN_PREPARACION)
- `POST /kds/orders/:id/ready` (status EN_PREPARACION → LISTO_DESPACHO)
- `WS /ws/kds` subscribe to `kitchen.queue`
- `GET /public-display/state` → `{ current_turn, next_turns[] }`
- `GET /public-display/stream` (SSE)

### Apps
- `apps/kds` (Next.js PWA)
- `apps/public-display` (Next.js + SSE, modo kiosko en tablet)

### Adapters
- WebSocket: `@nestjs/websockets` + `@nestjs/platform-socket.io`. **Instalar nuevas deps** (justifica: requerido por DoD).
- SSE: usa `nestjs/common` `Sse()` — no nueva dep.

### Reglas críticas
- "Pantalla pública SOLO turno actual + opcionales 1-2 próximos. NO estados granulares" (`pos-spec.v1.md:158`).
- "Cuando sale entra a `PAGADO` (mostrador o web), backend emite a room `kitchen.queue`" (`architecture.md:779`).
- Reconnect automático del browser para SSE (`EventSource` lo hace nativo).

### Tests
Integration: WS handshake JWT, recibe broadcast. Integration SSE emite eventos al cambiar turno. E2E: POS confirma pago → KDS aparece tarjeta → marcar LISTO → pantalla pública actualiza.

### DoD
- [ ] Ciclo POS → KDS → Pantalla Pública funciona sin refresh manual
- [ ] Si pantalla pública desconecta y reabro, reconecta sola

### Dependencias
- FASE 5 completa (sales con status PAGADO, sale_status_log)

### Decisiones a NO violar
- POS/KDS realtime = WebSocket bidireccional (`pos-spec.v1.md:26`)
- Pantalla pública = SSE read-only con reconexión auto (`pos-spec.v1.md:27`)

### Pendientes externos
- Tablet Android para pantalla pública con kiosk app (`implementation-plan.md:571`). Mientras tanto, tab Chrome en modo kiosko.

---

## 3.2 FASE 7 — Web Pública pedidos (sin Mapbox)

**Estimación:** 4-5 días.

### Alcance (`implementation-plan.md:281-303`)
- 7.1 UI web: home con menú + categorías + vista producto
- 7.2 Carrito en localStorage (anónimo)
- 7.3 Modificadores aplicables desde web
- 7.4 Aplicación de promociones activas en checkout (reusa motor 5.C)
- 7.5 Checkout flow: pickup / delivery (en 7 solo guarda dirección texto, sin 3km todavía)
- 7.6 `POST /web/orders` (público con rate-limit)
- 7.7 Genera sale con status `PENDIENTE_PAGO`, `type=WEB_PICKUP|WEB_DELIVERY`
- 7.8 Pantalla post-checkout con instrucciones pago + tracking ID
- 7.9 `GET /web/orders/:id?token=` (público con token de orden)
- 7.10 UI POS: notificación nueva orden web pendiente vía WS (extiende FASE 6)
- 7.11 Cajero confirma pago manual desde POS → `PAGADO` → entra al KDS

### Endpoints
- `POST /web/orders` (público, rate-limit)
- `GET /web/orders/:id?token=` (público con token)
- `POST /web/orders/:id/confirm-payment [cajero/admin]`
- WS POS event: `web-order.pending-payment`

### Apps
- `apps/web` (Next.js, online-only)
- `apps/pos` (extender con notificación WS)

### Adapters
Ninguno nuevo (Mapbox en FASE 8).

### Reglas críticas
- Web pública es **online-only** (`pos-spec.v1.md:44`)
- "NO HAY REEMBOLSO post pago confirmado" (`pos-spec.v1.md:148`)
- Rate-limit 100 req/min por IP en `/web/*` (`architecture.md:863`) — instalar `@nestjs/throttler`

### Tests
Integration: orden web pasa a KDS al confirmar pago. E2E: armo carrito en web, checkout pickup, voy a POS, confirmo pago, veo en KDS.

### DoD
- [ ] Cliente arma pedido y confirma checkout sin login
- [ ] Cajero ve notificación nueva en POS y confirma pago
- [ ] Pedido entra al KDS automáticamente

### Dependencias
- FASE 5 (sales schema, motor promos)
- FASE 6 (WS gateway para notificación al POS)

### Decisiones a NO violar
- Endpoints públicos sin auth solo: `/web/orders`, `/web/orders/:id`, `/auth/login`, `/webhooks/whatsapp`, `/healthz` (`architecture.md:857-861`)

### Pendientes externos
- WhatsApp idealmente para notificar instrucciones de pago (FASE 9 lo cierra; 7 puede emitir vía mock).

---

## 3.3 FASE 8 — Mapbox + validación 3km

**Estimación:** 1-2 días.

### Alcance (`implementation-plan.md:309-325`)
- 8.1 Mapbox token (gratis) en env vars
- 8.2 `<MapboxAddressAutocomplete />` en `packages/ui` con Search Box JS SDK
- 8.3 `<DeliveryRangeMap />` con círculo 3km centrado en restaurante
- 8.4 Reemplazar input texto en checkout web por autocomplete
- 8.5 `POST /web/orders` valida lat/lng vs lat/lng restaurante con Haversine
- 8.6 Si fuera 3km → 400 con mensaje claro
- 8.7 UI muestra círculo en mapa al typear, bloquea botón si fuera

### Schema
Reusa `sales.delivery_lat / delivery_lng`.

### Endpoints
Modificar `POST /web/orders` con validación.

### Apps
- `apps/web` (checkout)
- `packages/ui` (componentes Mapbox)

### Adapters
- Frontend usa Mapbox SDK directo
- Backend usa Geocoding API (`architecture.md:874`)

### Reglas
- "Validación 3km radius backend-autoritativo + frontend visual" (`pos-spec.v1.md:147`)

### Tests
Unit Haversine. Integration checkout 4km falla 400. E2E checkout 1km funciona, 4km muestra error con mapa.

### DoD
- [ ] Cliente con dirección dentro 3km puede confirmar
- [ ] Cliente con dirección fuera 3km ve mensaje claro y mapa con su pin afuera del círculo

### Dependencias
- FASE 7

### Pendientes externos
- Mapbox token (free tier) — pedir al usuario que lo cree

---

## 3.4 FASE 9 — WhatsApp con Mock + Dev Inbox

**Estimación:** 3-4 días.

### Alcance (`implementation-plan.md:331-358`)
- 9.1 Adapter `WhatsAppProvider` interface en `@pos-tercos/domain`
- 9.2 `MockWhatsAppAdapter` (default dev): guarda en tabla `dev_inbox`
- 9.3 `MetaWhatsAppAdapter` skeleton (no se conecta todavía)
- 9.4 Schema: `whatsapp_messages`, `dev_inbox`
- 9.5 Service `NotificationService`: templates + payload + adapter + log
- 9.6 Templates en `packages/domain/whatsapp-templates.ts`:
  - `payment_instructions`, `payment_received`
  - `order_in_preparation`, `order_dispatched`, `order_delivered`, `order_pickup_ready`
  - `cash_discrepancy_alert`
  - `purchase_order` (a Proveedor — F-B)
  - `low_stock_alert`
- 9.7 Hooks: cuando una sale cambia status, dispara la notif correspondiente
- 9.8 UI Admin `/admin/dev/whatsapp-inbox` que renderiza dev_inbox como conversación fake

### Schema DB
- `whatsapp_messages` (`architecture.md:491-507`): id, recipient_phone, template_name, payload jsonb, meta_message_id, status enum('QUEUED','SENT','DELIVERED','READ','FAILED'), error, related_entity, related_id, sent_at, created_at
- `dev_inbox` nueva (no detallada): id, recipient_phone, template_name, rendered_text, payload jsonb, created_at

### Endpoints
- `POST /webhooks/whatsapp` (Meta callback)
- `GET /webhooks/whatsapp` (Meta verification)

### Apps
- `apps/admin` (`/admin/dev/whatsapp-inbox`)

### Adapters
- `WhatsAppProvider` interface en domain
- `MockWhatsAppAdapter` y `MetaWhatsAppAdapter` (skeleton)

### Reglas
- WhatsApp Cloud API oficial, adapter swap a Twilio en v2 (`pos-spec.v1.md:30`)
- Mock-first hasta que Meta WABA esté aprobado

### Tests
Unit render templates con payload. Integration: confirmar pago → `payment_received` aparece en dev_inbox. E2E ciclo pedido web delivery dispara las 4 notifs.

### DoD
- [ ] Toda transición de estado dispara notificación correcta
- [ ] Dev Inbox renderiza correctamente
- [ ] Cuando llegue Meta WABA real, solo cambio el adapter en config

### Dependencias
- FASE 5 (sales) + FASE 7 (web orders)

### Pendientes externos (`kickoff-plan.md`)
- Meta Business + WhatsApp Cloud API (5-15 días hábiles trámite)
- Línea telefónica del negocio (SIM nueva)

---

## 3.5 FASE 10 — Repartidor: app + asignación

**Estimación:** 5-7 días.

### Alcance (`implementation-plan.md:364-390`)
- 10.1 Schema: campos delivery en `sales` (ya están) + enum availability en `users`
- 10.2 `AssignationService`: cuando sale → `LISTO_DESPACHO` y type=DELIVERY:
  - Busca repartidores DISPONIBLE ordenados por `last_assigned_at` asc
  - Asigna al primero, actualiza `last_assigned_at`, emite WS `assignment.new` a su user_id room
  - Si no hay → status `LISTO_DESPACHO_SIN_ASIGNAR`, alerta UI POS/Admin
- 10.3 UI App Repartidor (PWA mobile): login, toggle availability, lista pedidos asignados
- 10.4 Lista ordenada por Haversine desde restaurante
- 10.5 Vista mapa con pines (Mapbox)
- 10.6 Botones grandes para cambiar estado (4 acciones)
- 10.7 Visibilidad celular cliente solo si estado activo
- 10.8 Endpoint admin `POST /sales/:id/reassign`
- 10.9 WhatsApp templates `order_dispatched` (EN_RUTA) y `order_delivered` (ENTREGADO)
- 10.10 Edge cases: cancelación post-pago → `CANCELADO_SIN_REEMBOLSO` (aprobación dueño)
- 10.11 Cron timeout: 60+ min en EN_RUTA → alerta admin
- 10.12 Cron cancelación: `PENDIENTE_PAGO` 30+ min sin confirmación → `CANCELADO_NO_PAGO` + WhatsApp

### Schema DB
- `users.availability` (`enum DISPONIBLE/OCUPADO/OFFLINE NULL`) ya existe
- `users.last_assigned_at` agregar
- `sales.repartidor_id, assigned_at, picked_up_at, departed_at, delivered_at, failed_attempts` ya existen

### Endpoints
- `GET /repartidor/orders [repartidor]`
- `POST /repartidor/orders/:id/depart, /deliver, /failed, /return`
- `PUT /repartidor/availability { status }`
- `WS /ws/repartidor`

### Apps
- `apps/repa` (PWA mobile)

### Adapters
- Mapbox (FASE 8) + WhatsApp (FASE 9) reutilizados
- WS gateway (FASE 6) extendido con namespace `/ws/repartidor`

### Reglas
- "Auto-asignación round-robin, fallback cola manual" (`pos-spec.v1.md:145`)
- Edge cases obligatorios: `INTENTO_FALLIDO_N`, `DEVUELTO`, `CANCELADO_SIN_REEMBOLSO`, `EN_DISPUTA`

### Tests
Unit round-robin con 3 repartidores. Unit todos OCUPADO → sin asignar. Integration WEB_DELIVERY pasa todo el flujo. E2E 2 repartidores 3 pedidos verifica distribución.

### DoD
- [ ] Round-robin asigna justo
- [ ] App repartidor funciona en mobile (devtools mobile o celular real)
- [ ] Edge cases cubiertos

### Dependencias
- FASE 5, 6 (WS), 8 (Mapbox), 9 (WhatsApp templates)

### Decisiones a NO violar
- v2 difiere: tracking GPS continuo, ETA dinámico, TSP multi-parada (`pos-spec.v1.md:212-214`)

---

## 3.6 FASE 11 — Cierre de caja + Anti-fraude

**Estimación:** 4-5 días.

### Alcance (`implementation-plan.md:397-419`)
- 11.1 `POST /shifts/close` calcula expected vs counted, descuadre dispara WhatsApp
- 11.2 UI Cierre de caja en POS y Admin
- 11.3 Audit log middleware ya conectado en TODAS las acciones sensibles
- 11.4 Aprobación inline con PIN (modal cajero → backend valida) — **YA implementado en 5.B**, acá se extiende UI POS
- 11.5 Schema `approval_pins` (ya existe) + endpoint `/approval-pins/me` para que cada Admin/Dueño cambie su propio PIN
- 11.6 Reporte diario anomalías (por cajero por turno: # anulaciones, # descuentos, # cajón sin venta, # ajustes inv. Comparar con histórico personal y marcar 2σ)
- 11.7 Import CSV extracto Nequi/Bancolombia + matching contra ventas confirmadas digital + red flags
- 11.8 Detección saltos consecutivo recibos (cron diario + endpoint manual) — **YA implementado en 5.C** (`ReceiptIntegrityService`)

### Schema DB nuevo
- `payment_reconciliations` (`architecture.md:438-448`): imported_by, period_from/to, source enum('NEQUI_CSV','BANCOLOMBIA_CSV'), raw_data jsonb, matches jsonb, created_at

### Endpoints nuevos
- `POST /shifts/close [cajero] { counted_cash, notes? } → { expected, difference, alert_sent }`
- `GET /shifts ?cashier_id=&from=&to= [admin/dueño]`
- `POST /reports/payment-reconciliation/import` multipart CSV
- `GET /reports/anomalies [dueño]`
- Endpoint `/approval-pins/me` (PATCH para cambiar propio PIN, NO Dueño-only — todos los con PIN pueden cambiar el suyo)

### Apps
- `apps/admin` (cierre + reportes anomalías + audit completo)
- `apps/pos` (cierre desde cajero + UI cambiar propio PIN si Admin/Dueño)

### Adapters
- WhatsApp (ya en 9) para `cash_discrepancy_alert`
- CSV parser nativo (no externo)

### Reglas — los 5 controles anti-fraude (`pos-spec.v1.md:152-157`)
1. Audit log inmutable de acciones sensibles ✅ (ya FASE 3)
2. Aprobación obligatoria para anular >$, descuento >15%, cajón sin venta ✅ (ya 5.B)
3. Reporte diario anomalías por cajero (highlight rojo si 2σ del histórico personal)
4. Reconciliación pagos digitales (import CSV → match contra POS)
5. Numeración secuencial inmutable + detección saltos ✅ (ya 5.C)

Solo controles 3 y 4 son NUEVOS en FASE 11.

### Tests
Unit cálculo expected_cash múltiples escenarios. Unit detección anomalías 2σ. Integration cierre con descuadre dispara alerta. E2E CSV con row falso (sin venta) → flag en UI.

### DoD
- [ ] Descuadre dispara alerta visible en dev inbox
- [ ] PIN bloquea acciones sensibles cuando cajero no escala
- [ ] Reconciliación CSV detecta pagos inventados

### Dependencias
- FASE 5 + 9

---

## 3.7 FASE 12 — Auto-pedido IA + Promociones avanzadas (UI)

**Estimación:** 4-5 días.

### Alcance (`implementation-plan.md:425-444`)
- 12.1 Schema `purchase_suggestions`
- 12.2 Cron horario: insumos < threshold → genera sugerencia
- 12.3 Prompt Claude Haiku 4.5 en `packages/domain/llm-prompts/auto-purchase.ts`
  - Input: stock actual + histórico 30/60/90 días + último precio por proveedor + días cobertura objetivo (default 7)
  - Output JSON: lista pedidos por proveedor + cantidades sugeridas + texto WhatsApp
- 12.4 UI Admin `/admin/sugerencias-pedido`
- 12.5 Editar antes de aprobar
- 12.6 Botón "Aprobar y enviar" → fanout WhatsApp(s) con template `purchase_order`
- 12.7 UI Admin para CRUD promociones (motor ya en 5.C, falta UI completa con calendario opcional)

### Schema DB
- `purchase_suggestions` (`architecture.md:512-523`): generated_at, ai_model_used, triggered_by enum('AUTO_THRESHOLD','MANUAL'), payload jsonb (groups por supplier), status enum('PENDING','APPROVED','REJECTED','SENT'), approved_by, approved_at, whatsapp_msg_id

### Endpoints
- `GET /purchase-suggestions ?status=PENDING`
- `POST /purchase-suggestions/regenerate [admin/dueño]`
- `PATCH /purchase-suggestions/:id`
- `POST /purchase-suggestions/:id/approve [admin/dueño]` (genera WhatsApp)
- `POST /purchase-suggestions/:id/reject`

### Apps
- `apps/admin`

### Adapters
- LLM (FASE 4) reutilizado
- WhatsApp (FASE 9) con template `purchase_order`

### Reglas
- "[F-B] V1 con IA generativa + tap aprobación" (`pos-spec.v1.md:137`)
- "Promociones por hora y día, mayor descuento gana, no acumulables, creables solo Admin/Dueño" (`pos-spec.v1.md:163`)
- "Cap IA: USD $20/mes con alerta al Dueño" (`pos-spec.v1.md:159`)

### DoD
- [ ] Sugerencias IA tienen sentido al revisar
- [ ] Tap aprobar envía WhatsApp(s) (visible en dev inbox)
- [ ] Costo IA por sugerencia <$0.05 USD

### Dependencias
- FASE 3 (inventario+thresholds), 4 (LLM + supplier_products), 9 (WhatsApp), 5.C (motor promos)

### Decisiones a NO violar
- v1 solo PERCENT_OFF en promotions
- BOGO/FIXED_OFF/COMBO_OFF difieren v2

---

## 3.8 FASE 13 — Reportes y Dashboard

**Estimación:** 4-5 días.

### Alcance (`implementation-plan.md:451-469`)
- 13.1 Endpoint `/reports/dashboard` con top 8 hero pre-calculadas
- 13.2 UI Dueño: dashboard hero con 8 cards
- 13.3 Sub-páginas: `/reports/sales`, `/cogs`, `/anomalies`, `/inventory`, `/web-funnel`, `/payment-reconciliation`, `/labor-cost`
- 13.4 Export CSV/PDF de cada reporte

### Schema
Sin tablas nuevas. Lecturas + agregaciones sobre tablas existentes.

### Endpoints (`architecture.md:651-658`)
- `GET /reports/dashboard [dueño]`
- `GET /reports/sales ?from=&to=&group_by=day|week|month`
- `GET /reports/cogs ?product_id=`
- `GET /reports/anomalies [dueño]`
- `GET /reports/inventory` (rotación, cobertura, merma)
- `GET /reports/web-funnel`
- `GET /reports/payment-reconciliation`

### Apps
- `apps/admin` (con Recharts u otra lib gráficos)

### Reglas — Top 8 hero (`pos-spec.v1.md:178-184`)
1. Ventas día/semana/mes con sparkline comparativa
2. Ticket promedio
3. Top 5 productos vendidos (toggle día/semana/mes)
4. COGS por plato + margen %
5. Hora pico identificada automáticamente
6. Tiempo promedio KDS extremo a extremo
7. Descuadre histórico de caja por turno por cajero
8. Stock crítico activo (# insumos en alerta + cuáles)

Sub-páginas (`pos-spec.v1.md:185-192`): % efectivo vs digital, conversión web, abandono carrito, anulaciones/descuentos por cajero, días cobertura por insumo, merma por insumo, costo laboral del mes.

### DoD
- [ ] Dashboard top 8 carga en <500ms
- [ ] Datos de los 15 reportes consistentes con DB

### Dependencias
- FASES 5, 7, 11, 14 (labor-cost necesita workers)

### Decisiones a NO violar
- IA narrativa difiere a v2

---

## 3.9 FASE 14 — Trabajadores RRHH ligero

**Estimación:** 3-4 días.

### Alcance (`implementation-plan.md:475-489`)
- 14.1 Schema: `workers`, `attendance`, `payrolls`
- 14.2 CRUD workers desde Admin (incluye usuario asociado en `users` con rol TRABAJADOR — ya seedeado)
- 14.3 UI Trabajador (módulo dentro Admin con login propio): perfil, horas, pago
- 14.4 Check-in/out (botón + timestamp)
- 14.5 Generación payrolls por período (cron mensual o manual)
- 14.6 Aprobación + marcado pagado por Admin/Dueño

### Schema DB (`architecture.md:455-486`)
- `workers (id, user_id 1:1, full_name, document, position, payment_type enum('PER_DAY','MONTHLY'), payment_amount, active, created_at)`
- `attendance (id, worker_id, check_in, check_out, date, notes)`
- `payrolls (id, worker_id, period_from, period_to, total_amount, status enum('DRAFT','APPROVED','PAID'), paid_at, created_by)`

### Endpoints
- `GET /workers [admin/dueño]`, `POST /workers`
- `GET /workers/me [trabajador]`
- `POST /workers/me/check-in`, `/check-out`
- `GET /workers/me/payroll`
- `POST /workers/:id/payrolls [admin/dueño]` (genera período)
- `PATCH /workers/:id/payrolls/:pid` (status PAID)

### Apps
- `apps/admin` con módulo RRHH dentro

### Reglas
- "Web trabajadores RRHH ligero: registro asistencia, tipo pago (día/mensual), nómina simple" (`pos-spec.v1.md:165`)
- "Trabajador SOLO accede a su perfil dentro del Admin" (`pos-spec.v1.md:64`)

### DoD
- [ ] Trabajador entra a su URL con email/password, ve su info
- [ ] Payroll calcula correcto según `payment_type` (per_day vs monthly)

### Dependencias
- FASE 1 (auth + rol TRABAJADOR)

### Decisiones a NO violar
- Es módulo dentro de Admin, NO app separada

---

## 3.10 FASE 15 — PWA, offline y hardening final + Print Agent

**Estimación:** 5-7 días.

### Alcance (`implementation-plan.md:495-515`)
- 15.1 Manifests + service workers en POS y KDS
- 15.2 IndexedDB stores: `catalog_snapshot`, `pending_operations`, `recent_sales`, `current_shift`
- 15.3 Cola sync con idempotency keys + backoff retries
- 15.4 SW estrategia: GET network-first cache-fallback; POST network-only con queue offline
- 15.5 UI indicators: badge "offline" cuando no hay red, "sincronizando X pendientes"
- 15.6 Bloqueo cierre de turno cuando cola pendiente > 0
- 15.7 Stress test: 50 ventas offline → reconectar → cola drena
- 15.8 Idempotency en backend (ya existe — confirmar TTL 7d funciona en cron)
- 15.9 Rate-limit endpoints públicos (NestJS Throttler) — si no se hizo en 7
- 15.10 Sentry para errores frontend + backend
- 15.11 Health checks completos (`/healthz` con DB ping + LLM ping)

### Schema
- `idempotency_keys` ya existe ✅
- Sin tablas nuevas

### Adapters reemplazos en prod
- `EscPosPrinterAdapter` real reemplaza `LocalFsPrinterAdapter` (`implementation-plan.md:570`)
- `R2StorageAdapter` real reemplaza `LocalFilesystemStorageAdapter` (`implementation-plan.md:585`)
- `MetaWhatsAppAdapter` real swap del mock

### Apps
- `apps/pos`, `apps/kds`, `apps/repa`, `apps/web` (todos los frontends)
- **`apps/print-agent`**: Node service local, ESC/POS via `node-thermal-printer`. Comando apertura cajón. Modo fallback recibo en pantalla si impresora falla. (`implementation-plan.md:1007-1009`)

### Reglas (`architecture.md:752-771`)
- Operaciones offline OK: crear venta, cobrar, imprimir, abrir cajón, cambiar estado KDS
- Operaciones offline NO: abrir turno, cierre turno, crear/editar producto, cargar factura
- "Cierre turno con cola pendiente: UI bloquea botón cierre hasta `pending_operations.length === 0`"
- "Stock derivado calculado en backend al recibir venta, no en cliente"
- "Stock negativo aceptable: se permite, se loguea warning, alerta admin"

### Tests
E2E offline: cierro internet, 3 ventas, vuelvo abrir, sync funciona sin duplicar. Stress: 50 ventas en cola, drenado completo en <10s.

### DoD
- [ ] POS funciona sin internet por 30+ min con 20+ ventas
- [ ] Reconexión sincroniza todo sin pérdida ni duplicación
- [ ] Errors van a Sentry

### Dependencias
- TODAS las fases previas

### Decisiones a NO violar
- "PWA pura + IndexedDB + Service Worker + agente HTTP local. NO Electron, NO Tauri" (`pos-spec.v1.md:25`)
- Idempotency exhaustiva en POSTs offline-replayables

### Pendientes externos (`implementation-plan.md:570-598`)
- Impresora Epson TM-T20III + cajón RJ11
- Cuenta Cloudflare R2 + bucket
- Cuenta Vercel + Railway
- Dominio + DNS
- Sentry tier gratis

### Sprint 16-17-18 (post-FASE 15) según `architecture.md:1080-1107`
- QA con cajero/cocinero/repartidor real
- Deploy producción
- Soft launch 3-4 días
- Runbook documentado
- Capacitación
- Go-live

---

# Sección 4 — Orden recomendado y partición en chats

## 4.1 Orden estricto (por dependencias)

```
5.E (POS UI)
 └→ 6 (KDS + Pantalla Pública) — depende de 5 + WS gateway
    └→ 7 (Web pública) — depende de 5 + 6 (WS para notificar POS)
       └→ 8 (Mapbox 3km) — depende de 7
          └→ 9 (WhatsApp Mock) — depende de 5 + 7
             └→ 10 (Repartidor) — depende de 5 + 6 + 8 + 9
                └→ 11 (Cierre + anti-fraude) — depende de 5 + 9
                   └→ 12 (Auto-pedido IA) — depende de 3 + 4 + 5.C + 9
                      └→ 13 (Reportes) — depende de 5 + 7 + 11 + 14
                         └→ 14 (Trabajadores) — depende de 1 (paralelizable con 11-12)
                            └→ 15 (PWA + Print Agent + hardening) — depende TODO
```

**Notas:**
- FASE 14 puede paralelizarse con FASE 11-12 (no comparte código).
- FASE 13 requiere 14 SOLO para `/reports/labor-cost` — el resto del dashboard puede empezar antes.

## 4.2 Cuándo cerrar contexto y arrancar nuevo chat

**Cerrar contexto** (= arrancar chat dedicado nuevo) cuando:
- Cambia la app principal (apps/pos → apps/kds → apps/web → apps/repa)
- Acumulaste >40k tokens del chat
- Vas a tocar adapters externos nuevos (Mapbox, WhatsApp, etc.)

**Recomendación de chats:**
1. **Chat 5.E** — POS UI completo (este documento + prompt)
2. **Chat FASE 6** — KDS + Pantalla Pública (1 chat)
3. **Chat FASE 7+8** — Web pública + Mapbox (juntas porque 8 es mini)
4. **Chat FASE 9** — WhatsApp Mock + Dev Inbox
5. **Chat FASE 10** — Repartidor (chat propio, app nueva)
6. **Chat FASE 11** — Cierre + anti-fraude
7. **Chat FASE 12** — Auto-pedido IA + Promos UI
8. **Chat FASE 13** — Reportes + Dashboard
9. **Chat FASE 14** — Trabajadores RRHH
10. **Chat FASE 15** — PWA + Print Agent + hardening (puede partirse en 2 chats si es necesario)

## 4.3 Plantilla de prompt para chats subsiguientes

Al cerrar un sprint, el agente debe generar el prompt del próximo chat con:
1. Trabajo actual cerrado (commit ref)
2. Estado vigente (CLAUDE.md sección X)
3. Sección de este `.md` que cubre la fase nueva
4. Reglas universales (Sección 1) referenciadas
5. Decisiones que NO violar
6. Instrucción "espera mi OK antes de codear"

---

# Sección 5 — Cómo NO romper lo existente

## 5.1 Antes de tocar código existente
1. **Leer CLAUDE.md** sección 4 (decisiones arquitectónicas) y sección 10 (NO hacer sin preguntar).
2. **Leer este doc** Sección 1 (reglas universales).
3. **Leer el archivo target completo** antes de modificar.
4. **NO modificar tablas existentes** sin migration nueva con name explicativo.
5. **NO renombrar fields** sin coordinar con todos los consumidores.

## 5.2 Cambios que SIEMPRE rompen
- Cambiar tipos en `@pos-tercos/types/*.ts` sin rebuild ✅ → **siempre `pnpm -F @pos-tercos/types build`** después.
- Agregar campos required a Zod schemas existentes → bumpear versión y/o usar `.optional()`.
- Modificar `AuditAction` enum: solo AGREGAR, nunca quitar (entries históricos quedan inválidos).
- Cambiar valores de enums Prisma: requiere migration ALTER TYPE (PG specific).
- Cambiar el receiverNumber sequence (`receipt_seq`): NUNCA. Saltos detectables son feature.

## 5.3 Cambios que requieren atención especial
- Migrations destructivas: NUNCA. Si `prisma migrate dev` propone DROP, abortar y editar SQL manual.
- Modificar comportamiento de un service público (signature change): bumpear versión + actualizar consumidores en mismo commit.
- Tocar guards/decoradores de auth: regression cero — todos los endpoints deben seguir respetando RBAC documentado.

## 5.4 Tests que DEBEN pasar después de cada cambio
```bash
pnpm typecheck          # 12/12 successful
pnpm lint               # 0 warnings/errors
pnpm -F api build       # si tocó backend
pnpm -F api test        # cuando hay tests
```
Y si tocó endpoints existentes: smoke test e2e con curl del flujo afectado.

## 5.5 Nunca modificar sin preguntar
Lista actualizada de CLAUDE.md sección 10:
- Alcance v1 (definido en pos-spec.v1.md)
- Migraciones aplicadas en producción
- Variables de entorno producción
- Modelo polimórfico stockables (StockableType)
- Conflar lastUnitCost con basePrice
- Eliminar trigger insert-only
- APIs externas reales en dev (Meta, R2)
- Dependencies pesadas (>50KB minified) sin justificar

---

# Sección 6 — Glosario y referencia rápida

## 6.1 Conceptos clave

| Término | Definición |
|---|---|
| **Stockable** | Insumo (`Ingredient`) o Producto direct-resale (`Product` con `directResale=true`). Unificado por `StockableType` |
| **Direct-resale** | Producto comprado y vendido tal cual (Coca-Cola), tiene stock propio en `inventory_movements` |
| **Producto elaborado** | Producto NO direct-resale, sin stock propio, descuenta insumos al venderse vía `expandRecipe` |
| **Subproducto** | Producción intermedia (ej. pollo cocido) consumida por productos elaborados |
| **Receipt number** | Consecutivo continuo monotónico en `sales`, default `nextval('receipt_seq')` |
| **Idempotency-Key** | Header HTTP en POSTs críticos (sales, movements). Cache 7d en `idempotency_keys` |
| **X-Approval-Pin** | Header HTTP con PIN 6 dígitos de Admin/Dueño para acciones sensibles del cajero |
| **Insert-only** | Tablas que solo permiten INSERT (trigger DB rechaza UPDATE/DELETE): `inventory_movements`, `audit_log`, `sale_status_log` |

## 6.2 Roles y permisos

| Rol | Capacidad |
|---|---|
| DUENO | Todo + único Audit log + único Reports + único cambio precio + única decisión >umbral |
| ADMIN_OPERATIVO | Cajero + cocinero + aprueba descuentos/anulaciones del cajero |
| CAJERO | Vende, cobra, imprime, abre cajón con venta, cierra caja |
| COCINERO | KDS solo |
| REPARTIDOR | App repartidor solo |
| TRABAJADOR | Solo perfil dentro Admin (sus horas, su pago) |
| ATENCION_CLIENTE | (Si existe en seed) — ver pedidos web, escalar quejas |

## 6.3 Estados de Sale
`PENDIENTE_PAGO → PAGADO → EN_PREPARACION → LISTO_DESPACHO → ASIGNADO → EN_RUTA → ENTREGADO`
Más estados terminal: `CANCELADO_NO_PAGO, CANCELADO_SIN_REEMBOLSO, INTENTO_FALLIDO, DEVUELTO, EN_DISPUTA, VOID`.

## 6.4 Estados de Shift
`OPEN → CLOSED → RECONCILED` (trigger DB valida `closed_at` coherente con status).

## 6.5 Métodos de pago
`CASH, NEQUI, DAVIPLATA, QR_BANCOLOMBIA, TRANSFER`. Todos los digitales requieren `digitalDoubleVerified=true`.

## 6.6 Cron jobs activos
- `IdempotencyService.purgeExpired` — 3:00 AM diario
- `ReceiptIntegrityService.detectGaps` — 4:00 AM diario, audit `RECEIPT_GAP_DETECTED`
- (FASE 10) Cron timeout `EN_RUTA` 60+ min → alerta admin
- (FASE 10) Cron cancelación `PENDIENTE_PAGO` 30+ min → `CANCELADO_NO_PAGO` + WhatsApp
- (FASE 12) Cron horario auto-pedido IA si insumos < threshold

---

# Sección 7 — Decisiones explícitas a confirmar con el usuario

Algunas fases tienen ambigüedades menores que el agente DEBE resolver con el usuario antes de codear. Lista por fase:

## FASE 5.E
1. ¿Zustand para carrito? (Sí default)
2. ¿Persist localStorage? (Sí default)
3. ¿Botón "Cerrar turno" en topbar? (NO en 5.E, FASE 11)
4. ¿Sidebar en POS? (NO, fullscreen)

## FASE 6
1. ¿Qué WS lib? socket.io (default por estabilidad) vs ws nativo
2. ¿Auth WS por header o por query param? Header (default)
3. ¿Pantalla pública con cuántos próximos turnos? Default 2

## FASE 7
1. ¿Schema `web_session_logs` para conversion funnel? Default sí (FASE 13 lo necesita)
2. ¿Tracking ID en URL `/web/orders/:id?token=` cómo se genera? UUID (default) vs slug (más legible)

## FASE 9
1. Templates: ¿qué wording exacto? Necesita aprobación con usuario (luego para Meta también)
2. ¿`dev_inbox` con TTL? Recomendado 30 días en dev

## FASE 10
1. Repartidor mock para QA: ¿2 o 3 seedeados? Default 2
2. ¿Visibilidad celular cliente: tiempo después de ENTREGADO? Default ocultar inmediatamente

## FASE 11
1. Umbral descuadre WhatsApp (default $5000 COP, ajustar con usuario)
2. ¿2σ vs 3σ para anomalías? Default 2σ

## FASE 12
1. Días de cobertura objetivo (default 7)
2. Cap mensual IA (default $20 USD)

## FASE 13
1. Lib gráficos: Recharts (default por bundle size) vs Chart.js
2. Export PDF: ¿pdfkit, pdfmake o solo browser print?

## FASE 14
1. Schedule de payroll: cron mensual auto vs solo manual? Default manual (Dueño aprueba)

## FASE 15
1. ESC/POS lib: `node-thermal-printer` vs `escpos` raw? Default thermal-printer
2. Service Worker estrategia caché de assets: Workbox default

---

# Sección 8 — Scaffolding mínimo de cada fase

Plantilla que el agente codeador debe seguir al arrancar cada fase nueva:

```
1. Leer CLAUDE.md sección 5 (schema DB) + sección 8 (estado fases) + sección 10 (NO hacer)
2. Leer este doc Sección 1 (reglas universales) + Sección 3.X (fase específica)
3. Confirmar con usuario decisiones de Sección 7 (si hay)
4. TodoWrite con sub-tareas (un sub-todo por feature/endpoint principal)
5. Si schema DB nuevo: prisma migrate dev --create-only --name <descriptive> → editar SQL → migrate deploy
6. Build types: pnpm -F @pos-tercos/types build (si tocaste types)
7. Implementar cada sub-tarea con commit separado
8. Después de cada sub-tarea: pnpm typecheck && pnpm lint
9. E2E manual con curl (smoke test mínimo) antes de cerrar el sprint
10. Actualizar CLAUDE.md (sección 5 si tocó schema, sección 8 con commit, sección 13 con próxima fase)
11. Final commit: `feat(<dominio>): FASE X.Y <título>` con body detallado
```

---

# Sección 9 — Checklist de cierre v1 (post-FASE 15)

Cuando todas las fases están cerradas, antes del go-live:

- [ ] `pnpm typecheck` 12/12
- [ ] `pnpm lint` 0 warnings
- [ ] `pnpm test` todos pasando
- [ ] `testing-guide.md` cubre todas las fases (sec 1-15)
- [ ] CLAUDE.md actualizado al 100%
- [ ] Backups DB programados (Railway tier)
- [ ] Sentry recibiendo errores de prod
- [ ] R2 bucket configurado + adapter swap
- [ ] Vercel deployments con preview URLs
- [ ] Railway con healthchecks + auto-restart
- [ ] Dominio resuelve correctamente
- [ ] DIAN reviewed (legal externo)
- [ ] Cajero/cocinero/repartidor reales entrenados
- [ ] Runbook de incidencias documentado
- [ ] Soft launch 3-4 días sin clientes finales (interno + amigos del dueño)
- [ ] Go-live oficial

---

**FIN DEL DOCUMENTO.** 9 secciones, ~13 fases cubiertas, ~5500 palabras de spec exhaustiva.
