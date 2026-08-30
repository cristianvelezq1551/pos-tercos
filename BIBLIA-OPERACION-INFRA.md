# Biblia de operación e infraestructura — POS Tercos

> **El documento para sostener el sistema en el tiempo.** Qué es cada pieza, todas las
> URLs, cómo se despliega, cómo se respalda, cómo se vigila, qué hacer cuando algo
> falla, y cómo no gastar de más. Escrito para leerse dentro de 6 meses sin contexto.
>
> Última actualización: 2026-08-19 (día del lanzamiento). Documentos hermanos:
> `deploy.md` (detalle exhaustivo de variables/migraciones), `ir-a-prod-y-entornos.md`
> (runbook del lanzamiento original), `MANUAL-OPERACION.md` (operación del NEGOCIO,
> no de la infraestructura).

---

## 1. El mapa: quién hace qué

| Pieza | Qué hace | Qué pasa si se cae |
|---|---|---|
| **Railway** | Corre el **backend** (API NestJS) y las **bases de datos** Postgres. Es el corazón: toda venta, usuario y reporte vive aquí. | Nada funciona. Prioridad máxima. |
| **Vercel** | Sirve los **4 frontends** (web del cliente, admin/caja, cocina, pantalla). Solo son la cara: sin API no hacen nada útil. | Las pantallas no cargan, pero los datos están a salvo. |
| **Cloudflare** | El **dominio** tercos.co + DNS, y **R2** (las fotos + los backups). | DNS caído = nadie llega a las URLs. R2 caído = fotos no cargan (vender sigue funcionando). |
| **GitHub** | El **código**, el **CI** (pruebas automáticas en cada cambio) y el **backup automático** de la DB (Actions). | No se puede desplegar, pero lo que ya corre sigue corriendo. |
| **UptimeRobot** | Vigila que el API responda, 24/7, cada 5 min. Email si se cae. | Te quedas sin vigía (el sistema sigue andando). |
| **healthchecks.io** | El "hombre muerto" del backup: si el backup deja de correr, email. | Ídem. |

## 2. Todas las URLs

### Producción (lo que usa el negocio)
| Qué | URL |
|---|---|
| Web del cliente | https://tercos.co (www redirige solo) |
| Caja + gestión | https://admin.tercos.co (la caja está en `/caja`) |
| Cocina | https://cocina.tercos.co |
| Pantalla del local | https://display.tercos.co |
| API (backend) | https://api.tercos.co — prueba de vida: https://api.tercos.co/healthz |

### QA (para probar sin miedo — datos de mentira)
| Qué | URL |
|---|---|
| Admin/Caja QA | https://pos-tercos-admin-git-main-cristianvelezq1551s-projects.vercel.app |
| Web QA | https://pos-tercos-web-git-main-cristianvelezq1551s-projects.vercel.app |
| Cocina QA | https://pos-tercos-cocina-git-main-cristianvelezq1551s-projects.vercel.app |
| Pantalla QA | https://pos-tercos-public-display-git-main-cristianvelezq1551s-projects.vercel.app |
| API QA | https://api-qa-5833.up.railway.app |

### Paneles de control
| Servicio | URL | Entras con |
|---|---|---|
| Railway | https://railway.com/project/f52f1349-a330-469a-b5e1-c9e742f4db91 | tu Google |
| Vercel | https://vercel.com (scope cristianvelezq1551s-projects) | tu GitHub |
| Cloudflare (DNS + R2) | https://dash.cloudflare.com (cuenta `7f706ea0…ce15`) | tu email |
| GitHub repo | https://github.com/cristianvelezq1551/pos-tercos | tu cuenta |
| GitHub Actions (CI + backups) | https://github.com/cristianvelezq1551/pos-tercos/actions | ídem |
| UptimeRobot | https://uptimerobot.com | tu cuenta |
| healthchecks.io | https://healthchecks.io | tu cuenta |

## 3. Entornos y ramas: la regla de oro

