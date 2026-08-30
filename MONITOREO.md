# Monitoreo — POS Tercos

**Cómo sé si el sistema está bien, y qué hago cuando no lo está.**

> **La idea en una frase: si no te llegó ningún correo, está bien.**
>
> Este documento existe para que no tengas que entrar a ningún panel a revisar.
> Las alarmas te buscan a ti; tú solo actúas cuando suena una. Lo demás son
> rutinas cortas y espaciadas, y procedimientos para cuando algo falle.
>
> Última verificación completa: **2026-08-29**. Todo lo que dice acá se probó
> contra producción ese día, no está supuesto.

---

## Índice

1. [El mapa: qué vigila cada cosa](#1-el-mapa-qué-vigila-cada-cosa)
2. [Tu rutina: qué hacer y cada cuánto](#2-tu-rutina-qué-hacer-y-cada-cuánto)
3. [Procedimientos ante fallo](#3-procedimientos-ante-fallo)
4. [Herramientas: cómo mirar](#4-herramientas-cómo-mirar)
5. [Comprobar que las alarmas suenan](#5-comprobar-que-las-alarmas-suenan-cada-6-meses)
6. [Inventario de configuración](#6-inventario-de-configuración)
7. [Respaldos y restauración](#7-respaldos-y-restauración)
8. [Lo que todavía no está cubierto](#8-lo-que-todavía-no-está-cubierto)
9. [Referencia rápida de comandos](#9-referencia-rápida-de-comandos)
10. [Por qué está hecho así](#10-por-qué-está-hecho-así)

---

## 1. El mapa: qué vigila cada cosa

### 1.1 Las cinco alarmas que te escriben

Estas son las únicas que te interrumpen. Todo lo demás hay que ir a buscarlo.

| Alarma | Te llega por | Qué vigila | Cuándo actuar |
|---|---|---|---|
| **UptimeRobot "DOWN"** — API | correo | El sistema **caído entero**: API muerto, base de datos caída, DNS o certificado rotos | **Minutos** |
| **UptimeRobot "DOWN"** — una pantalla | correo | Esa pantalla no carga o quedó en blanco (Vercel caído, build roto, certificado vencido) | Minutos |
| **Issue `alerta-produccion`** | correo de GitHub | Un **error 500** en el backend: el sistema sigue en pie pero algo se rompió | El mismo día |
| **healthchecks.io "DOWN"** | correo | El **respaldo** lleva más de 7 horas sin correr | El mismo día |
| **Nightly rojo** | correo de GitHub | Las **leyes matemáticas del inventario** fallaron con historias aleatorias | Esta semana |

Las tres primeras cuidan el **presente** (¿se puede vender ahora?). Las dos
últimas cuidan el **pasado** (¿los datos están respaldados y cuadran?).

> **Regla mental:** *UptimeRobot rojo = deja todo y mira Railway o Vercel.
> Issue de GitHub = hoy mismo, hay un bug vivo. healthchecks rojo = hoy mismo,
> mira GitHub Actions.*

### 1.2 Lo que se registra pero NO te avisa

Existe, sirve para investigar, y hay que ir a buscarlo. No te va a despertar.

| Qué | Dónde queda | Para qué sirve |
|---|---|---|
| **Errores del navegador** de la web del cliente, cocina y TV | Logs de Railway, con prefijo `[web]`, `[cocina]` o `[display]` | Cuando alguien dice "no me dejó pedir" |
| **Errores del navegador de la caja** | Logs de Railway, prefijo `[client]`, **con el correo de quien lo vivió** | "No imprimió", "se perdió una venta" |
| **Bitácora del negocio** | `admin.tercos.co/bitacora` | Quién anuló, quién abrió el cajón, quién dio una cortesía |
| **Auditoría completa** | `admin.tercos.co/audit` | El detalle crudo de todo lo anterior |
| **Métricas de CPU y memoria** | Railway → servicio → Metrics | Cuando algo va lento |

### 1.3 Lo que nadie vigila todavía

Saberlo importa tanto como saber lo que sí está cubierto:

- **Que el negocio deje de vender.** Un login roto o una caja que no cobra se
  ven exactamente igual que un día flojo. Nada lo detecta.
- **Lentitud.** No hay nada que mida cuánto tarda una respuesta.
- **Que la impresora no imprima.** La venta nunca se bloquea por eso, a
  propósito — pero tampoco avisa.
- **Que un número esté mal sin lanzar ningún error.** El nightly prueba el motor
  con datos inventados, no tus datos reales.

---

## 2. Tu rutina: qué hacer y cada cuánto

### Todos los días — 0 minutos

Nada. Si no llegó correo, está bien. Ese es el trato y es el objetivo de todo
este montaje.

### Cada semana — 2 minutos

- Revisa si quedó algún **Issue `alerta-produccion` abierto** que dejaste pasar:
  https://github.com/cristianvelezq1551/pos-tercos/issues?q=is%3Aopen+label%3Aalerta-produccion
- Si desplegaste algo esta semana, confirma que el **CI quedó verde**.

### Cada mes — 15 minutos

- **Prueba que el respaldo se puede restaurar.** Descarga el dump más reciente
  de R2 y restáuralo en una base desechable local (procedimiento en §7). *Un
  respaldo que nunca se restauró no es un respaldo: es un archivo.*
- **Mira las métricas** en Railway → `api-prod` → Metrics. La memoria normal es
  **130–210 MB**. Si viene creciendo sin freno hace días, reinicia el servicio y
  anótalo.

### Cada 6 meses — 30 minutos

- **Simulacro de las alarmas** (§5). Es lo único que prueba que los correos DE
  VERDAD llegan.
- Revisa que el **token de GitHub** no haya vencido, si le pusiste fecha.

### En cada despliegue a producción

- Antes: si el cambio trae **migración de base de datos**, corre un respaldo
  manual (GitHub → Actions → *Postgres backup* → Run workflow) y confirma que la
  migración corrió limpia en QA.
- Después: **abre la caja y cobra una venta de prueba**. Ninguna alarma cubre
  "se desplegó bien pero la pantalla quedó rota".

---

## 3. Procedimientos ante fallo

### 3.1 🔴 UptimeRobot "DOWN" en `api.tercos.co` — el sistema no responde

Es la más grave: sin API no hay pedidos web, ni cocina, ni gestión.

1. **Abre https://api.tercos.co/healthz en el celular.**
   - Responde `{"status":"ok"}` → fue un parpadeo. El correo de "UP" llega solo.
     No hagas nada más.
   - No responde, o responde `db: error` → sigue.
2. **¿Hubo un despliegue reciente?** Es la causa número uno en la vida real.
   - Railway → `api-prod` → **Deployments** → busca el anterior que estaba bien →
     botón **Redeploy**. Eso es el rollback.
3. **Sin despliegue reciente**, mira el log:
   ```bash
   railway logs --service api-prod --environment production --deployment --lines 200
   ```
   - Si es un *crash-loop*, el error aparece repetido al final.
   - Si `healthz` decía `db: error`: Railway → `Postgres-c6Li` → Logs / Metrics.
     Reinicia el servicio desde el panel si está colgado.
4. **Si Railway entero está caído** (https://status.railway.com), no hay nada que
   hacer más que esperar. Avisa al local.

> **Consuelo mientras dura:** la caja tiene **modo offline**. Las ventas de
> mostrador se registran en el navegador y se sincronizan al volver. Lo que
> muere mientras tanto son los pedidos web.

**Regla de incidentes: primero restaurar el servicio (rollback), después
investigar con calma.** Los datos casi nunca se pierden — el respaldo de 6 horas
y el historial de despliegues te cubren.

### 3.2 🔴 UptimeRobot "DOWN" en una pantalla (admin, cocina, web o TV)

El API está bien; el problema es esa app.

1. Abre la URL a mano y mira qué sale.
2. Vercel → ese proyecto → **Deployments** → el último. Si falló el build, el log
   dice por qué.
3. **Rollback = Redeploy del despliegue anterior**, igual que en Railway.
4. Si el monitor está rojo pero la página se ve bien, revisa que no haya vencido
   el certificado (Vercel → el proyecto → Domains) y que la palabra clave del
   monitor siga estando en el HTML (§6.1: si alguien cambia el título de la
   página, el monitor se pone rojo sin que nada esté roto).

### 3.3 🟠 Issue `alerta-produccion` — un error 500

El sistema funciona; un pedazo se rompió. Nadie más se va a enterar: el cajero
solo vio "el sistema tuvo un problema".

1. **Lee la ruta en el título.** Te dice qué dejó de funcionar:
   - `POST /sales/:id/confirm-payment` → no se puede cobrar. **Urgente.**
   - `POST /invoices/...` → no se pueden subir facturas. Puede esperar.
   - `GET /reports/...` → un reporte. Puede esperar.
2. **Mira cuántos comentarios tiene el Issue.** Cada comentario es una
   repetición. Uno solo puede ser un caso raro; veinte es un bug vivo.
3. **Busca el detalle completo en el log** — el stack NO va en el Issue, porque
   un repositorio no es un log:
   ```bash
   railway logs --service api-prod --environment production --lines 500 | grep -A20 "5xx en"
   ```
4. **Cierra el Issue cuando lo arregles.** Si el mismo error vuelve, el sistema
   lo reabre solo.

> **No te va a inundar:** máximo un aviso cada 10 minutos por tipo de error, y el
> mismo error repetido comenta el Issue existente en vez de abrir otro.

### 3.4 🟡 healthchecks.io "DOWN" — el respaldo dejó de correr

No vigila el sistema: **vigila al vigilante**.

1. GitHub → **Actions** → *Postgres backup* → mira el último run.
2. **¿Falló?** El log dice qué paso murió. Suele ser un secreto vencido (cambió
   la clave de la base, se recreó el proxy, revocaron el token de R2). Se corrige
   en GitHub → Settings → Environments → `production-backup`.
3. **¿Ni siquiera corrió?** GitHub **pausa los crons si el repositorio pasa 60
   días sin commits**. Hay un botón "Re-enable workflow". Te va a pasar algún
   día.
4. Arreglado → Run workflow manual → verde → el ping de éxito revive el check
   solo y llega el correo de recuperación.

> **El tercero silencioso:** si UN run falla (aunque el siguiente se recupere),
> se abre un Issue `backup-failure` y te llega correo. El Issue avisa del
> tropiezo; healthchecks avisa del abandono.

### 3.5 🟣 Nightly rojo — los números no cuadran

Las leyes matemáticas del inventario fallaron con datos aleatorios. **No
significa que tu base esté mal**: significa que existe un caso de borde donde el
costeo se rompe.

El mensaje del fallo trae la **semilla** para reproducirlo:

```bash
LEDGER_PROPERTY_RUNS=20000 pnpm -F @pos-tercos/domain exec vitest run src/cost-fifo/run-ledger.property.test.ts
```

Así se encontró un bug real de la reversa post-corte del snapshot (2026-08-14):
con 1.200 historias aparecía, con 120 nunca.

### 3.6 "Un cliente dice que no pudo pedir"

Esto **no** dispara alarma; hay que ir a buscarlo.

1. Los errores del navegador quedan en el log del API con el prefijo de su app:
   ```bash
   railway logs --service api-prod --environment production --lines 500 | grep -E "\[web\]|\[cocina\]|\[display\]"
   ```
   Ejemplo de lo que verías:
   ```
   WARN [ClientLog] [web] window.error :: Cannot read properties of undefined :: en /checkout
   ```
2. Si no hay nada, el problema no reventó en el navegador. Revisa entonces:
   - ¿El pedido web está **pausado**? Admin → Finanzas → Estado (kill-switch).
   - ¿Está **fuera de horario**? Admin → Web del cliente → Horarios.
   - ¿La dirección quedaba **fuera del radio**? Es un rechazo deliberado.
3. Para la caja es igual pero con más detalle, porque incluye quién lo vivió:
   ```bash
   railway logs --service api-prod --environment production --lines 500 | grep "\[client\]"
   ```

### 3.7 "Todo está lento"

1. Railway → `api-prod` → **Metrics**: CPU y memoria. Normal: 130–210 MB.
2. Railway → `Postgres-c6Li` → Metrics.
3. Si la memoria del API crece sin freno durante días, reinicia el servicio y
   anótalo — no ha pasado en pruebas de carga, así que sería una novedad real.
4. Recuerda que **los reportes financieros tienen 60 segundos de retraso**
   (caché del motor de costos). Eso no es lentitud, es diseño.

### 3.8 Cosas que parecen fallo y NO lo son

Antes de investigar, descarta estas. Todas han confundido alguna vez:

| Síntoma | Explicación |
|---|---|
| Checks rojos de Vercel con *"Deployment rate limited"* | Se agotó la cuota diaria de despliegues del plan gratis. El build ni arrancó. Los que validan el código son `verify` y `browser-e2e`, en GitHub Actions |
| Productos "Agotado" que sí hay | Falta registrar producción de subproductos, o falta cargar una compra. Mira `admin.tercos.co/inventory/negativos` |
| Un número no coincide con otro | Casi siempre es una regla de negocio: https://admin.tercos.co/guia/reglas |
| El P&G no refleja algo que acabas de corregir | La caché del motor de costos dura 60 segundos |
| "Fuera de servicio" solo en el checkout web | Puede ser deliberado: kill-switch o el horario |
| El arqueo no cuadra | https://admin.tercos.co/guia/caja-cierre |
| QA tarda 10 segundos en cargar la primera vez | QA duerme sin uso. Es normal |

---

## 4. Herramientas: cómo mirar

### 4.1 Salud del API

```bash
curl https://api.tercos.co/healthz
# {"status":"ok","timestamp":"...","checks":{"db":"ok"}}
```

Con la base caída responde **503** (no un 200 degradado). Eso es a propósito: el
POS mira el código de respuesta para decidir si opera offline, y UptimeRobot
detecta así también una base caída, no solo un proceso muerto.

### 4.2 Logs de Railway

```bash
# Producción (API)
railway logs --service api-prod --environment production --deployment --lines 300

# QA
railway logs --service api --environment qa --deployment --lines 300

# Del build, no de la ejecución
railway logs --service api-prod --environment production --build
```

⚠️ El arranque escribe **cientos de líneas** (una por ruta). Si buscas algo del
arranque, pide `--lines 900` o más, o te quedas con la cola.

**Prefijos útiles al filtrar:**

| Prefijo | Qué es |
|---|---|
| `[AlertsModule]` | Si el canal de avisos quedó activo o mudo |
| `[client]` | Error del navegador **de la caja**, con el correo del usuario |
| `[web]` `[cocina]` `[display]` | Error del navegador de esas pantallas |
| `5xx en` | Un error 500 (el mismo que abrió el Issue) |
| `[InstanceGuardService]` | Aviso de más de una instancia viva |

### 4.3 Logs de Vercel

Panel: el proyecto → **Deployments** → el despliegue → *Runtime Logs* o *Build
Logs*. En el plan gratis la retención es corta: si necesitas algo de hace días,
probablemente ya no esté.

### 4.4 Entrar a la base de datos sin exponerla

Requiere el CLI de Railway ≥5.x y tu llave SSH registrada:

```bash
railway connect Postgres-c6Li --environment production   # producción
railway connect Postgres --environment qa                # QA
```

> ⚠️ **Nunca prendas "Public Networking" en las bases.** Cualquiera con la cadena
> de conexión entra. El túnel de arriba hace lo mismo, cifrado y sin exponer
> nada.

### 4.5 La bitácora del negocio

`admin.tercos.co/bitacora` — versión legible y filtrable: caja, anulaciones,
cajón, aprobaciones, sesiones, cocina. `admin.tercos.co/audit` es el detalle
crudo (solo dueño).

Ahí también quedan registrados los avisos al dueño (`OWNER_ALERT_SENT`), con el
canal por el que salieron y si de verdad se entregaron.

---

## 5. Comprobar que las alarmas suenan (cada 6 meses)

**Una alarma que nadie probó es una alarma que no sabes si suena.** El WhatsApp
del dueño estuvo mudo durante meses mientras la base de datos registraba envíos
que nunca ocurrieron. Por eso esto se prueba, no se supone.

### Simulacro 1 — Avisos de error

En https://admin.tercos.co con sesión de **dueño**, abre la consola del navegador
(**⌘ + ⌥ + J** en Mac, `F12` en Windows) y ejecuta:

```js
await fetch('/api/healthz/alert-drill', { method: 'POST', credentials: 'include' }).then(r => r.json())
```

> Chrome bloquea pegar en la consola la primera vez: hay que escribir a mano
> `allow pasting` y dar Enter.

| Respuesta | Significa |
|---|---|
| `{ ok: true, delivered: true, ref: '#N', channel: 'github_issue' }` | ✅ Funciona. Abre el Issue, confirma que **te llegó el correo**, y ciérralo |
| `channel: 'noop'` | ❌ Faltan las variables `ALERT_GITHUB_*` en Railway. **Ningún error 500 te está avisando** |
| `delivered: false` con un motivo | ❌ El token venció o le falta el permiso `Issues: Read and write` |

> ⚠️ **De qué depende que ese correo llegue.** El Issue lo abre un token que
> actúa **como tu usuario**, y GitHub **no notifica de tu propia actividad**. Por
> eso tiene que estar marcada, en
> [Settings → Notifications](https://github.com/settings/notifications) →
> *Customize email updates*, la opción **"Include your own updates"**.
>
> Si algún día se desmarca —o entra otra persona con su cuenta—, el canal **deja
> de avisar sin que nada falle**: el Issue se crea igual y nadie se entera. Este
> simulacro es lo único que lo detecta.
>
> (Los avisos de respaldo sí llegan sin esa casilla, porque los abre
> `github-actions[bot]`, que no eres tú.)

### Simulacro 2 — UptimeRobot

Crea un monitor **temporal** a `https://api.tercos.co/healthz-simulacro` (esa
ruta devuelve 404 = "caído"). En ≤5 minutos llega el correo "Monitor is DOWN".
Borra el monitor temporal. **El monitor real no se toca nunca.**

### Simulacro 3 — healthchecks.io

Abre la Ping URL del check agregándole **`/fail`** al final
(`https://hc-ping.com/<uuid>/fail`). El check cae al instante y llega el correo.
Para revivirlo, corre el respaldo manual (Actions → Run workflow): su ping de
éxito lo pone verde y llega el correo de recuperación.

### Si un correo no llega

1. Revisa spam.
2. UptimeRobot → el monitor → **Notifications**: que tu correo esté marcado.
3. healthchecks → **Integrations**: correo verificado.
4. GitHub → que estés *watcheando* el repositorio y la casilla de §5, simulacro 1.

---

## 6. Inventario de configuración

Qué está puesto, dónde, y con qué valor. Si algo se pierde, esto es lo que hay
que volver a montar.

### 6.1 UptimeRobot — 5 monitores, intervalo 5 minutos

| Nombre | URL | Tipo | Palabra clave | Alertar cuando |
|---|---|---|---|---|
| API | `https://api.tercos.co/healthz` | HTTP | — | responde mal |
| Web del cliente | `https://tercos.co` | Keyword | `No hay productos` | **existe** |
| Caja y gestión | `https://admin.tercos.co/login` | Keyword | `POS Tercos` | no existe |
| Cocina | `https://cocina.tercos.co/login` | Keyword | `Cocina Tercos` | no existe |
| Pantalla del local | `https://display.tercos.co` | Keyword | `Pantalla del local` | no existe |

En todos: *Alert contacts* con tu correo marcado (**sin eso el monitor vigila y
no avisa a nadie**), y la notificación de expiración de certificado activada.

**Por qué esas palabras y no las obvias** (verificado contra producción): las
pantallas de login **no contienen** "Contraseña" ni "Entrar" en el HTML — el
formulario usa `useSearchParams` y Next lo deja detrás de un Suspense, así que el
HTML inicial llega sin él. Elegir esa palabra dejaría el monitor en rojo
permanente. Lo único garantizado es el título de la página.

**El de la web va al revés a propósito:** `No hay productos` es lo que se
renderiza cuando el menú viene vacío, y viene vacío cuando **Vercel no pudo
hablar con el API**. La página responde 200 y se ve bien, pero el cliente no
puede pedir; nada más detecta ese caso. Contrapartida: si alguna vez desactivas
todos los productos a propósito, ese monitor se pone rojo.

⚠️ **Estos monitores NO prueban que puedas iniciar sesión ni cobrar.** Para eso
haría falta un monitor que haga login de verdad, que no está en el plan gratis.

### 6.2 Avisos de error (Issues de GitHub)

- **Token**: fine-grained, acceso solo al repositorio `pos-tercos`, permiso
  **Issues: Read and write**. Nada más.
- **Variables en Railway → `api-prod`**:
  ```
  ALERT_GITHUB_REPO=cristianvelezq1551/pos-tercos
  ALERT_GITHUB_TOKEN=github_pat_…
  ```
  Con **una sola** de las dos, el API **no arranca** — es deliberado: media
  configuración serían cero avisos sin que nadie lo note. Sin ninguna, arranca
  en modo mudo y lo grita en el log de arranque.
- **En QA no se ponen**: ahí se rompen cosas a propósito y el repositorio se
  llenaría de ruido.
- **Etiqueta**: `alerta-produccion`.
- **Depende además** de la casilla "Include your own updates" de tu cuenta (§5).

### 6.3 Respaldos

- Workflow `db-backup.yml`, **cada 6 horas** (1, 7, 13 y 19 UTC = 8 p.m., 2 a.m.,
  8 a.m. y 2 p.m. en Bogotá).
- Destino: Cloudflare R2, bucket de respaldos, prefijo `backups/`.
- **Retención: 30 días.**
- Secretos en GitHub → Settings → Environments → **`production-backup`**
  (restringido a `main`; nunca a nivel de repositorio).
- Dead-man: healthchecks.io, salta si pasan **más de 7 horas** sin ping.

### 6.4 Vercel

- **Skip deployments: activado** en los cuatro proyectos, e *Ignored Build Step*
  en **Automatic** (sin comando propio).
- Un *Ignored Build Step* a mano **no sirve para ahorrar cuota**: sus
  cancelaciones cuentan igual como despliegue. Por eso se quitó.
- ⚠️ Un cambio **fuera de los workspaces** (documentación de la raíz, `.github/`)
  cuenta como global y despliega las cuatro apps.
- ⚠️ Una app que use un paquete **sin declararlo** en sus dependencias no se
  reconstruye: el grafo sale de los `package.json`.

### 6.5 Invariantes que el sistema asume

- **Una sola instancia del API.** Está fijado en `apps/api/railway.json`
  (`numReplicas: 1`). Con dos, el límite anti-abuso y los avisos de pedidos web
  en la caja dejan de ser confiables. Hay una alarma para eso
  (`multi_instance`), que llega por el canal de avisos.
- **`TZ=America/Bogota`** en el servicio: los crons y los cortes de día lo
  asumen.

---

## 7. Respaldos y restauración

### Cómo funciona (solo, sin tocar nada)

Cada 6 horas GitHub Actions hace `pg_dump` de la base de producción, **verifica
el archivo** (mínimo 10 tablas con datos), lo sube a R2, borra los de más de 30
días y pinguea healthchecks.io. Si falla, abre un Issue `backup-failure` y te
llega correo.

### Respaldo manual (antes de una migración riesgosa)

GitHub → Actions → **Postgres backup** → Run workflow → rama `main`. Verde en
~40 segundos.

### Restaurar — ensayo mensual

**Siempre ensayar en una base desechable antes de tocar producción.**

```bash
# 1. Descargar el dump más reciente desde Cloudflare R2 (carpeta backups/)

# 2. Crear una base desechable local
docker exec pos-tercos-postgres psql -U pos -d postgres -c "CREATE DATABASE restore_drill;"

# 3. Restaurar (los dumps son de PostgreSQL 18: hace falta un cliente 18)
docker run --rm -v ~/Downloads:/dumps:ro -e PGPASSWORD=<pass-local> postgres:18 \
  pg_restore --no-owner --no-privileges -h host.docker.internal -U pos -d restore_drill /dumps/<archivo>.dump

# 4. Comprobar que trajo datos
docker exec pos-tercos-postgres psql -U pos -d restore_drill -c "SELECT count(*) FROM sales;"

# 5. Limpiar
docker exec pos-tercos-postgres psql -U pos -d postgres -c "DROP DATABASE restore_drill;"
```

El error `unrecognized parameter "transaction_timeout"` es normal y se ignora.

### Restaurar EN PRODUCCIÓN (solo en desastre real)

Misma receta apuntando a la base de producción, **idealmente sobre una base
nueva** y cambiando el `DATABASE_URL` del API. **Nunca pises la base dañada sin
antes volcarla también** — esa copia es la evidencia de qué pasó.

---

## 8. Lo que todavía no está cubierto

En orden de lo que más rinde por lo que cuesta. Todo es gratis.

| # | Qué | Cuesta | Qué taparía |
|---|---|---|---|
| 1 | **Alarma de "dejó de vender"**: si entre las 12 y las 21 no hubo ninguna venta en 2 horas, avisa | media jornada | El fallo silencioso: nada se cayó, pero nadie puede cobrar |
| 2 | **Leyes matemáticas contra los datos REALES** (hoy corren sobre datos inventados): reproducir el costeo de producción y verificar que el inventario del reporte coincide con la base | ~1 jornada | Los números que dejan de cuadrar sin que nada lance un error |
| 3 | **Panel de novedades en el admin** leyendo `OWNER_ALERT_SENT` de la bitácora | pocas horas | Las alertas de negocio (descuadre, cortesía, anulación) que hoy solo quedan registradas y nadie ve |
| 4 | **Retención de logs**: verificar cuántos días guarda Railway en tu plan | 5 minutos | "¿Qué pasó hace dos semanas?" hoy no tiene respuesta |
| 5 | **Monitor que haga login de verdad** | requiere plan pago | "La página carga pero nadie puede entrar" |

El **1** es el más valioso: es la única alarma que caza el fallo silencioso.

---

## 9. Referencia rápida de comandos

```bash
# ¿Está vivo el API?
curl https://api.tercos.co/healthz

# Logs de producción
railway logs --service api-prod --environment production --deployment --lines 300

# Solo los errores 500
railway logs --service api-prod --environment production --lines 500 | grep -A20 "5xx en"

# Errores del navegador de los clientes
railway logs --service api-prod --environment production --lines 500 | grep -E "\[web\]|\[cocina\]|\[display\]"

# Errores del navegador de la caja (con el usuario)
railway logs --service api-prod --environment production --lines 500 | grep "\[client\]"

# Entrar a la base sin exponerla
railway connect Postgres-c6Li --environment production

# Reproducir un fallo del nightly (la semilla viene en el mensaje)
LEDGER_PROPERTY_RUNS=20000 pnpm -F @pos-tercos/domain exec vitest run src/cost-fifo/run-ledger.property.test.ts
```

**Enlaces:**

| Para qué | Dónde |
|---|---|
| Avisos de error abiertos | https://github.com/cristianvelezq1551/pos-tercos/issues?q=is%3Aopen+label%3Aalerta-produccion |
| CI y respaldos | https://github.com/cristianvelezq1551/pos-tercos/actions |
| Railway | https://railway.com/project/f52f1349-a330-469a-b5e1-c9e742f4db91 |
| Vercel | https://vercel.com |
| UptimeRobot | https://uptimerobot.com |
| healthchecks.io | https://healthchecks.io |
| Guía de la app | https://admin.tercos.co/guia |

---

## 10. Por qué está hecho así

Las decisiones de fondo, para que dentro de un año no parezcan arbitrarias.

**Silencio = está bien.** Todo el diseño busca que no tengas que abrir un panel a
revisar. Un sistema que exige revisarlo termina sin revisarse.

**Los avisos de error van por Issues de GitHub y no por un servicio de
observabilidad.** No cuesta nada, no agrega dependencias ni peso al navegador del
cliente, y el correo que manda GitHub es uno que ya reconoces porque es el mismo
del respaldo.

**Nada finge haber avisado.** Si no hay canal configurado, el sistema lo registra
como *no entregado* y lo grita en el log. Esta regla nació de un problema real:
durante meses la base de datos registró envíos de WhatsApp que nunca ocurrieron,
porque el adaptador de prueba devolvía "enviado". Un aviso que miente es peor que
no tener aviso.

**Media configuración es un error de despliegue, no un modo degradado.** Con una
sola de las dos variables del canal, el API no arranca. La alternativa —arrancar
mudo— significaría cero avisos sin que nadie lo note.

**El stack no viaja al Issue.** Un repositorio no es un log. Al Issue va lo justo
para saber qué se rompió; el detalle está en Railway. Y las credenciales
embebidas en URLs se tapan antes de publicar: un error de conexión puede traer la
cadena entera, y ese es el único punto donde un secreto sale del servidor.

**Los errores del navegador se filtran antes de reportarse.** Un error dentro de
un render se dispara cientos de veces por segundo; sin filtro, el primer bug de
una tarde llena el log y tapa todo lo demás. Se descarta también el ruido conocido
del navegador, que no se puede investigar y casi nunca es nuestro.

**Las alarmas se prueban.** Cada 6 meses, con simulacros que producen avisos
reales. Es la única defensa contra el modo de fallo más traicionero: la alarma
que existe, parece configurada, y no suena.

---

*Documentos hermanos: `URLS-Y-ACCESOS.md` (dónde está cada cosa y con qué se
entra) · `BIBLIA-OPERACION-INFRA.md` (infraestructura, despliegue y costos a
fondo) · `MANUAL-OPERACION.md` (operar el negocio) · la guía dentro de la app
(https://admin.tercos.co/guia).*
