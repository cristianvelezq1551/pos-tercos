# Ir a producción — Runbook + Entornos QA/Prod

> **Documento de arranque para el deploy.** Es el "empezá acá": el orden exacto de pasos para
> lanzar, más cómo montar un entorno **QA** para probar features/bugs sin tocar producción.
> El detalle exhaustivo (tabla completa de env vars, lista de migraciones, gates de la web)
> vive en **`deploy.md`** — este doc lo orquesta y no lo duplica para evitar drift.
>
> Última revisión: 2026-07-21 (post re-auditoría de producción, ver `AUDITORIA-QA-2026-07-20.md` §FASE 6).

---

## 0. Mapa de entornos

| | **dev (local)** | **QA / staging** | **producción** |
|---|---|---|---|
| Para qué | Codear en tu máquina | Probar features/bugs con datos de prueba | El local real |
| Rama que despliega | — (local) | `main` | `prod` |
| Backend | `pnpm dev` (:3001) | Railway env **qa** | Railway env **production** |
| Postgres | Docker local | Postgres QA (aparte) | Postgres prod (aparte) |
| `NODE_ENV` | `development` | `production` * | `production` |
| Frontends | `pnpm dev` | Vercel Preview + `*-qa.tercos.co` | Vercel Production (`admin.tercos.co`, …) |
| WhatsApp | Mock | **Mock** (sin `KAPSO_*`) | Kapso real |
| Storage | Local FS | R2 bucket **qa** (o local) | R2 bucket **prod** |
| IA facturas | Anthropic real o mock | Anthropic (saldo bajo) | Anthropic real |
| Impresora | Dump a disco | Dump a disco | Print-agent físico (Pi) |
| Costo extra | $0 | ~$5–10 USD/mes | ~$50–75 USD/mes |

> \* QA corre con `NODE_ENV=production` para **ejercer el mismo código que prod** (CORS estricto,
> validaciones de boot), pero con integraciones de prueba. Si querés que QA relaje todo (storage
> local, WhatsApp mock sin fricción), podés dejar `NODE_ENV=development` — es tu decisión de cuánto
> querés que QA se parezca a prod. Recomendado: `production` con mocks, para atrapar bugs de config.

**Regla de oro:** QA **nunca** apunta a la DB, el bucket R2, ni el número de WhatsApp de producción.
Todo separado. Un bug en QA jamás puede tocar plata o datos reales.

---

## 0.bis Planes y costo real (un solo comercio)

El sistema NO necesita planes caros para 1 local. El costo real, siendo honesto:

| Servicio | Mínimo real | Plan "cómodo" | Nota |
|---|---|---|---|
| Railway (API + Postgres) | **~$5–10/mes** (Hobby) | ~$20 (Pro) | Hobby alcanza para 1 local de bajo tráfico. Pro = más recursos y sin límites de uso. |
| Frontends (4 Next.js) | **$0** | $20 (Vercel Pro) | Vercel Pro es lo cómodo. Evitable: Cloudflare Pages (gratis, permite uso comercial) o consolidar en Railway. Vercel Hobby es gratis pero su licencia restringe uso comercial. |
| WhatsApp (Kapso + Meta) | **~$0–5/mes** | igual | Kapso **$0** a este volumen (free tier 2.000 msg/mes). Solo se paga la tarifa de Meta por plantilla (~centavos c/u). |
| Anthropic (IA facturas) | **$0–3/mes** | igual | Opcional: si cargás facturas a mano, $0. |
| Cloudflare R2 | **~$0–1/mes** | igual | Ya creado. Egress gratis. |
| Dominio | **~$1/mes** | igual | ~$10–12/año en registrar at-cost. |
| UptimeRobot + GitHub Actions | **$0** | $0 | Free tier. |

- **Mínimo cuidando el bolsillo: ~$10–20 USD/mes.**
- **Cómodo (Railway Pro + Vercel Pro): ~$30–45 USD/mes.**

**Podés arrancar aún más chico:** el núcleo es **admin (caja) + API + Postgres**. La web pública,
`public-display` (TV) y WhatsApp son *add-ons*. Si al principio operás solo mostrador, corrés con el
`MockWhatsAppAdapter` (a $0, no envía nada) y sumás web+WhatsApp después.

