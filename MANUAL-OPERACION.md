# Manual de operación — POS Tercos

> Runbook de comandos para desarrollo local, QA, producción y emergencias.
> Complementa `deploy.md` (checklist de deploy inicial) y `CLAUDE.md` (arquitectura).
> Última actualización: 2026-07-09.

---

## 1. Desarrollo local

### Levantar todo

```bash
docker compose up -d postgres     # 1. la DB primero
pnpm dev                          # 2. API + 6 frontends + print-agent en paralelo
```

| App | URL |
|---|---|
| Web pública | http://localhost:3000 |
| API (NestJS) | http://localhost:3001 |
| POS Cajero | http://localhost:3002 |
| Admin | http://localhost:3004 |
| Public Display (TV) | http://localhost:3005 |
| Cocina | http://localhost:3006 |
| Print Agent | http://localhost:9120 |

### Levantar apps sueltas

```bash
pnpm -F @pos-tercos/api dev
pnpm -F @pos-tercos/admin dev
pnpm -F @pos-tercos/pos dev
pnpm -F @pos-tercos/web dev
pnpm -F @pos-tercos/cocina dev
pnpm -F @pos-tercos/public-display dev
```

### Matar todas las instancias

```bash
# Por nombre de proceso (el más confiable en este Mac — lsof por puerto a veces no ve los procesos)
pkill -f "turbo run dev"; pkill -f "next dev"; pkill -f "nest start"; pkill -f "tsx watch src/main.ts"

# Verificar que no quedó nada
ps aux | grep -E "next dev|nest start|turbo run dev" | grep -v grep

# Bajar también Postgres
docker compose down
```

> ⚠️ Si el API muere con `EADDRINUSE :3001` o loggea "N instancias vivas del API",
> hay procesos viejos vivos. Correr el pkill de arriba y relanzar.
> El warning de multi-instancia puede tardar ~1 min en limpiarse (heartbeats en DB).

### Rebuild de packages compartidos

```bash
pnpm -F @pos-tercos/types build     # tras tocar packages/types
pnpm -F @pos-tercos/domain build    # tras tocar packages/domain
# (turbo lo hace solo con ^build, pero a veces el watcher de Next necesita el dist fresco)
```

---

## 2. Base de datos (dev local)

Contenedor: `pos-tercos-postgres` · usuario `pos` · DB `pos_tercos_dev` · puerto 5432.
La DB de e2e (`pos_tercos_test`) es aparte y la maneja el global-setup de Jest — no tocarla a mano.

### Consola psql

```bash
docker exec -it pos-tercos-postgres psql -U pos -d pos_tercos_dev
```

### Queries útiles

```bash
# Usuarios
docker exec pos-tercos-postgres psql -U pos -d pos_tercos_dev -c "SELECT email, role FROM users;"

# Tablas con datos
docker exec pos-tercos-postgres psql -U pos -d pos_tercos_dev -c \
  "SELECT relname, n_live_tup FROM pg_stat_user_tables WHERE n_live_tup>0 ORDER BY n_live_tup DESC;"

# Ventas del día
docker exec pos-tercos-postgres psql -U pos -d pos_tercos_dev -c \
  "SELECT receipt_number, type, status, total, paid_at FROM sales WHERE created_at >= CURRENT_DATE ORDER BY created_at;"

# Caja abierta
docker exec pos-tercos-postgres psql -U pos -d pos_tercos_dev -c \
  "SELECT id, status, opening_cash, opened_at FROM shifts WHERE status='OPEN';"
```

### Migraciones y seed

```bash
cd apps/api
pnpm prisma migrate deploy    # aplicar migraciones pendientes (dev usa deploy, ver memoria P3005)
pnpm prisma:seed              # recrea los 5 usuarios dev (password dev12345) — puede traer datos de ejemplo
pnpm prisma:studio            # GUI de la DB en el browser
pnpm prisma migrate dev --name mi_feature   # crear una migración nueva
```

### Reset TOTAL conservando solo el usuario dueño