```
rama de trabajo ──PR──► CI (typecheck+lint+tests+e2e+navegador) + Preview
        │
        └─ merge a `main` ─────► despliega QA        (automático)
                     │
                     └─ merge `main` → `prod` ─────► despliega PRODUCCIÓN (automático)
```

- **Nunca** se toca producción directo: todo pasa primero por QA.
- En Railway: env `qa` (servicio `api` + `Postgres`) sigue a `main`; env `production`
  (servicio `api-prod` + `Postgres-c6Li`) sigue a `prod`.
- En Vercel: los 4 proyectos tienen *Production Branch* = `prod` (sirven los dominios
  reales); los pushes a `main` generan las URLs de QA de arriba.
- QA y prod **no comparten nada**: ni base de datos, ni secretos, ni fotos.

## 4. Cómo desplegar un cambio (el ritual completo)

1. Rama desde `main` → cambios → `git push` → **abrir PR**.
2. Esperar el **CI en verde** (corre solo: 12 typechecks, lint, ~700 tests unitarios,
   422 e2e contra Postgres real, y Playwright operando la caja en un navegador).
3. **Merge a `main`** → QA se despliega solo en ~5 min.
4. **Probar en QA** lo que tocaste (con los datos de prueba; usuario `dueno-qa@tercos.co`).
5. Promover:
   ```bash
   git checkout prod && git merge --ff-only main && git push origin prod && git checkout main
   ```
6. Railway y Vercel despliegan producción solos. Verificar: `curl https://api.tercos.co/healthz`
   → `{"status":"ok"}` + abrir la pantalla afectada.

**Si el cambio trae una migración de base de datos:** confirmar que corrió limpia en QA
(en Railway → api → Deploy logs se ve el `migrate deploy`), y **antes** del push a prod,
correr un backup manual (§6). Las migraciones no se deshacen solas.

### Rollback (deshacer un deploy malo)
- **Sin migración**: Railway/Vercel → historial de deployments → **Redeploy** del anterior.
  O `git revert` del merge en `prod` + push.
- **Con migración rota**: volver el código al deploy anterior Y restaurar el backup (§6.3).

### Trucos del pipeline (aprendidos a golpes — no re-descubrir)
- Railway **salta** deploys si el commit no toca `apps/api/`, `packages/` o el lockfile
  (watch paths). Un commit solo de docs NO redespliega el API — correcto y deseado.
- Vercel **salta** builds si el commit no toca la app ni los packages (ignore-step con
  `git diff`). Un deployment "CANCELED" en Vercel suele ser un **skip legítimo**, no un error.
- Vercel plan Hobby construye **de a uno**: 4 apps = ~20 min en cola. Paciencia.
- El dashboard de Railway deja los cambios de variables **en borrador**: después de
  agregarlas hay que apretar el botón **Deploy** de la barra de cambios pendientes.
- El patrón de build del monorepo en Railway está documentado en `deploy.md §1.1`
  (root `/` + config file + install filtrado). No moverlo sin leer eso.

## 5. Monitoreo: qué te avisa y dónde mirar

> La versión operativa de esta sección —qué hacer cuando suena cada alarma y con
> qué frecuencia revisar qué— vive en `MONITOREO.md`. Acá queda el detalle de
> infraestructura.

| Alerta | Canal | Qué significa |
|---|---|---|
| **Issue `alerta-produccion`** | email de GitHub | Un 500 inesperado en el backend. El sistema sigue en pie, pero algo se rompió: ver §5.3. |
| **UptimeRobot "DOWN"** | email | El API no responde. Ir a §7 ya. |
| **healthchecks.io "DOWN"** | email | El backup lleva >7h sin correr. Revisar Actions. |
| **GitHub Issue `backup-failure`** | email de GitHub | Un backup falló (el Issue se cierra solo cuando se recupera). |
| **CI rojo en un PR** | GitHub | El cambio rompe algo. No mergear. |
| **Nightly rojo** (workflow "Nightly") | GitHub Actions | Las leyes matemáticas del inventario fallaron con historias aleatorias — bug de borde encontrado. El mensaje trae la semilla para reproducir. |

