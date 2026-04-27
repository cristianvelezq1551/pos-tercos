# Guía de pruebas — FASE 0 → 3

> Esta guía cubre TODO lo construido hasta el último commit. Está pensada para que puedas validar el sistema end-to-end en una sola sentada (~45-60 min sin contar troubleshooting).
>
> Estado del código en este punto:
> - ✅ FASE 0: monorepo + 6 apps + paquetes compartidos + ESLint + Prettier
> - ✅ FASE 1: auth JWT con cookies + roles + middleware Next.js (admin)
> - ✅ FASE 2: catálogo completo (productos, subproductos, insumos, recetas, expanded-cost)
> - ✅ FASE 3: inventario insert-only + audit log

---

## 0. Cuentas de prueba (todas con password `dev12345`)

| Email | Rol | Acceso al Admin |
|---|---|---|
| `dueno@dev.local` | DUENO | Total (incluyendo audit log) |
| `admin@dev.local` | ADMIN_OPERATIVO | Catálogo + Inventario, **NO** audit log |
| `cajero@dev.local` | CAJERO | Bloqueado (redirect a /unauthorized) |
| `cocinero@dev.local` | COCINERO | Bloqueado |
| `repa@dev.local` | REPARTIDOR | Bloqueado |
| `trabajador@dev.local` | TRABAJADOR | Bloqueado |

---

## 1. Pre-requisitos del sistema

### 1.1 Software base

```bash
node --version    # v20.x o superior (recomendado v22)
pnpm --version    # 10.x
docker --version  # 24.x o superior
git --version     # 2.x
```

Si te falta algo, instalalo así (macOS):

```bash
brew install node@22 pnpm git
brew install --cask docker
```

### 1.2 Docker Desktop activo

```bash
docker info >/dev/null 2>&1 && echo "Docker OK" || open -a Docker
```

Si Docker estaba apagado, esperá ~15 segundos a que arranque.

### 1.3 Puertos libres

El sistema usa estos puertos. Antes de arrancar, asegurate de que estén libres:

```bash
for port in 3001 3004 5432; do
  if lsof -i :$port >/dev/null 2>&1; then
    echo "⚠️  Puerto $port en uso:"
    lsof -i :$port | head -2
  else
    echo "✓ Puerto $port libre"
  fi
done
```

Si alguno está ocupado por un proceso anterior tuyo, matalo:

```bash
PID=$(lsof -i :3001 | grep LISTEN | awk '{print $2}'); [ -n "$PID" ] && kill -9 $PID
PID=$(lsof -i :3004 | grep LISTEN | awk '{print $2}'); [ -n "$PID" ] && kill -9 $PID
```

---

## 2. Setup inicial (solo la primera vez en una máquina nueva)

Si ya levantaste el proyecto antes, saltá a la sección 3.

### 2.1 Clonar y instalar

```bash
cd ~/Documents
git clone https://github.com/cristianvelezq1551/pos-tercos.git TERCOS
cd TERCOS
pnpm install
```

Esperá ~30 segundos. Al final debería decir `Done in N seconds using pnpm v10.x`.

### 2.2 Variables de entorno del API

```bash
cd apps/api
cp .env.example .env 2>/dev/null || cat > .env <<'EOF'
DATABASE_URL=postgresql://pos:pos_dev@localhost:5432/pos_tercos_dev?schema=public
JWT_ACCESS_SECRET=dev-access-secret-change-me
JWT_REFRESH_SECRET=dev-refresh-secret-change-me
API_PORT=3001
API_HOST=0.0.0.0
CORS_ORIGINS=http://localhost:3000,http://localhost:3002,http://localhost:3003,http://localhost:3004,http://localhost:3005,http://localhost:3006
RESTAURANT_LAT=4.6533
RESTAURANT_LNG=-74.0836
RESTAURANT_DELIVERY_RADIUS_KM=3
EOF
cd ../..
```

Verificar que existe:
```bash
test -f apps/api/.env && echo "✓ apps/api/.env existe"
```

### 2.3 Variables de entorno del Admin

```bash
cat > apps/admin/.env.local <<'EOF'
JWT_ACCESS_SECRET=dev-access-secret-change-me
API_INTERNAL_URL=http://localhost:3001
EOF
test -f apps/admin/.env.local && echo "✓ apps/admin/.env.local existe"
```