```bash
docker exec -i pos-tercos-postgres psql -U pos -d pos_tercos_dev -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables
    WHERE schemaname='public'
      AND tablename NOT IN ('_prisma_migrations','users','approval_pins')
  LOOP
    EXECUTE format('TRUNCATE TABLE %I RESTART IDENTITY CASCADE', r.tablename);
  END LOOP;
END $$;
DELETE FROM approval_pins WHERE user_id NOT IN (SELECT id FROM users WHERE role='DUENO');
DELETE FROM users WHERE role <> 'DUENO';
ALTER SEQUENCE IF EXISTS receipt_seq RESTART WITH 1;
COMMIT;
SQL
```

> ⚠️ `docker exec` necesita `-i` para que el heredoc llegue a psql.
> Después del reset: sesiones invalidadas (re-login), sin PIN de aprobación, sin catálogo,
> sin medios de pago configurados (aplican defaults CASH+TRANSFER), sin caja abierta.

### Backup y restore local

```bash
# Backup manual
docker exec pos-tercos-postgres pg_dump -U pos -Fc pos_tercos_dev > ~/backups/tercos/manual-$(date +%Y%m%d-%H%M).dump

# Restore (¡pisa la DB!)
docker exec -i pos-tercos-postgres pg_restore -U pos -d pos_tercos_dev --clean --if-exists < ~/backups/tercos/ARCHIVO.dump

# Verificar un dump sin restaurarlo
docker exec -i pos-tercos-postgres pg_restore --list < ~/backups/tercos/ARCHIVO.dump | head
```

---

## 3. Calidad — correr antes de cada commit

```bash
pnpm typecheck     # tsc en los 13 packages
pnpm lint          # eslint
pnpm test          # unit: domain (Vitest) + POS (Vitest) + api (Jest) + web

# E2E del API (requiere Postgres arriba; usa pos_tercos_test, NO toca dev)
pnpm -F @pos-tercos/api test:e2e

# Un solo suite e2e
pnpm -F @pos-tercos/api test:e2e -- --testPathPattern=split-payments

# Smoke de navegador (Playwright, requiere pnpm dev corriendo)
pnpm -F @pos-tercos/pos test:e2e-ui
```

> ⚠️ NUNCA correr `next build` con `pnpm dev` activo — corrompe el `.next` del dev server.

---

## 4. Git — flujo de ramas QA/PROD

```
feature/*  →  main (deploya a QA)  →  prod (deploya a PROD)
```

### Trabajo diario

```bash
git checkout -b feature/mi-cambio main
# ... trabajar, commitear ...
git push -u origin feature/mi-cambio     # PR contra main en GitHub
```

### Promover QA → PROD

```bash
git checkout prod
git pull
git merge --ff-only main    # garantiza que prod = exactamente lo probado en QA
git push
git checkout main
```

Si `--ff-only` falla, `prod` tiene algo que `main` no (p.ej. un hotfix directo) — revisar con
`git log prod ^main --oneline` antes de forzar nada.

### Hotfix urgente en PROD

```bash
git checkout -b hotfix/lo-roto prod
# ... fix + commit ...
git checkout prod && git merge --ff-only hotfix/lo-roto && git push   # sale a prod
git checkout main && git merge hotfix/lo-roto && git push             # back-merge a QA
```

### Deshacer

```bash
git revert <sha> && git push      # revertir un commit ya publicado (nunca reescribir prod/main)
```

---

## 5. Railway (API + Postgres) — QA y PROD

### Setup inicial (una sola vez)

```bash
npm i -g @railway/cli   # o brew install railway
railway login
```