**Sobre Kapso:** el envío automático de WhatsApp necesita la API oficial de Meta (Cloud API). Configurarla
directo con Meta es engorroso (verificación de negocio, webhooks, registro de número); **Kapso es un
intermediario (BSP) que lo simplifica** y es gratis a tu volumen. La alternativa gratis (OpenWA, no oficial)
arriesga que Meta **banee tu número** — por eso el proyecto usa Kapso. El adapter ya habla el shape de la
Cloud API, así que si algún día querés ir directo a Meta y saltarte Kapso, es un cambio de adapter mínimo.

**Recomendación:** arrancá con **Railway Hobby + Cloudflare Pages (o Vercel Hobby para probar) + WhatsApp en
mock**, quedás en ~$10/mes, y subís a planes pagos solo cuando el volumen lo justifique.

---

## 1. Estrategia de ramas y despliegue

Ya existen las ramas `main` y `prod`. El flujo:

```
feature/fix branch  ──PR──►  (Vercel Preview + CI: typecheck/lint/unit/e2e/Playwright)
        │
        └── merge a `main`  ──►  auto-deploy a QA (Railway env qa + Vercel Preview/qa)
                    │
                    └── merge `main` → `prod`  ──►  auto-deploy a PRODUCCIÓN
```

- **Cada PR** dispara CI completo (ya configurado en `.github/workflows/ci.yml`) + un **Preview de Vercel**
  con URL propia. Probás la UI del cambio antes de mergear.
- **`main`** es la rama de integración → despliega QA. Ahí validás el sistema completo con la DB de QA.
- **`prod`** es el objetivo de producción. Se actualiza con merges deliberados desde `main` (nunca push directo).
- **Hotfix:** branch desde `prod` → PR → merge a `prod` (deploy) → back-merge a `main`.

---

## 2. Entorno QA — qué necesitás crear

Objetivo: un clon barato de prod donde romper cosas sin miedo.

### 2.1 Backend QA (Railway)
Dos opciones (elegí una):

- **(A) Environment `qa` en el mismo proyecto Railway** *(recomendado)* — Railway soporta múltiples
  environments; creás uno llamado `qa` que watchea la rama `main`. Cada environment tiene su propio
  Postgres y sus propias variables. Aislado de production por diseño.
- **(B) Proyecto Railway separado en plan Hobby** — más barato si QA se usa poco (duerme). Mismo repo,
  root `apps/api`, watchea `main`.

Config QA (difiere de prod):
- [ ] Postgres QA propio (nunca el de prod).
- [ ] `DATABASE_URL` → la DB de QA (`?connection_limit=10` alcanza).
- [ ] `JWT_ACCESS_SECRET` / `WEB_ORDER_TOKEN_SECRET` **distintos** a prod (`openssl rand -base64 48`).
- [ ] `CORS_ORIGINS` = los orígenes QA de Vercel.
- [ ] `STORAGE_PROVIDER=r2` + bucket **`pos-tercos-qa`** (o `local` + `ALLOW_LOCAL_STORAGE=1` si no te importa
      perder fotos en cada redeploy — en QA es aceptable).
- [ ] **WhatsApp en mock:** NO setees `KAPSO_*` ni `OPENWA_*`. El backend usa `MockWhatsAppAdapter` (loggea, no
      envía). Así probás el flujo de pedidos sin gastar mensajes ni molestar clientes. Dejá `WHATSAPP_REQUIRED`
      sin setear (o `false`).
- [ ] `ANTHROPIC_API_KEY` con saldo bajo (o compartí la de prod; el uso de QA es mínimo).
- [ ] `PRINTER_PROVIDER=local` (sin impresora física; los recibos caen a archivos).
- [ ] `TZ=America/Bogota`, `NODE_ENV=production`.
- [ ] Healthcheck `/healthz`, **1 réplica**.

### 2.2 Frontends QA (Vercel)
- **Gratis con Preview Deployments:** cada PR ya genera una URL de preview. Para que apunten al backend de QA,
  en cada proyecto Vercel seteá las env vars con **scope Preview** distintas de Production:
  - `API_INTERNAL_URL` (Preview) = `https://api-qa.tercos.co`
  - `NEXT_PUBLIC_API_WS_URL` (Preview) = `wss://api-qa.tercos.co` *(admin)*
  - `JWT_ACCESS_SECRET` (Preview) = el de QA *(admin, cocina)*