### 2.4 Levantar Postgres y aplicar migrations

```bash
docker compose up -d postgres

# Esperar que esté ready (~5s)
until docker exec pos-tercos-postgres pg_isready -U pos -d pos_tercos_dev >/dev/null 2>&1; do sleep 1; done
echo "✓ Postgres listo"

# Aplicar migrations
cd apps/api
pnpm prisma migrate deploy

# Generar Prisma Client
pnpm prisma:generate

# Sembrar usuarios de dev
pnpm prisma:seed
cd ../..
```

Resultado esperado del seed:
```
✓ user dueno@dev.local (DUENO)
✓ user admin@dev.local (ADMIN_OPERATIVO)
✓ user cajero@dev.local (CAJERO)
✓ user cocinero@dev.local (COCINERO)
✓ user repa@dev.local (REPARTIDOR)
✓ user trabajador@dev.local (TRABAJADOR)
```

---

## 3. Levantar infraestructura cada vez

```bash
cd ~/Documents/TERCOS

# 1. Postgres (si no está corriendo)
docker compose up -d postgres

# 2. API NestJS — terminal 1
cd apps/api && pnpm dev
# Quedate viendo el log; debería terminar con:
# [api] listening on http://localhost:3001

# 3. Admin Next.js — terminal 2 (otra ventana)
cd ~/Documents/TERCOS/apps/admin && pnpm dev
# Debería terminar con:
# - Local:        http://localhost:3004
# - Ready in 1.5s
```

Para apagar: `Ctrl+C` en cada terminal y `docker compose stop` cuando termines del todo.

---

## 4. Smoke test rápido (5 min)

Estos 4 chequeos te confirman que todo está en pie. Si pasan, podés ir directo a la sección 5+.

### 4.1 Health check

```bash
curl -s http://localhost:3001/healthz
```

**Esperado:**
```json
{"status":"ok","timestamp":"...","checks":{"db":"ok"}}
```

### 4.2 Login funciona

```bash
curl -s -H "Content-Type: application/json" \
  -d '{"email":"dueno@dev.local","password":"dev12345"}' \
  http://localhost:3001/auth/login | python3 -m json.tool
```

**Esperado:** un JSON con `accessToken` (largo) + `user` con `role: "DUENO"`.

### 4.3 Admin renderiza

Abrir en browser: <http://localhost:3004>

**Esperado:** redirige a `/login` y muestra el form de login.

### 4.4 Login UI funciona

En la pantalla de login:
- Email: `dueno@dev.local`
- Password: `dev12345`
- Click "Ingresar"

**Esperado:** entra al dashboard con 4 stat cards y sidebar con secciones Operación / Catálogo / Inventario / Auditoría.

Si los 4 chequeos pasan, **el sistema está sano**. Si alguno falla, ver sección 9 (troubleshooting).

---

## 5. Tests detallados — FASE 0 (Setup)

### 5.1 Workspace + typecheck

```bash
cd ~/Documents/TERCOS
pnpm typecheck
```

**Esperado:**
```
Tasks:    12 successful, 12 total
```

### 5.2 Lint clean

```bash
pnpm lint
```

**Esperado:** sin output adicional (0 errores, 0 warnings).

### 5.3 Build de paquetes compartidos

```bash
pnpm --filter @pos-tercos/types --filter @pos-tercos/domain build
ls packages/types/dist/ packages/domain/dist/
```

**Esperado:** archivos `.js` y `.d.ts` en ambos `dist/`.

### 5.4 Que las 6 apps Next arranquen (smoke individual)

Probá cada una individualmente (cada una ocupa un puerto distinto):

```bash
# Web pública (puerto 3000)
cd apps/web && pnpm dev &
sleep 6 && curl -s http://localhost:3000 | grep -o "Web Pública"
pkill -f "next dev" && sleep 2

# POS (3002)
cd ../pos && pnpm dev &
sleep 6 && curl -s http://localhost:3002 | grep -o "POS Cajero"
pkill -f "next dev" && sleep 2

# KDS (3003)
cd ../kds && pnpm dev &
sleep 6 && curl -s http://localhost:3003 | grep -o "KDS Cocina"
pkill -f "next dev" && sleep 2

# Pantalla pública (3005)
cd ../public-display && pnpm dev &
sleep 6 && curl -s http://localhost:3005 | grep -o "Pantalla Pública"
pkill -f "next dev" && sleep 2

# Repartidor (3006)
cd ../repa && pnpm dev &
sleep 6 && curl -s http://localhost:3006 | grep -o "App Repartidor"
pkill -f "next dev" && sleep 2

cd ../..
```