En el dashboard (https://railway.app):

1. Crear proyecto `pos-tercos` (eliminar antes los 5 servicios de prueba viejos si siguen ahí).
2. El proyecto nace con environment **production** → ahí crear servicio **api** (desde GitHub repo, rama `prod`) + **Postgres**.
3. Crear environment **qa** (New Environment) → servicio **api** desde rama `main` + su **propio Postgres** (nunca compartir DB entre ambientes).
4. En cada servicio api → Settings:
   - Root Directory: `/` (monorepo, el build usa turbo)
   - Build: `pnpm install --frozen-lockfile && pnpm -F @pos-tercos/types build && pnpm -F @pos-tercos/domain build && pnpm -F @pos-tercos/api build`
   - Start: `cd apps/api && pnpm prisma migrate deploy && node dist/main.js`
   - **Réplicas: 1 fijo, sin autoscale** (throttle y WS son in-memory — el InstanceGuard alerta si hay más)
5. Variables por environment (ver §7).

### Comandos CLI del día a día

```bash
railway link                        # vincular el directorio al proyecto (elegir environment)
railway environment qa              # cambiar el environment activo del CLI
railway environment production

railway logs                        # logs del servicio en vivo
railway status                      # qué hay deployado
railway variables                   # ver variables del environment activo
railway variables --set "CLAVE=valor"
railway redeploy                    # redeploy del último build
railway down                        # dar de baja el deployment activo (¡cuidado en prod!)

# Conectarse a la DB remota (abre psql contra el Postgres del environment activo)
railway connect Postgres
```

### Rollback en Railway

Dashboard → servicio api → Deployments → deployment anterior → ⋮ → **Rollback**.
El rollback revierte el CÓDIGO, no las migraciones de DB — si la migración nueva rompió algo,
restaurar desde backup (§8).

### Recursos recomendados

| | API | Postgres |
|---|---|---|
| PROD | 1 GB RAM / 1 vCPU | 1 GB RAM, volumen 5–10 GB |
| QA | 512 MB | 512 MB |

QA se puede apagar cuando no se usa (Settings → remove deployment) — el costo baja a casi cero.

---

## 6. Vercel (5 frontends) — QA y PROD

Proyectos: admin, pos, web, public-display, cocina. En **cada uno**:

1. Settings → Git → **Production Branch: `prod`**.
2. Settings → Domains → dominio real apunta a Production; agregar dominio `-qa` asignado a la rama `main` (ej: `admin-qa.tudominio.co` → branch `main`).
3. Settings → Environment Variables: las de **Production** apuntan al API de prod, las de **Preview** al API de QA (ver §7).

Con eso: push a `main` → deploy automático en las URLs `-qa`; push a `prod` → dominios reales.

### CLI útil

```bash
npm i -g vercel@latest
vercel login
vercel link                              # vincular una app (correr dentro de apps/<app>)
vercel env pull .env.local               # bajar las env vars del proyecto al local
vercel logs <deployment-url>             # logs de un deployment
vercel ls                                # listar deployments
vercel promote <deployment-url>          # promover un deployment a producción
vercel rollback <deployment-url>         # rollback de producción al deployment dado
```

---

## 7. Variables de entorno por ambiente

### API (Railway)

| Variable | QA | PROD |
|---|---|---|
| `DATABASE_URL` | referencia al Postgres de QA | referencia al Postgres de prod |
| `TZ` | `America/Bogota` | `America/Bogota` |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | propios de QA | propios de prod (distintos a QA) |
| `WEB_ORDER_TOKEN_SECRET` | propio | propio |
| `ANTHROPIC_API_KEY` | la misma | la misma |
| `OPENAI_API_KEY` (fallback) | opcional | recomendada |
| `STORAGE_PROVIDER` | `local` (o R2 con bucket `pos-tercos-qa`) | `r2` |
| `R2_*` | — o bucket qa | bucket `pos-tercos-prod` |
| `KAPSO_*` / `OPENWA_*` | **AUSENTES** → MockWhatsAppAdapter | reales |
| `WHATSAPP_TEMPLATES_ENABLED` | `false` / ausente | `true` (tras registrar templates) |
| `OWNER_WHATSAPP_PHONE` | **AUSENTE** (o número de prueba) | el real, sin espacios |
| `PRINTER_PROVIDER` | `local` (dump a disco) | `escpos` |
| `PRINT_AGENT_URL` / `PRINT_AGENT_SECRET` | — | URL del Pi (tunnel/Tailscale) |
| `BUSINESS_NAME` / `BUSINESS_ADDRESS_SHORT` / `PAYMENT_INSTRUCTIONS_*` | de prueba | reales |

> Los crons (digest 21:30, scan de sugerencias, sweeps, snapshot FIFO) corren en AMBOS
> ambientes. QA sin vars de WhatsApp = los crons no molestan a nadie.

Generar secrets nuevos:

```bash
openssl rand -base64 48    # correr una vez por cada secret
```

### Frontends (Vercel — por environment Production/Preview)

| Variable | Notas |
|---|---|
| `API_INTERNAL_URL` | URL del API del ambiente correspondiente |
| `NEXT_PUBLIC_API_WS_URL` | ídem para los WebSockets |
| `JWT_ACCESS_SECRET` | debe matchear el del API del ambiente (middleware Edge) |
| `NEXT_PUBLIC_BUSINESS_NAME`, `NEXT_PUBLIC_SITE_URL` | solo apps/web |

---

## 8. Backups y restore (PROD)

- Workflow `.github/workflows/db-backup.yml`: pg_dump nocturno → R2, retención 30 días,
  verificación con `pg_restore --list`. **Solo apunta a la DB de PROD.**
- Secrets de GitHub requeridos: ver el workflow (DATABASE_URL de prod + credenciales R2).

### Restore de emergencia

```bash
# 1. Bajar el dump desde R2 (dashboard Cloudflare o rclone/aws cli)
# 2. Restaurar contra la DB de prod (desde el directorio del repo, environment production):
railway connect Postgres     # anotar host/credenciales que muestra, o usar la DATABASE_URL pública
pg_restore --clean --if-exists -d "$DATABASE_URL_PROD" backup.dump
# 3. Redeploy del API para limpiar caches en memoria:
railway redeploy
```

Drill de restore documentado en `deploy.md §7`.

---

## 9. Operación y troubleshooting

### Endpoints de administración manual (Dueño, via curl o Postman)

```bash
# Login para obtener cookie/token
curl -s -X POST https://API_URL/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"dueno@...","password":"..."}' -c cookies.txt

# Con -b cookies.txt y header X-Client-App según la app:
POST /sales/admin/sweep-stale-pending        # barrer cobros COUNTER abandonados >30min
POST /sales/admin/check-receipt-gaps         # detectar saltos de numeración
POST /purchase-suggestions/admin/scan        # scan manual de low-stock
POST /reports/admin/send-daily-digest        # forzar el resumen diario por WhatsApp
POST /reports/admin/ledger-snapshot          # snapshot manual del ledger FIFO
POST /invoices/admin/sweep-orphans           # limpiar archivos huérfanos de storage
```

### Síntomas frecuentes

| Síntoma | Causa probable | Acción |
|---|---|---|
| `ERR_CONNECTION_REFUSED` en localhost | app no corriendo | `pnpm dev`; verificar con `ps aux \| grep next` |
| API muere con `EADDRINUSE :3001` | instancia vieja viva | pkill de §1 y relanzar |
| Alerta WhatsApp "2 instancias del servidor" | multi-instancia real (Railway >1 réplica) o heartbeats stale tras un kill local | en Railway: fijar 1 réplica; en local: ignorar, expira solo |
| POS bloquea ventas con 409 "caja de día anterior" | caja stale sin cerrar | cerrar la caja desde el POS (Caja → Cerrar turno) |
| Producto aparece "Agotado" sin razón | subproducto de la receta en stock 0 | registrar producción en cocina (`/produccion`) |
| Frontend QA pega al API de prod (o viceversa) | env vars de Preview/Production cruzadas en Vercel | revisar §7 |
| Recibos no imprimen en prod | Print Agent caído | `systemctl status print-agent` en el Pi; fallback: recibo HTML desde el browser |
| Errores del POS en el cliente | — | DevTools → consola → `window.__posLogs()` |

### Kill-switch de pedidos web

El dueño puede pausar pedidos web sin deploy: Admin → `/finanzas/estado` → toggle pedidos web
(la web muestra banner y `/checkout` se bloquea; el API responde 503 deliberado).

---

## 10. Checklist de promote QA → PROD

1. `pnpm typecheck && pnpm lint && pnpm test` en verde local.
2. CI verde en `main`.
3. Probar en QA el flujo tocado (venta, cobro, cierre de caja si aplica).
4. Si hay migración nueva: revisar el SQL en `apps/api/prisma/migrations/` — ¿es reversible? ¿pisa datos?
5. `git checkout prod && git merge --ff-only main && git push`.
6. Ver el deploy en Railway (logs sin errores, `migrate deploy` aplicado) y Vercel.
7. Smoke en prod: login admin, una venta de prueba en POS, `/healthz` del API.
8. Si algo rompió: rollback Railway/Vercel (§5/§6) y revert del commit en `prod`.