- **Opcional — dominios QA estables** (`admin-qa.tercos.co`, etc.): asigná la rama `main` a esos dominios en
  cada proyecto Vercel. Útil para compartir un QA fijo con alguien.

### 2.3 Datos de QA
- [ ] Migraciones: se aplican solas (`migrate deploy` en el start command).
- [ ] Dueño + categorías: corré el **mismo** `pnpm bootstrap:prod` que en prod (§Paso 4), con credenciales de
      QA. Sirve idéntico y es seguro (rechaza credenciales de dev). Alternativa: el seed completo de dev
      (`FORCE_SEED=1 pnpm prisma db seed`) si querés catálogo de prueba ya cargado.
- [ ] Cargá productos + producí subproductos de prueba para poder vender.

### 2.4 Costo QA
Railway Hobby (~$5 crédito) suele cubrir un QA de uso esporádico (api + Postgres que duermen). Vercel Preview
es gratis. R2 QA ~$0. **Estimado: $5–10 USD/mes**, o casi $0 si QA duerme la mayor parte del tiempo.

---

## 3. Entorno PROD — qué necesitás crear

Todo lo de abajo (§4 runbook). El detalle de cada env var está en `deploy.md §1.2` (backend) y `§2.1`
(frontends). Suscripciones y costos en `AUDITORIA-QA-2026-07-20.md §6.7`.

---

## 4. Runbook go-live (en orden)

### Paso 0 — Pre-flight
- [ ] Todo mergeado a `main` y validado en QA.
- [ ] `main` → `prod` (merge deliberado).
- [ ] Generar los secretos de prod (distintos a QA):
      `openssl rand -base64 48` para `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `WEB_ORDER_TOKEN_SECRET`,
      `PRINT_AGENT_SECRET`.
- [ ] Confirmar CI verde en `prod`.

### Paso 1 — Backend Railway (production)
- [ ] Crear environment/proyecto `production` que watchea `prod`, root `apps/api`.
- [ ] Crear Postgres 16 de producción.
- [ ] La build/start command y el healthcheck ya vienen versionados en **`apps/api/railway.json`**
      (`migrate deploy`, `/healthz`, `numReplicas:1`). Confirmar que el dashboard no los sobreescriba.
- [ ] **`numReplicas=1` sin autoscale** (invariante — throttler/WS/crons en memoria).

### Paso 2 — Variables de entorno del backend
Cargar TODAS las de `deploy.md §1.2`. Las que **no se pueden olvidar**:
- [ ] `DATABASE_URL` con **`?connection_limit=15`**.
- [ ] `JWT_ACCESS_SECRET`, `WEB_ORDER_TOKEN_SECRET` (≥32 chars), `CORS_ORIGINS` (los 4 orígenes reales).
- [ ] `STORAGE_PROVIDER=r2` + `R2_ENDPOINT` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET`.
- [ ] **`TRUST_PROXY_HOPS=2`** ⚠️ — con Cloudflare proxied delante de Railway. **Verificá `req.ip` real en QA
      antes** (mal valor = DoS del login o bypass de fuerza bruta de PINs). Ver §6 abajo.
- [ ] `TZ=America/Bogota`, `NODE_ENV=production`.
- [ ] `KAPSO_API_KEY` + `KAPSO_PHONE_NUMBER_ID` + `WHATSAPP_REQUIRED=true`.
- [ ] `PRINTER_PROVIDER=escpos` + `PRINT_AGENT_URL` + `PRINT_AGENT_SECRET`.
- [ ] `OWNER_WHATSAPP_PHONE`, `ANTHROPIC_API_KEY`, `BUSINESS_*`, `PAYMENT_INSTRUCTIONS_*`.

### Paso 3 — Primer deploy + migraciones
- [ ] **`pg_dump` manual** de la DB antes del primer `migrate deploy` si ya tiene datos (la migración
      `dynamic_payment_methods` reescribe tabla con lock exclusivo; en DB fría es trivial).
- [ ] Deploy. El start command corre las ~82 migraciones en orden.
- [ ] `GET https://api.tercos.co/healthz` → 200.

### Paso 4 — Datos operativos día 1 (el seed NO corre en prod)
El **dueño + PIN + categorías base** se crean con un solo comando seguro (idempotente, rechaza
credenciales de dev). Corré desde `apps/api` apuntando a la DB del entorno:

```bash
BOOTSTRAP_OWNER_EMAIL="dueno@tudominio.co" \
BOOTSTRAP_OWNER_PASSWORD="<clave-fuerte-10+>" \
BOOTSTRAP_OWNER_NAME="Nombre Apellido" \
BOOTSTRAP_OWNER_PIN="472913" \
BOOTSTRAP_CATEGORIES="Burgers,Papas,Bebidas,Combos" \
pnpm bootstrap:prod
# En Railway: railway run --environment production pnpm bootstrap:prod
```

- [ ] Correr `bootstrap:prod` (crea Dueño + PIN + categorías). Sirve idéntico en QA y prod.
- [ ] Crear cajeros con rol **`ADMIN_OPERATIVO`** (el rol `CAJERO` fue retirado; el Edge del admin lo bloquea)
      desde el admin `/users`.
- [ ] Cargar productos/insumos + **producir todas las tandas de subproductos** (o los preparados salen "Agotado").

### Paso 5 — Frontends Vercel (production)
Los 4 proyectos (`admin`, `web`, `cocina`, `public-display`), rama `prod`, con sus `vercel.json` ya commiteados.
Env vars con **scope Production** (`deploy.md §2.1`). Críticas:
- [ ] **admin:** `API_INTERNAL_URL`, `JWT_ACCESS_SECRET`, **`NEXT_PUBLIC_API_WS_URL`**, **`NEXT_PUBLIC_PRINT_AGENT_URL`**
      (sin las dos últimas, el socket de pedidos y la impresión caen a `localhost` en plena venta).
- [ ] **cocina:** `API_INTERNAL_URL`, `JWT_ACCESS_SECRET`.
- [ ] **web:** `API_INTERNAL_URL`, `NEXT_PUBLIC_BUSINESS_NAME`, `NEXT_PUBLIC_SITE_URL`.
- [ ] **public-display:** `API_INTERNAL_URL`.

### Paso 6 — DNS Cloudflare
- [ ] Comprar dominio + records para `api` / `admin` / `tercos.co` (web) / `cocina` / `display`
      (+ `*-qa` si querés QA con dominio). SSL **Full (strict)**. Ver `deploy.md §4`.

### Paso 7 — WhatsApp (Kapso)
- [ ] Chip +57 dedicado, número registrado en el WABA, **5 templates aprobados** en Meta,
      `WHATSAPP_TEMPLATES_ENABLED=true` + `WHATSAPP_TEMPLATE_LANG`. Ver `kapso-setup.md`.

### Paso 8 — Print-agent (hardware local)
- [ ] Raspberry Pi 4 + Epson TM-T20III + cajón RJ-11. Instalar print-agent (systemd, :9120,
      `PRINT_AGENT_SECRET` = el del backend) + túnel al backend (Cloudflare Tunnel o Tailscale). `deploy.md §3`.