**Esperado:** cada `grep` devuelve el nombre de la app. Las 5 apps de ejemplo son placeholders.

---

## 6. Tests detallados — FASE 1 (Auth y roles)

> Asume API arriba en :3001 y admin arriba en :3004.

### 6.1 Login con credenciales correctas (DUENO)

**API directo:**
```bash
curl -s -c /tmp/cookies.txt \
  -H "Content-Type: application/json" \
  -d '{"email":"dueno@dev.local","password":"dev12345"}' \
  http://localhost:3001/auth/login | python3 -m json.tool
```

**Esperado:**
- `accessToken` presente
- `user.role` = `"DUENO"`
- `user.fullName` = `"Dueño Dev"`
- En `/tmp/cookies.txt`: 2 cookies httpOnly (`pos_access` y `pos_refresh`)

```bash
grep -E "(pos_access|pos_refresh)" /tmp/cookies.txt
```

### 6.2 Login con password incorrecta

```bash
curl -s -o /tmp/fail.json -w "HTTP %{http_code}\n" \
  -H "Content-Type: application/json" \
  -d '{"email":"dueno@dev.local","password":"wrong"}' \
  http://localhost:3001/auth/login
cat /tmp/fail.json
```

**Esperado:** `HTTP 401` con `{"message":"Invalid credentials","error":"Unauthorized","statusCode":401}`.

### 6.3 GET /auth/me sin token

```bash
curl -s -o /tmp/me.json -w "HTTP %{http_code}\n" http://localhost:3001/auth/me
cat /tmp/me.json
```

**Esperado:** `HTTP 401` con `"Missing access token"`.

### 6.4 GET /auth/me con cookie (no Bearer)

```bash
curl -s -b /tmp/cookies.txt http://localhost:3001/auth/me | python3 -m json.tool
```

**Esperado:** payload del user (id, email, role, etc.). Esto verifica que el guard también acepta cookies.

### 6.5 Refresh rota el token

```bash
curl -s -b /tmp/cookies.txt -c /tmp/cookies.txt -X POST http://localhost:3001/auth/refresh | python3 -m json.tool
```

**Esperado:** `{"accessToken": "..."}` con cookie `pos_refresh` rotada (nuevo valor en `/tmp/cookies.txt`).

### 6.6 Logout limpia cookies

```bash
curl -s -o /dev/null -w "HTTP %{http_code}\n" \
  -b /tmp/cookies.txt -c /tmp/cookies.txt \
  -X POST http://localhost:3001/auth/logout
```

**Esperado:** `HTTP 204`.

### 6.7 Refresh tras logout falla

```bash
curl -s -o /tmp/r.json -w "HTTP %{http_code}\n" \
  -b /tmp/cookies.txt -X POST http://localhost:3001/auth/refresh
cat /tmp/r.json
```

**Esperado:** `HTTP 401` con `"Missing refresh token"` (porque el logout limpió la cookie).

### 6.8 UI: login + middleware en admin

En el browser:

1. **<http://localhost:3004>** sin login → redirige a `/login`.
2. **/login** muestra el form de `<LoginForm />`.
3. Ingresar `dueno@dev.local` / `dev12345` → redirige al dashboard.
4. En el topbar arriba a la derecha aparece el avatar con iniciales **DD** y el rol `DUENO`.
5. Click "Cerrar sesión" → redirige a `/login`.

### 6.9 Cajero rechazado por middleware

1. Login con `cajero@dev.local` / `dev12345`.
2. **Esperado:** la página muestra el LoginForm con error en rojo "Tu rol (CAJERO) no tiene acceso a esta app." (validación client-side antes del redirect).
3. Si forzás navegación: abrir devtools → Application → Cookies → ver que SÍ hay `pos_access` con un JWT válido pero al ir a `/` el middleware redirige a `/unauthorized`.

### 6.10 Admin operativo accede

1. Logout primero.
2. Login con `admin@dev.local` / `dev12345`.
3. **Esperado:** entra al dashboard normalmente. Avatar muestra `AO` y rol `ADMIN_OPERATIVO`.

---