**Dónde ver logs cuando algo anda raro:**
```bash
railway logs --service api-prod            # backend en vivo (elegir env production)
railway logs --service api-prod --build    # el último build
```
O en el dashboard: Railway → servicio → Logs. Los frontends: Vercel → proyecto → Deployments → Logs.
Errores del navegador de la caja: el POS los manda a `POST /client-logs` → aparecen en los logs del API.

### 5.1 Qué significa cada alerta y cómo actuar (léelo ANTES de que suene)

Son dos alarmas para dos peligros distintos: una cuida el **presente** (¿el negocio puede
operar ahora?) y la otra el **pasado** (¿los datos están respaldados?).

**🔴 UptimeRobot "DOWN" — el sistema no responde AHORA. Actuar en MINUTOS.**
- Detecta: API crasheado (típico: deploy malo), Railway caído, la **DB caída** (el healthz
  la revisa por dentro), DNS o certificado rotos.
- NO detecta: pantallas de Vercel caídas, bugs de lógica, lentitud, la impresora.
- Procedimiento: (1) abre https://api.tercos.co/healthz en el celular — si responde, fue un
  parpadeo y el email de "UP" llega solo; (2) ¿hubo deploy reciente? → Railway → api-prod →
  Deployments → **Redeploy** del anterior (causa #1 en la vida real); (3) sin deploy reciente →
  `railway logs --service api-prod` + https://status.railway.com.
- Consuelo: si pasa en pleno servicio, **la caja tiene modo offline** — las ventas de
  mostrador se registran en el navegador y se sincronizan al volver. Lo que muere mientras
  tanto son los pedidos web.

**🟡 healthchecks.io "DOWN" — el backup lleva >7h sin confirmar. Actuar el MISMO DÍA.**
Es un "hombre muerto": no vigila al sistema, **vigila al vigilante**.
- Detecta: el workflow de backup dejó de correr (GitHub pausa los crons si el repo pasa
  **60 días sin commits** — te va a pasar algún día, es un botón "Re-enable"; o Actions caído)
  o corre pero falla siempre (secret vencido: cambió la clave de la DB, se recreó el proxy,
  token R2 revocado).
- NO detecta: nada del sistema en vivo, ni si el backup es restaurable (eso es el drill mensual).
- Procedimiento: GitHub → Actions → "Postgres backup" → último run. ¿Falló? → el log dice
  qué paso murió (y hay un Issue `backup-failure` con el resumen); corregir el secret en el
  Environment `production-backup`. ¿Ni corrió? → re-enable del cron. Arreglado → Run workflow
  manual → verde → el ping revive el check solo.

**El tercero silencioso — Issue `backup-failure`**: salta si UN run falla (aunque el
siguiente se recupere). Es la alerta rápida; healthchecks es la profunda. El Issue avisa
del tropiezo, healthchecks del abandono.

> **En una frase:** *UptimeRobot rojo = deja todo y mira Railway. healthchecks rojo = hoy
> mismo, mira GitHub Actions.*

### 5.2 Simulacro de alarmas (validado 2026-08-19 — repetir cada ~6 meses)

Probar que los emails DE VERDAD llegan, sin tocar producción:

1. **UptimeRobot**: crear un monitor temporal a `https://api.tercos.co/healthz-simulacro`
   (esa ruta devuelve 404 = "caído") → en ≤5 min llega el email "Monitor is DOWN" → borrar
   el monitor temporal. El monitor real nunca se toca.
2. **healthchecks**: abrir la Ping URL del check agregándole **`/fail`** al final
   (`https://hc-ping.com/<uuid>/fail`) → el check cae al instante y llega el email → para
   revivirlo, correr el backup manual (Actions → Run workflow): su ping de éxito lo pone
   verde y llega el email de recuperación.
3. **Avisos de error** (`alert-drill`): con la sesión del dueño en el admin, abrir la consola
   del navegador (F12) y correr:
   ```js
   await fetch('/api/healthz/alert-drill', { method: 'POST', credentials: 'include' }).then(r => r.json())
   ```
   Debe responder `{ channel: 'github_issue', delivered: true, ref: '#N' }` y aparecer un Issue
   titulado `[prod] SIMULACRO…` — ciérralo. Si responde `channel: 'noop'`, las variables
   `ALERT_GITHUB_*` no están puestas (§5.3) y **ningún error 500 te está avisando**.
4. Si un email no llega: revisar spam; UptimeRobot → Monitor → Notifications; healthchecks →
   Integrations → email verificado; GitHub → Settings → Notifications (los Issues del repo
   llegan por "Participating and @mentions" solo si estás watcheando el repo).

### 5.3 Avisos de error: el hueco que UptimeRobot no cubre

UptimeRobot solo ve el sistema **caído entero**. Un bug que revienta un solo
endpoint —el cobro, la confirmación de un pedido web— deja `healthz` en verde y
nadie se entera: el cajero ve "el sistema tuvo un problema" y sigue.

Desde 2026-08-29 cada 5xx **inesperado** abre (o comenta) un Issue en el repo
con la etiqueta `alerta-produccion`, y GitHub te manda el correo. Es el mismo
camino del backup, que ya conoces.

- **Qué SÍ detecta:** excepciones no controladas, la DB caída a mitad de una
  operación, un adapter roto (R2, impresora, LLM), más de una instancia viva.
- **Qué NO detecta:** errores del navegador, lentitud, y los bugs de lógica que
  no lanzan excepción (para esos está el nightly de leyes matemáticas).
- **No inunda:** máximo un aviso cada 10 minutos por firma de error, y el mismo
  error repetido comenta el Issue abierto en vez de abrir otro. **Cierra el
  Issue cuando lo arregles** — si sigue abierto, el siguiente caso se cuelga ahí
  y parece que nunca terminó.
- **Qué trae:** ruta, método y mensaje. El stack completo NO va en el Issue (el
  repo no es un log): está en `railway logs --service api-prod`. Las
  credenciales embebidas en URLs se tapan antes de publicar.

**Configuración** (una sola vez, gratis):
1. GitHub → Settings → Developer settings → **Fine-grained tokens** → Generate.
   Repository access: solo `pos-tercos`. Permisos: **Issues → Read and write**.
   Nada más.
2. Railway → `api-prod` → Variables:
   - `ALERT_GITHUB_REPO=cristianvelezq1551/pos-tercos`
   - `ALERT_GITHUB_TOKEN=<el token>`
3. Redeploy. En el log de arranque debe decir
   `Avisos técnicos por Issue de GitHub`. Si dice `ALERT_GITHUB_* ausentes`,
   la variable no llegó.
4. Probar con el simulacro (abajo).

> Sin las dos variables el API arranca igual y lo avisa en el log: los errores
> quedan solo en Railway. Con **una sola** de las dos, el arranque falla a
> propósito — una config a medias es cero avisos sin que nadie lo note.
>
> ⚠️ El token vence según lo que elijas al crearlo. Cuando venza, los avisos
> dejan de salir en silencio: el `alert-drill` de abajo es la única forma de
> darse cuenta. Anótalo en el calendario junto al simulacro semestral.

## 6. Backup: tu red de seguridad

### 6.1 Cómo funciona (solo, sin tocar nada)
- **Cada 6 horas**, GitHub Actions hace `pg_dump` de la DB de producción, **verifica el
  archivo** (mínimo 10 tablas con datos), lo sube a R2 (`pos-tercos-backups/backups/`),
  borra los de más de **30 días**, y pinguea healthchecks.io.
- Si falla: abre un Issue `backup-failure` y te llega email. Si deja de correr: healthchecks avisa.
- Los secretos viven en GitHub → Settings → Environments → `production-backup`
  (restringido a `main`; jamás a nivel repo).

### 6.2 Backup manual (antes de una migración riesgosa)
GitHub → Actions → **Postgres backup** → Run workflow → rama `main`. Verde en ~40 segundos.

### 6.3 RESTAURAR (la parte que importa — probada el 2026-08-19)
1. Cloudflare → R2 → bucket `pos-tercos-backups` → carpeta `backups/` → descargar el
   dump más reciente.
2. Ensayo en una base desechable local (SIEMPRE ensayar antes de tocar prod):
   ```bash
   docker exec pos-tercos-postgres psql -U pos -d postgres -c "CREATE DATABASE restore_drill;"
   docker run --rm -v ~/Downloads:/dumps:ro -e PGPASSWORD=<pass-local> postgres:18 \
     pg_restore --no-owner --no-privileges -h host.docker.internal -U pos -d restore_drill /dumps/<archivo>.dump
   docker exec pos-tercos-postgres psql -U pos -d restore_drill -c "SELECT count(*) FROM sales;"
   docker exec pos-tercos-postgres psql -U pos -d postgres -c "DROP DATABASE restore_drill;"
   ```
   (El error `unrecognized parameter "transaction_timeout"` es normal y se ignora.)
3. Restaurar EN PRODUCCIÓN (solo en desastre real): misma receta pero apuntando a la URL
   pública del Postgres de prod (Railway → Postgres-c6Li → Connect → Public Network),
   idealmente sobre una DB nueva y cambiando el `DATABASE_URL` del API — nunca pisar la
   DB dañada sin antes dumpearla también (evidencia).

## 7. Cuando algo falla en producción (triage)

**Primer reflejo siempre:** `curl https://api.tercos.co/healthz`

| Síntoma | Diagnóstico | Acción |
|---|---|---|
| healthz no responde / UptimeRobot DOWN | API caído | `railway logs --service api-prod` → si es crash-loop tras un deploy: **Redeploy** del deployment anterior (rollback §4). Si Railway entero está caído: https://status.railway.com — esperar. |
| healthz responde pero `db: error` | Postgres caído/saturado | Railway → Postgres-c6Li → Logs/Metrics. Reiniciar el servicio desde el dashboard si está colgado. |
| Una página no carga pero el API sí | Frontend | Vercel → proyecto → último deployment. Rollback = **Redeploy** del anterior. https://www.vercel-status.com |
| Login falla para todos | Revisar si hubo deploy reciente (¿cambió `JWT_ACCESS_SECRET`? debe ser IDÉNTICA en Railway api-prod, Vercel admin y Vercel cocina) | Igualar la variable en los 3 y redesplegar los frontends. |
| Pedidos web no suenan en la caja | El WebSocket | ¿`NEXT_PUBLIC_API_WS_URL` = `https://api.tercos.co`? ¿el origen está en `CORS_ORIGINS` del API? La caja igual re-consulta cada 12s (degrada, no muere). |
| Fotos no cargan/no suben | R2 | Verificar las 4 vars `R2_*` en api-prod; probar subir una imagen en admin → Publicidad. |
| No imprime | El print-agent local (cuando exista) | La venta NUNCA se bloquea por la impresora. En el local: `systemctl status print-agent` en la Pi; ver `deploy.md §3`. |
| "Fuera de servicio" solo en el checkout web | Puede ser deliberado | Admin → Finanzas → Estado: kill-switch de pedidos web / horario. Son datos, no bugs. |
| Todo lento | Métricas en Railway (CPU/RAM del api-prod y del Postgres) | El API usa ~130-210 MB normalmente. Si la RAM crece sin freno por días → reiniciar y reportar (no ha pasado en pruebas de carga). |

**Regla de incidentes:** primero restaurar servicio (rollback), después investigar con calma.
Los datos casi nunca se pierden: el backup de 6h + el historial de deployments te cubren.

## 8. Cómo NO gastar de más (costos y modo dormir)

### El modelo de cobro
- **Railway (plan Hobby, $5/mes incluidos de uso):** cobra por RAM/CPU consumidos por
  hora, por servicio. Prod (~$3-6/mes) + QA es lo que se optimiza abajo.
- **Vercel (Hobby, $0):** gratis a tu escala. Límite: 1 build a la vez.
- **Cloudflare:** dominio ~$1/mes prorrateado; R2 centavos; DNS gratis.
- **GitHub/UptimeRobot/healthchecks:** gratis a tu escala.
- **Ver el consumo real:** Railway → tu avatar → Usage.

### QA en modo dormir (YA ACTIVADO el 2026-08-19)
Los dos servicios de QA (`api` y `Postgres` del env qa) tienen **App Sleeping** activo:
- Sin tráfico por ~10 min → se duermen → **consumo ≈ $0**.
- El primer request los despierta solo (tarda ~5-15 segundos: esa primera carga lenta
  de QA es normal, no un bug).
- Producción NO duerme jamás (y no activarle sleep nunca: mataría la primera venta de
  cada mañana y los crons nocturnos).
- Para apagar QA "más duro" (semanas sin usarlo): Railway → env qa → cada servicio →
  Settings → Remove deployment (se recrea con el próximo push a `main`). Rara vez vale la pena.

### 8.1 El tope diario de despliegues de Vercel (pasó el 2026-08-29)

Los cuatro proyectos de Vercel construyen en **cada push**, aunque el cambio sea
solo del API. Un día con dos PR y sus merges a `main` y `prod` gasta despliegues
a un ritmo de 4 por push, y el plan gratis corta:

```
Vercel – pos-tercos-admin → failure: Deployment rate limited — retry in 24 hours.
```

**No es un fallo del código.** Se distingue mirando la descripción del check:
si dice *rate limited*, el build ni siquiera arrancó. Los jobs que validan de
verdad son `verify` y `browser-e2e`, que corren en GitHub Actions y no tienen
que ver con esa cuota.

**Mientras dura:** el backend se despliega igual (va por Railway). Las pantallas
se quedan sirviendo el bundle anterior hasta que la ventana se libere; no hay
estado inconsistente, solo cambios de frontend que todavía no se ven.

#### Por qué el filtro que había NO servía para esto

Los cuatro proyectos tenían un *Ignored Build Step* a mano
(`git diff HEAD^ HEAD -- ./ ../../packages/…`) que cancelaba el build cuando esa
app y sus paquetes no habían cambiado. Parecía razonable y sin embargo la cuota
se agotó igual, porque —textual de la documentación de Vercel— *"canceled builds
initiated using the Ignored Build Step count towards your deployment and
concurrent build limits"*. **Una cancelación gasta despliegue igual que un build
completo.**

Y de paso, la lista escrita a mano se había desincronizado: le faltaba
`packages/guia` a admin y cocina (un cambio solo en la guía **no** las
reconstruía y quedaban sirviendo contenido viejo, en silencio) y le sobraba
`packages/domain` en cocina y pantalla, que no lo usan.

#### Lo que quedó configurado (2026-08-29)

En los cuatro proyectos: *Ignored Build Step* → **Automatic** (sin comando) y,
en **Build and Deployment → Root Directory**, el interruptor **Skip deployment**
en **Enabled**. Vercel deduce del grafo de workspaces qué proyectos afecta cada
commit, y esos saltos **no consumen slots de build** ni cuota.

`npx turbo-ignore` **está deprecado** — Vercel responde a su uso recomendando
esta función. Y tampoco resolvía el problema: seguía siendo un Ignored Build
Step, con el mismo consumo de cuota.

Requisitos, todos cumplidos por este repo: GitHub, workspaces de pnpm declarados
en `pnpm-workspace.yaml`, `name` único por paquete, y dependencias entre
paquetes declaradas explícitamente en cada `package.json` (de ahí sale el
grafo). Si alguna vez una app usa un paquete sin declararlo en sus
dependencias, Vercel no se entera y **no la reconstruye**.

⚠️ **Un cambio fuera de los workspaces cuenta como global y despliega las cuatro
apps.** Eso incluye la documentación de la raíz (`CLAUDE.md`, `MONITOREO.md`,
este archivo) y `.github/`. Es el precio de que el grafo se calcule solo en vez
de mantener una lista a mano que se desincroniza.

⚠️ Ya no existe la guarda de "en producción construye siempre" que tenía el
comando viejo. No hace falta: si Vercel salta una app es porque no cambió, así
que el despliegue que sigue vivo ya es su código actual.

## 9. Dónde vive cada secreto (y cómo rotar)

| Secreto | Vive en | Rotación |
|---|---|---|
| Sesiones (`JWT_*`), tokens de pedidos, candado de impresora | Railway → api-prod → Variables (los de QA en el env qa) | Generar nuevo (`openssl rand -hex 64`), actualizar en Railway **y** — solo el JWT_ACCESS — en Vercel admin+cocina. Ojo: rotar el JWT desloguea a todos. |
| Llaves R2 (fotos / backups) | Railway api-prod / GitHub env `production-backup` | Cloudflare → R2 → API tokens → crear nuevo → actualizar → borrar viejo. |
| URL pública de la DB prod | GitHub env `production-backup` | Cambia solo si se recrea el proxy TCP del Postgres. |
| Contraseña del dueño / PIN | Tu gestor de contraseñas | Cámbiala desde el admin cuando quieras. |
| **Regla eterna** | Una llave perdida NO se busca: se **rota** (nueva + borrar vieja). Nunca pegar secretos en archivos del repo ni en chats. | |

## 10. Lo que aún queda pendiente (estado 2026-08-19)

- [ ] **Catálogo real** en admin.tercos.co (insumos → subproductos → productos+recetas →
      stock inicial → **producir las tandas de subproductos**, o los preparados salen "Agotado").
- [ ] **Smoke de primera venta**: usuario operativo en `/users` → `/caja` → abrir turno →
      vender → cobrar → cerrar. Y un pedido web de prueba desde el celular.
- [ ] **Cuenta bancaria** → actualizar `PAYMENT_INSTRUCTIONS_TRANSFER` en api-prod con el
      texto completo (hoy dice "te enviamos los datos por WhatsApp", que funciona pero es provisional).
- [ ] `ANTHROPIC_API_KEY` en api-prod si se quiere la IA de facturas por foto (~$0-3/mes).
- [ ] **Impresora física**: Raspberry + Epson TM-T20III + print-agent (`deploy.md §3`) →
      `PRINTER_PROVIDER=escpos` + `PRINT_AGENT_URL` (Railway) + `NEXT_PUBLIC_PRINT_AGENT_URL` (Vercel admin).
- [ ] **Si algún día se activa el proxy naranja de Cloudflare** en `api.tercos.co`:
      cambiar `TRUST_PROXY_HOPS` de 1 a **2** (si no, el anti-fuerza-bruta se rompe).
- [ ] **WhatsApp automático (Kapso)**: opcional; hoy el aviso es manual por wa.me y funciona.
      Derrotero completo en `kapso-setup.md`. ⚠️ Jamás poner `WHATSAPP_REQUIRED=true` sin las llaves.
- [ ] **Domicilios**: cuando se activen, `GOOGLE_MAPS_API_KEY` en api-prod es OBLIGATORIA
      (sin ella el autocompletado inventa direcciones).

## 11. Calendario de mantenimiento (lo que mantiene vivo el sistema)

### Semanal — 2 minutos
- [ ] GitHub Actions: backup y nightly en **verde** (https://github.com/cristianvelezq1551/pos-tercos/actions).
- [ ] UptimeRobot en 100% · healthchecks en verde.

### Mensual — 20 minutos
- [ ] **Simulacro de restore** (§6.3): bajar el último dump y restaurarlo en una DB desechable.
      Un backup que no se prueba es una esperanza, no un respaldo.
- [ ] **Consumo**: Railway → Usage (¿algo creció raro?) · tamaño del bucket de backups en R2.
- [ ] **Tamaño de la DB**: Railway → Postgres-c6Li → Metrics. Crece con las ventas — es normal;
      lo anormal es un salto brusco. (Nota técnica: `sale_status_log` no tiene purga automática
      y el replay del inventario usa ~18 MB de RAM por mes de historia — ninguno de los dos es
      problema antes del año 2-3, pero están anotados aquí para el futuro.)
- [ ] **Dependencias**: en el repo, `pnpm audit --prod` → si sale algo, corregirlo como está
      documentado en `pnpm-workspace.yaml` (overrides puntuales; la política de supply-chain
      con retraso de 7 días y anti-downgrade NO se baja).

### Semestral — 1 hora
- [ ] **Simulacro de alarmas** (§5.2): validar que los emails siguen llegando.
- [ ] **Rotar las llaves R2** (crear token nuevo → actualizar → borrar viejo). Los `JWT_*`
      pueden rotarse también si hay sospecha (desloguea a todo el mundo — hacerlo un lunes
      por la mañana, no un viernes por la noche).
- [ ] **Accesos**: en admin → Usuarios, dar de baja a quien ya no trabaje en el negocio
      (desactivar revoca sus sesiones al instante) y cambiar PINs si rotó gente.
- [ ] Actualizar dependencias menores: rama nueva → `pnpm update` (la política de 7 días filtra
      lo recién publicado) → gates completos (`pnpm typecheck && pnpm lint && pnpm test` + e2e)
      → PR → QA → prod. Nunca directo.

### Anual — y las trampas silenciosas que matan sistemas "que funcionaban"
- [ ] **Renovación del dominio**: Cloudflare → Domain Registration → verificar **auto-renew
      activo y tarjeta vigente**. Un dominio vencido apaga TODO y recuperarlo tarda días.
- [ ] **Tarjetas de cobro vigentes** en Railway (el único con cobro mensual seguro). Si un
      pago falla, primero avisan, después suspenden — no dejar que llegue a lo segundo.
- [ ] **Actividad del repo**: si pasan 60 días sin ningún commit, GitHub pausa los crons
      (backup y nightly incluidos) — healthchecks lo delataría, pero mejor no llegar: cualquier
      commit (hasta de docs) reinicia el contador.
- [ ] Revisar versiones mayores (Node, Next, Prisma): solo con tiempo, en rama, con QA de por
      medio. Si el sistema está estable y no hay CVE, **no hay apuro** — estable > moderno.
- [ ] Releer esta biblia y actualizar lo que haya cambiado (URLs, servicios, decisiones).

### La regla madre del mantenimiento
Este sistema está diseñado para fallar HACIA la seguridad: los tests bloquean los merges,
QA absorbe los errores, el backup corre solo, las alarmas avisan. Tu único trabajo real de
mantenimiento es **no ignorar un email de alerta** y pasar por este calendario. Nada de esto
requiere saber programar — y para lo que sí, está el flujo de §4 con el CI de guardaespaldas.

## 12. Los números del sistema (para saber qué es "normal")

- API en reposo: ~130-160 MB RAM. Bajo carga: ~210 MB. Más de 500 MB sostenido = raro, investigar.
- healthz responde en <300 ms desde Colombia.
- Un deploy completo del API: ~2-4 min. Un frontend: ~2-5 min (más la cola de Vercel).
- El backup tarda ~40 s y pesa KB→MB (crecerá con los meses; a años vista, decenas de MB).
- La DB de un local genera pocos MB al mes. El plan Hobby aguanta años de esto.