### Paso 9 — Backups + restore drill
- [ ] Configurar los **5 secrets de GitHub** (`RAILWAY_DB_URL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
      `R2_SECRET_ACCESS_KEY`, `R2_BACKUP_BUCKET`) del workflow `db-backup.yml`.
- [ ] Corrida manual (`workflow_dispatch`) de prueba.
- [ ] **Simulacro de restore** (obligatorio antes de inaugurar): bajar un dump de R2 y restaurarlo en una DB
      vacía. Un backup que nunca se restauró no cuenta.

### Paso 10 — Monitoreo
- [ ] UptimeRobot (o Better Stack) sobre `https://api.tercos.co/healthz` cada 1–5 min.

### Paso 11 — Smoke test (8 pasos, `deploy.md §6`)
- [ ] Login → abrir caja → vender → cobrar (CASH + digital) → imprimir recibo → cerrar caja.
- [ ] Pedido web desde `tercos.co` → llega al admin → confirmar pago → "listo para retirar" → WhatsApp real llega.
- [ ] Cocina: producir una tanda. Pantalla: muestra productos/publicidad.

### Paso 12 — Verificación final de seguridad
- [ ] Confirmar `req.ip` real ≠ IP de Cloudflare (con `TRUST_PROXY_HOPS=2`). Un login mal-throttleado se
      detecta pegándole 11 veces con credenciales malas desde una IP → el 11º debe dar 429.
- [ ] Confirmar gates de la web (`web_orders_enabled`, horario, radio, delivery on/off) en el estado deseado.

---

## 5. Flujo día a día — cómo probás features y bugs

1. **Rama** desde `main`: `feat/x` o `fix/x`.
2. **PR** → CI corre typecheck + lint + unit + e2e (Postgres real) + Playwright, y Vercel te da un **Preview**
   con URL. Revisás la UI ahí.
3. **Merge a `main`** → se despliega a **QA** (Railway qa + Vercel). Probás el sistema completo contra la DB de
   QA, con WhatsApp en mock. Acá reproducís bugs con datos de prueba sin miedo.
4. Cuando QA está sano → **merge `main` → `prod`** → deploy a producción.
5. **Hotfix urgente:** branch desde `prod`, PR, merge a `prod` (deploy inmediato), luego back-merge a `main`.

Ventaja: un bug o feature nueva **siempre** se prueba en QA (o en el Preview del PR) antes de tocar el local
real. Nunca experimentás en producción.

### 5.1 Promover un cambio de QA a producción (paso a paso)

Cuando un cambio ya está sano en QA y lo querés en el local real:

1. **Verificá QA:** el cambio está en `main`, desplegado en el entorno QA, y lo probaste (vender, cobrar,
   cerrar caja, o lo que toque el cambio).
2. **Migraciones nuevas:** si el cambio trae migraciones, confirmá que ya corrieron limpias en QA (el
   `migrate deploy` de QA las aplicó sin error). Si alguna reescribe una tabla grande, hacé `pg_dump` de prod
   antes (paso 4).
3. **Promoví la rama:**
   ```bash
   git checkout prod && git merge --ff-only main && git push origin prod
   ```
   (Si no es fast-forward porque hubo un hotfix en `prod`, mergeá normal y resolvé.)
4. **Backup previo (si hay migración riesgosa):** `pg_dump -Fc` de la DB de prod, o corré el workflow de
   backup manual antes de que el deploy aplique migraciones.
5. **Deploy automático:** Railway (env production) y Vercel (Production) detectan el push a `prod` y despliegan.
   El start command corre `migrate deploy` en el backend.
6. **Verificá prod:** `GET /healthz` → 200, y un **smoke rápido** del cambio (login → la pantalla afectada).
   Si algo sale mal → **rollback** (§5.2).
7. **Back-merge de hotfix:** si el deploy fue un hotfix hecho sobre `prod`, traelo de vuelta a `main`
   (`git checkout main && git merge prod`) para que QA no quede atrás.

### 5.2 Rollback

- **App (sin migración):** en Railway/Vercel, "Redeploy" del deploy anterior (ambos guardan el historial).
  O `git revert` del merge en `prod` + push.
- **Con migración:** las migraciones NO se auto-revierten. Volvé el código al deploy anterior y, si la
  migración rompió datos, restaurá desde el `pg_dump` del paso 4. Por eso el backup previo a una migración
  riesgosa es obligatorio.

---

## 6. Nota crítica sobre `TRUST_PROXY_HOPS` (leer antes del deploy)

Todo el rate-limiting (anti-fuerza-bruta de login y PINs) cuenta por IP, y la IP se saca de `X-Forwarded-For`
según cuántos proxies confiables hay delante. Con **Cloudflare proxied → Railway = 2 hops**, hay que setear
`TRUST_PROXY_HOPS=2`.

> **En producción el boot FALLA** si `TRUST_PROXY_HOPS` está ausente o no es un entero ≥ 1
> (`assertRequiredEnv`) — es una decisión obligatoria, no un default silencioso. Igual hay que **verificar el
> valor correcto** en QA:

Cómo verificarlo en QA:

- Temporalmente logueá `req.ip` en un endpoint, pegale desde tu casa, y confirmá que ves **tu IP pública**, no
  una IP de Cloudflare (rango `104.x`/`172.x` de CF). Si ves la de CF, subí los hops; si ves IPs distintas por
  request al variar `X-Forwarded-For` a mano, bajálos.
- Valor correcto = el número de proxies que **vos controlás** entre el cliente e la app. Ni más (spoofing) ni
  menos (todos en un bucket).

---

## 7. Referencias

- `deploy.md` — detalle exhaustivo: env vars completas, lista de migraciones, gates de la web, DNS, backup.
- `kapso-setup.md` — WhatsApp Cloud API (chip, número, templates).
- `AUDITORIA-QA-2026-07-20.md` — auditoría completa (FASE 6 = re-auditoría de prod: hallazgos, fixes,
  suscripciones con costos).