## 7. Tests detallados — FASE 2 (Catálogo + recetas)

> Login como `dueno@dev.local` / `dev12345` antes de empezar.

### 7.1 Crear insumo desde UI

1. Sidebar → **Catálogo > Insumos**.
2. Esperado: si es la primera vez, ves empty state "Aún no tenés insumos cargados."
3. Click **Nuevo insumo**.
4. Llenar:
   - Nombre: `Pollo crudo`
   - Unidad de compra: `kg`
   - Unidad de receta: `g`
   - Factor de conversión: `1000`
   - Stock mínimo: `2000`
5. Click **Crear insumo**.
6. **Esperado:** redirige a `/ingredients` con el insumo en la tabla. Estado: `Activo`.

### 7.2 Crear más insumos

Crear: `Sal` (kg → g, factor 1000, threshold 0), `Pan brioche` (unidad → unidad, factor 1, threshold 50).

**Esperado:** los 3 insumos aparecen en la tabla.

### 7.3 Editar un insumo

1. Click "Editar" en la fila de `Sal`.
2. Cambiar threshold a `200`.
3. Click **Guardar cambios**.
4. **Esperado:** vuelve a `/ingredients`, threshold actualizado.

### 7.4 Validación: factor no positivo

1. Click **Nuevo insumo**.
2. Nombre `X`, unidades, **factor 0**.
3. Click crear.
4. **Esperado:** error inline "El factor de conversión debe ser un número positivo."

### 7.5 Crear subproducto

1. Sidebar → **Subproductos**.
2. Click **Nuevo subproducto**.
3. Llenar:
   - Nombre: `Pollo Nashville cocido`
   - Yield: `7`
   - Unidad: `unidad`
4. Click **Crear subproducto**.
5. **Esperado:** aparece en la tabla con yield 7 / unidad.

### 7.6 Setear receta del subproducto

1. En la fila de `Pollo Nashville cocido`, click **Receta**.
2. URL: `/subproducts/[id]/recipe`.
3. Header: `Receta · Subproducto` + nombre.
4. La tabla está vacía con mensaje "La receta está vacía."
5. En la sección "Agregar item":
   - Tipo: **Insumo** (radio)
   - Insumo: `Pollo crudo (g)`
   - Cantidad neta: `1000`
   - Merma %: `5`
   - Click **+ Agregar**
6. Repetir para Sal:
   - Insumo: `Sal (g)`
   - Cantidad: `5`
   - Merma: `5`
7. **Esperado:** la tabla muestra ambas filas, columnas:
   - `Sal`: cant 5, merma 5%, **bruto 5.2632** (= 5 / 0.95)
   - `Pollo crudo`: cant 1000, merma 5%, **bruto 1052.6316**
8. Indicator amber arriba: "Cambios sin guardar".
9. Click **Guardar receta**.
10. **Esperado:** indicator pasa a "Receta sincronizada con servidor." (gris).

### 7.7 Crear producto

1. Sidebar → **Productos**.
2. Click **Nuevo producto**.
3. Llenar:
   - Nombre: `Hamburguesa Nashville`
   - Descripción: `Pollo crujiente con salsa Nashville en pan brioche.`
   - Precio base: `18000`
   - Categoría: `Hamburguesas`
   - Marcar "Permite modificadores"
   - **NO** marcar "Es un combo"
4. Click **Crear producto**.
5. **Esperado:** redirige a `/products`. Tabla muestra: nombre, categoría `Hamburguesas`, tipo `Individual`, precio `$ 18.000`, estado `Activo`.

### 7.8 Setear receta del producto

1. Click **Receta** en `Hamburguesa Nashville`.
2. URL: `/products/[id]/recipe`. Header `Receta · Producto`.
3. En "Agregar item":
   - Tipo: **Subproducto**
   - Subproducto: `Pollo Nashville cocido (unidad)`
   - Cantidad: `1`
   - Merma: `0`
   - Click **+ Agregar**
4. Agregar otro: tipo Insumo, `Pan brioche (unidad)`, cant 1, merma 0.
5. Click **Guardar receta**.
6. **Esperado:** sección "Desglose de insumos por unidad vendida" muestra automáticamente:

| Insumo | Cantidad total | Unidad |
|---|---|---|
| Pollo crudo | 150.3759 | g |
| Sal | 0.7519 | g |
| Pan brioche | 1 | unidad |

> **Por qué esos números:** 1 hamburguesa = 1 pollo cocido (yield 7) + 1 pan. 1 unidad de pollo cocido = 1/7 de batch. Batch consume 1000g pollo crudo + 5g sal con 5% merma cada uno. Entonces 1052.63/7 ≈ 150.376 y 5.26/7 ≈ 0.752.

### 7.9 Validación: ciclo en receta de subproducto

1. Crear un segundo subproducto: `Pasta intermedia`, yield 1, unidad.
2. Setear su receta con un insumo cualquiera (pasarlo a "guardado").
3. Editar la receta de `Pollo Nashville cocido`:
   - Eliminar todos los edges existentes (click "Quitar").
   - Agregar un Subproducto: `Pasta intermedia`.
   - Guardar.
4. Ahora editar la receta de `Pasta intermedia`:
   - Agregar Subproducto: `Pollo Nashville cocido` (esto crearía ciclo Pasta → Pollo → Pasta).
   - Click Guardar receta.
5. **Esperado:** error rojo "Recipe would create a cycle (ciclo: ...)". El backend rechaza.

### 7.10 Validación: subproducto referenciándose a sí mismo

1. Editar receta de `Pasta intermedia`.
2. Intentar agregar el subproducto **Pasta intermedia** mismo.
3. **Esperado:** el dropdown de selección filtra y NO muestra `Pasta intermedia` como opción (filtro client-side `subproductsAvailable`).

### 7.11 Crear combo

1. Productos → Nuevo producto.
2. Llenar:
   - Nombre: `Combo Familiar`
   - Precio base: `0`
   - Categoría: `Combos`
   - Marcar "Es un combo"
   - Aparece campo "Precio del combo (COP)": `35000`
3. Click crear.
4. **Esperado:** tabla muestra el combo con badge `Combo` (azul) y precio `$ 35.000`.

### 7.12 Validación: combo sin precio

1. Editar `Combo Familiar`.
2. Borrar el campo "Precio del combo".
3. Click guardar.
4. **Esperado:** error: "comboPrice is required when isCombo is true" (Zod superRefine).

### 7.13 Desactivar producto

1. Editar cualquier producto.
2. Click **Desactivar** (botón rojo).
3. Confirmar el dialog del browser.
4. **Esperado:** redirige a /products. La fila ahora muestra `Inactivo` en gris.

### 7.14 RBAC: cajero no puede crear

```bash
ACCESS_CAJ=$(curl -s -H "Content-Type: application/json" -d '{"email":"cajero@dev.local","password":"dev12345"}' http://localhost:3001/auth/login | python3 -c "import json,sys; print(json.load(sys.stdin)['accessToken'])")

curl -s -o /tmp/forbid.json -w "HTTP %{http_code}\n" \
  -H "Authorization: Bearer $ACCESS_CAJ" \
  -H "Content-Type: application/json" \
  -d '{"name":"X","unitPurchase":"kg","unitRecipe":"g","conversionFactor":1}' \
  http://localhost:3001/ingredients
cat /tmp/forbid.json
```

**Esperado:** `HTTP 403` con `"Role CAJERO is not allowed for this resource"`.

### 7.15 Endpoint expanded-cost directo

```bash
ACCESS=$(curl -s -H "Content-Type: application/json" -d '{"email":"dueno@dev.local","password":"dev12345"}' http://localhost:3001/auth/login | python3 -c "import json,sys; print(json.load(sys.stdin)['accessToken'])")
HAMB_ID=$(curl -s -H "Authorization: Bearer $ACCESS" http://localhost:3001/products | python3 -c "import json,sys; [print(p['id']) for p in json.load(sys.stdin) if p['name']=='Hamburguesa Nashville']" | head -1)

curl -s -H "Authorization: Bearer $ACCESS" "http://localhost:3001/products/$HAMB_ID/expanded-cost" | python3 -m json.tool
```

**Esperado:** los mismos números de 7.8 vía API directo (Pollo crudo 150.376, Sal 0.752, Pan brioche 1).

---

## 8. Tests detallados — FASE 3 (Inventario + audit)

### 8.1 Stock view inicialmente vacío

En UI: Sidebar → **Inventario > Stock**.

**Esperado:** tabla con todos los insumos cargados. `Stock actual` = 0 para todos. **Filas en amber** para los que tienen `threshold > 0` (porque 0 < threshold = `Stock crítico`).

### 8.2 Cargar stock inicial — UI

1. En la fila de **Pollo crudo**, click **Ajustar**.
2. Página `/inventory/[id]/adjust`:
   - Tipo: **Stock inicial**
   - Magnitud: `5000`
   - Notas: `Carga inicial setup`
3. Verificar que aparece la **proyección**: "5000 g" en negro (no amber, porque 5000 > 2000 threshold).
4. Click **Registrar movimiento**.
5. **Esperado:** redirige a `/inventory`. Pollo crudo ahora muestra:
   - Stock actual: `5,000`
   - Estado: `OK` (verde)
   - Fila ya no en amber.

### 8.3 Cargar stock para todos

Repetir 8.2 para Sal (`500`) y Pan brioche (`100`).

**Esperado:** tabla con stocks reales. **Pan brioche** debería mostrar `Stock crítico` si tiene threshold ≥ 100, ajustar cantidad si querés probar el caso amber.

### 8.4 Movimiento de tipo Merma

1. Stock → fila Pollo crudo → **Ajustar**.
2. Tipo: **Merma**. Notar que la sección "Dirección" desaparece (Merma fuerza Salida).
3. Magnitud: `200`.
4. Notas: `Pérdida durante limpieza`.
5. **Esperado:** proyección "5000 − 200 = 4800 g".
6. Registrar.
7. **Esperado:** stock pasa a 4800.

### 8.5 Ajuste manual con dirección Salida

1. Ajustar Pollo crudo.
2. Tipo: **Ajuste manual**.
3. Dirección: **Salida (−)**.
4. Magnitud: `100`.
5. Notas: `Conteo físico, faltante`.
6. Registrar.
7. **Esperado:** stock 4800 → 4700.

### 8.6 Ver historial de un insumo

1. Stock → fila Pollo crudo → **Historial**.
2. URL: `/inventory/movements?ingredient_id=...`.
3. **Esperado:** filtro pre-seleccionado, tabla con los 3 movimientos en orden descendente:
   - Ajuste manual / `−100` / "Conteo físico, faltante"
   - Merma / `−200` / "Pérdida durante limpieza"
   - Stock inicial / `+5000` / "Carga inicial setup"
4. Cada fila muestra fecha, badge tonal, delta con color, notas, "Por: Dueño Dev".

### 8.7 Movimientos sin filtros

1. URL: `/inventory/movements`.
2. **Esperado:** todos los movimientos de todos los insumos en orden descendente.

### 8.8 Filtrar por tipo

1. En el filtro Tipo: elegir **Merma**.
2. Click **Aplicar**.
3. **Esperado:** solo aparecen los movimientos `WASTE`.

### 8.9 Combinar filtros + limpiar

1. Filtro Insumo: Pollo crudo. Filtro Tipo: Stock inicial. Aplicar.
2. **Esperado:** solo el movimiento `INITIAL` de Pollo crudo.
3. Click **Limpiar filtros**.
4. **Esperado:** vuelve a ver todos.

### 8.10 Audit log — DUENO

1. Sidebar → **Auditoría > Log**.
2. URL: `/audit`.
3. **Esperado:** tabla con muchas entradas (tantos AUTH_LOGIN como veces que entraste, AUTH_LOGOUT, INVENTORY_MOVEMENT_INITIAL/WASTE/MANUAL, PRODUCT_*, INGREDIENT_*, RECIPE_UPDATED, etc.).
4. Las entradas tienen badge tonal por categoría (azul=auth, verde=inventory, púrpura=catalog, rojo=failed, amber=sale, gris=other).

### 8.11 Expandir detalle del audit

1. En cualquier fila con "Ver detalle", click el link.
2. **Esperado:** se expande una fila debajo con bloques `Metadata`, `Antes`, `Después` (los que apliquen) en JSON formateado.

### 8.12 Login fallido genera audit

```bash
curl -s -o /dev/null -H "Content-Type: application/json" \
  -d '{"email":"dueno@dev.local","password":"WRONG"}' \
  http://localhost:3001/auth/login
```

Volver al admin, refrescar `/audit`.

**Esperado:** la fila más reciente es `AUTH_LOGIN_FAILED`. Click "Ver detalle" → metadata muestra `{ email: "dueno@dev.local", reason: "wrong_password" }`.

### 8.13 Audit para Admin Operativo (acceso denegado)

1. Logout.
2. Login con `admin@dev.local` / `dev12345`.
3. Sidebar → **Auditoría > Log**.
4. **Esperado:** mensaje amber:
   > "Solo el Dueño puede ver el log de auditoría."
5. **Importante:** la tabla NO se renderiza (no hay leak de datos al admin operativo).

### 8.14 Cajero bloqueado por middleware (no llega a /audit)

1. Logout.
2. Intentar login con `cajero@dev.local` desde la UI.
3. **Esperado:** error inline en login (rol no autorizado).
4. Si forzás `/audit` con cookie de cajero (manualmente desde devtools), el middleware Next.js te redirige a `/unauthorized`.

### 8.15 Insert-only enforcement a nivel DB

```bash
docker exec pos-tercos-postgres psql -U pos -d pos_tercos_dev -c "UPDATE audit_log SET action='HACKED' WHERE id IN (SELECT id FROM audit_log LIMIT 1);"
```

**Esperado:** `ERROR: Table audit_log is insert-only; UPDATE/DELETE rejected`.

```bash
docker exec pos-tercos-postgres psql -U pos -d pos_tercos_dev -c "DELETE FROM inventory_movements;"
```

**Esperado:** mismo error para `inventory_movements`.

### 8.16 Check constraint delta != 0

```bash
ACCESS=$(curl -s -H "Content-Type: application/json" -d '{"email":"dueno@dev.local","password":"dev12345"}' http://localhost:3001/auth/login | python3 -c "import json,sys; print(json.load(sys.stdin)['accessToken'])")
POLLO_ID=$(curl -s -H "Authorization: Bearer $ACCESS" http://localhost:3001/ingredients | python3 -c "import json,sys; [print(i['id']) for i in json.load(sys.stdin) if i['name']=='Pollo crudo']" | head -1)

curl -s -o /tmp/zero.json -w "HTTP %{http_code}\n" \
  -H "Authorization: Bearer $ACCESS" \
  -H "Content-Type: application/json" \
  -d "{\"ingredientId\":\"$POLLO_ID\",\"delta\":0,\"type\":\"MANUAL_ADJUSTMENT\"}" \
  http://localhost:3001/inventory/movements
cat /tmp/zero.json
```

**Esperado:** `HTTP 400` con error de Zod ("delta must not be zero") — Zod valida ANTES de tocar la DB.

### 8.17 Idempotency key

Mismo movement enviado dos veces con mismo `idempotencyKey` debe devolver el primero (no duplicar):

```bash
KEY="test-idem-$(date +%s)"
curl -s -H "Authorization: Bearer $ACCESS" -H "Content-Type: application/json" \
  -d "{\"ingredientId\":\"$POLLO_ID\",\"delta\":1,\"type\":\"MANUAL_ADJUSTMENT\",\"idempotencyKey\":\"$KEY\"}" \
  http://localhost:3001/inventory/movements | python3 -c "import json,sys; print('first:', json.load(sys.stdin)['id'])"

curl -s -H "Authorization: Bearer $ACCESS" -H "Content-Type: application/json" \
  -d "{\"ingredientId\":\"$POLLO_ID\",\"delta\":1,\"type\":\"MANUAL_ADJUSTMENT\",\"idempotencyKey\":\"$KEY\"}" \
  http://localhost:3001/inventory/movements | python3 -c "import json,sys; print('second:', json.load(sys.stdin)['id'])"
```

**Esperado:** el `id` de "first" y "second" es **el mismo** (la segunda vez retorna el row original, no crea uno nuevo).

### 8.18 Stock crítico en dashboard

1. Volver al **Dashboard** (logo o sidebar Operación).
2. Mirar la card "Stock crítico".
3. **Esperado:** muestra el número real de insumos con `currentStock < thresholdMin`. Si todo está OK, muestra `0`. Card está en gris si 0, amber si > 0.

### 8.19 Toggle "Solo stock crítico"

1. Sidebar → Inventario > Stock.
2. Si tenés algún insumo en crítico, click **Solo stock crítico**.
3. **Esperado:** la tabla filtra y solo muestra los que tienen `lowStock=true`.
4. Click **Ver todos** para volver.

---

## 9. Cleanup / Reset

### 9.1 Reset completo (perdés todos los datos)

```bash
cd ~/Documents/TERCOS/apps/api
pnpm db:reset
# Confirmar con `y` cuando pregunte. Esto borra y recrea las tablas.
pnpm prisma:seed
cd ../..
```

### 9.2 Solo apagar todo

```bash
# Ctrl+C en cada terminal de pnpm dev
docker compose stop
```

### 9.3 Eliminar volumen de Postgres (datos persistentes en disco)

```bash
docker compose down -v   # ⚠️ borra el volumen pos-tercos-pgdata
```

---

## 10. Troubleshooting común

### 10.1 `pnpm dev` del API arranca pero crashea con `Cannot find module '@pos-tercos/types'`

Causa: `packages/types` o `packages/domain` no están compilados.

Fix:
```bash
pnpm --filter @pos-tercos/types --filter @pos-tercos/domain build
```

### 10.2 `pnpm typecheck` falla en `apps/admin` con `.next/types/...`

Causa: cache stale de Next.js de una versión anterior de los archivos.

Fix:
```bash
rm -rf apps/admin/.next
pnpm typecheck
```

### 10.3 Login en UI da error "Network error" o no responde

Causa: API no está corriendo o no acepta CORS.

Fix:
```bash
curl -s http://localhost:3001/healthz   # debe responder
```

Si no responde, verificá que la terminal del API NestJS esté arriba.

### 10.4 Postgres no acepta conexiones

```bash
docker compose ps postgres
docker logs pos-tercos-postgres --tail 20
```

Si el container no está corriendo:
```bash
docker compose up -d postgres
```

### 10.5 Prisma genera error "Can't reach database server"

Causa: probablemente Postgres no está arriba o la DATABASE_URL es incorrecta.

Fix:
```bash
cat apps/api/.env | grep DATABASE_URL
# Debe ser: postgresql://pos:pos_dev@localhost:5432/pos_tercos_dev?schema=public
docker exec pos-tercos-postgres pg_isready -U pos -d pos_tercos_dev
```

### 10.6 Error en migration: "Already applied"

Si ves `Database schema is already in sync with the migrations`, está bien — significa que las migrations ya estaban aplicadas. Si querés forzar un reset:
```bash
cd apps/api && pnpm db:reset
```

### 10.7 Subir un cookies file inválido (error 401 en curl)

Si los tests con curl te dan 401 porque el cookies file está stale:
```bash
rm -f /tmp/cookies.txt /tmp/c.txt /tmp/admin.txt /tmp/cajero.txt
# Volver a hacer login para regenerarlo
```

### 10.8 Pude crear un combo sin comboPrice

No deberías poder. Si sucede, el bug está en la validación Zod del backend. Verificar que `CreateProductSchema` en `packages/types/dist/catalog.js` tiene el `superRefine`. Si no, rebuild:
```bash
pnpm --filter @pos-tercos/types build
```

### 10.9 El recipe editor no muestra el "Desglose de insumos"

Causa más probable: hay cambios sin guardar en el draft (indicator amber arriba "Cambios sin guardar"). El expanded-cost solo se calcula cuando la receta está sincronizada con servidor.

Fix: click **Guardar receta**. El desglose aparece después.

### 10.10 `pnpm install` warning sobre `Ignored build scripts`

Ya está manejado en `package.json` raíz con `pnpm.onlyBuiltDependencies`. Si ves nuevas warnings al agregar deps, agregá el paquete a esa lista.

---

## 11. Checklist final (mini-resumen)

Antes de pasar a FASE 4, deberías poder marcar los siguientes:

- [ ] Smoke test (sección 4): healthz, login API, admin UI, login UI
- [ ] FASE 0: typecheck + lint OK; las 6 apps Next renderizan placeholder
- [ ] FASE 1: 7 tests de auth via curl (sec 6.1-6.7) + UI flow + cajero rechazado + admin operativo entra
- [ ] FASE 2: 3 insumos creados, 1 subproducto con receta, 1 producto con receta, expanded-cost matemáticamente correcto, 1 combo, validaciones (factor positivo, comboPrice, ciclo)
- [ ] FASE 3: stock cargado para los 3 insumos, 3 movements visibles en historial, audit log con 10+ entradas, admin operativo bloqueado de /audit, insert-only enforcement DB, idempotency key

Si algún test falla, ver sección 10 (troubleshooting) o reportarlo con el comando exacto y el output recibido.
