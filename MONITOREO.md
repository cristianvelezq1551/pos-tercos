# Monitoreo — cómo sé si el sistema está bien

> **La idea en una frase:** *si no te llegó ningún correo, está bien.*
> Este documento existe para que no tengas que entrar a ningún panel a
> revisar. Para el detalle de infraestructura está `BIBLIA-OPERACION-INFRA.md`;
> para las puertas y accesos, `URLS-Y-ACCESOS.md`.
>
> Última verificación del canal de avisos: 2026-08-29 (probado contra la API
> real de GitHub: creación, agrupado, tapado de credenciales y los dos modos
> de fallo).

---

## 1. Las cuatro alarmas y qué vigila cada una

| Alarma | Te llega por | Vigila | Actuar en |
|---|---|---|---|
| **UptimeRobot "DOWN"** | correo | El sistema **caído entero** (API muerto, DB caída, DNS o certificado rotos) | minutos |
| **Issue `alerta-produccion`** | correo de GitHub | Un **error 500** en el backend: el sistema sigue en pie pero algo se rompió | el mismo día |
| **healthchecks.io "DOWN"** | correo | El **backup** lleva más de 7 h sin correr | el mismo día |
| **Nightly rojo** | correo de GitHub | Las **leyes matemáticas del inventario** fallaron con historias aleatorias | esta semana |

Además, los errores que revientan en el **navegador** de la web del cliente, la
cocina y el TV se reportan solos al servidor y quedan en los logs de Railway con
el prefijo de su app (`[web]`, `[cocina]`, `[display]`). No mandan correo: son
para investigar cuando alguien reporta "no me dejó pedir", no para despertarte.

Los dos primeros cuidan el **presente** (¿se puede vender ahora?), los dos
últimos el **pasado** (¿los datos están respaldados y cuadran?).

### Lo que NINGUNA alarma ve todavía

Saberlo importa tanto como saber lo que sí cubren:

- **Que el negocio deje de vender.** Un login roto o una caja que no cobra se
  ven igual que un día flojo.
- **Lentitud.** Nada mide cuánto tarda una respuesta.
- **Que la impresora no imprima.** La venta nunca se bloquea por eso, a
  propósito — pero tampoco avisa.

---

## 2. Cuando suene: qué hacer

### 🔴 UptimeRobot "DOWN" — el sistema no responde
1. Abre https://api.tercos.co/healthz en el celular. Si responde, fue un
   parpadeo; el correo de "UP" llega solo.
2. ¿Hubo deploy reciente? → Railway → `api-prod` → Deployments → **Redeploy**
   del anterior. Es la causa número uno en la vida real.
3. Sin deploy reciente → `railway logs --service api-prod` y
   https://status.railway.com.

> Consuelo: la caja tiene modo offline. Las ventas de mostrador se registran en
> el navegador y se sincronizan al volver. Lo que muere mientras tanto son los
> pedidos web.

### 🟠 Issue `alerta-produccion` — un error 500
El sistema funciona; un pedazo se rompió. El Issue trae **la ruta y el
mensaje**; el stack completo NO está ahí (un repositorio no es un log): está en
`railway logs --service api-prod`.

1. Lee la ruta: te dice qué dejó de funcionar (`POST /sales/:id/confirm-payment`
   = no se puede cobrar; `GET /reports/...` = un reporte).
2. Mira si el mismo Issue tiene muchos comentarios: cada comentario es una
   repetición. Uno solo puede ser un caso raro; veinte es un bug vivo.
3. **Cierra el Issue cuando lo arregles.** Si queda abierto, el siguiente caso
   se cuelga de ese hilo y parece que nunca terminó.

> No te va a inundar: máximo un aviso cada 10 minutos por tipo de error, y el
> mismo error repetido comenta en vez de abrir otro.

### 🟡 healthchecks.io "DOWN" — el backup dejó de correr
No vigila el sistema: **vigila al vigilante**.
1. GitHub → Actions → "Postgres backup" → último run.
2. ¿Falló? El log dice qué paso murió; suele ser un secret vencido.
3. ¿Ni corrió? GitHub pausa los crons si el repo pasa **60 días sin commits** —
   hay un botón "Re-enable". Te va a pasar algún día.
4. Arreglado → Run workflow manual → verde → el check revive solo.

### 🟣 Nightly rojo — los números no cuadran
Las leyes del inventario fallaron con datos aleatorios. **No** significa que tu
base esté mal: significa que existe un caso de borde donde el costeo se rompe.
El mensaje trae la **semilla** para reproducirlo:

```bash
LEDGER_PROPERTY_RUNS=20000 pnpm -F @pos-tercos/domain exec vitest run src/cost-fifo/run-ledger.property.test.ts
```

---

## 3. Tu rutina (lo mínimo que hay que hacer, y cada cuánto)

### Todos los días — 0 minutos
Nada. Si no llegó correo, está bien. Ese es el trato.

### Cada semana — 2 minutos
- Mira la bandeja: ¿hay algún Issue `alerta-produccion` abierto que dejaste
  pasar? [Ver los abiertos](https://github.com/cristianvelezq1551/pos-tercos/issues?q=is%3Aopen+label%3Aalerta-produccion)
- Si desplegaste algo esta semana, confirma que el CI quedó verde.

### Cada mes — 15 minutos
- **Backup restaurable**: descarga el dump más reciente de R2 y restauralo en
  una base desechable local. El procedimiento está en
  `BIBLIA-OPERACION-INFRA.md` §6.3. Un backup que nunca se restauró no es un
  backup, es un archivo.
- Railway → `api-prod` → Metrics: la RAM normal es 130–210 MB. Si viene
  creciendo sin freno hace días, reinicia y anótalo.

### Cada 6 meses — 30 minutos
- **Simulacro de las tres alarmas** (§4). Es lo único que prueba que los
  correos DE VERDAD llegan.
- Revisa que el token de GitHub no haya vencido (si le pusiste fecha).

### Cuando toques algo delicado
- Antes de una migración: backup manual (GitHub → Actions → "Postgres backup" →
  Run workflow) y probar la migración en QA primero.
- Después de cada deploy a producción: abre la caja y cobra una venta de
  prueba. Ninguna alarma cubre "se desplegó bien pero la pantalla quedó rota".

---

## 4. Comprobar que las alarmas suenan (cada ~6 meses)

Una alarma que nadie probó es una alarma que no sabes si suena. El WhatsApp del
dueño estuvo mudo **meses** mientras la bitácora afirmaba que enviaba: por eso
esto se prueba, no se supone.

**1. Avisos de error.** Con tu sesión de dueño en el admin, F12 → consola:
```js
await fetch('/api/healthz/alert-drill', { method: 'POST', credentials: 'include' }).then(r => r.json())
```
- Esperado: `{ channel: 'github_issue', delivered: true, ref: '#N' }` y un Issue
  nuevo titulado `[prod] SIMULACRO…`. **Ciérralo.**
- Si dice `channel: 'noop'` → faltan las variables `ALERT_GITHUB_*` en Railway
  y **ningún error 500 te está avisando**.
- Si dice `delivered: false` con un motivo → el token venció o le falta el
  permiso `Issues: Read and write`.

> ⚠️ **De qué depende que ese correo llegue.** El Issue lo abre un token que
> actúa **como tu usuario**, y GitHub no te notifica de tu propia actividad. Por
> eso hace falta tener marcada, en
> [Settings → Notifications](https://github.com/settings/notifications) →
> *Customize email updates*, la opción **"Include your own updates"**. Si algún
> día se desmarca —o entra otra persona al proyecto con su cuenta—, el canal
> **deja de avisar sin que nada falle**: el Issue se crea igual y nadie se
> entera. Este simulacro es lo único que lo detecta.
>
> (Los avisos de backup sí llegan sin esa casilla porque los abre
> `github-actions[bot]`, que no eres tú.)

**2. UptimeRobot.** Crea un monitor temporal a
`https://api.tercos.co/healthz-simulacro` (esa ruta da 404 = "caído"). En ≤5 min
llega el correo "DOWN". Borra el monitor temporal. **El monitor real no se toca.**

**3. healthchecks.io.** Abre la Ping URL del check agregándole `/fail` al final.
El check cae al instante y llega el correo. Para revivirlo, corre el backup
manual: su ping de éxito lo pone verde.

Si un correo no llega: revisa spam, y en GitHub que estés *watcheando* el repo
(Settings → Notifications).

---

## 5. Lo que falta para un esquema fuerte

En orden de lo que más rinde por lo que cuesta. Todo es gratis.

| # | Qué | Cuesta | Qué tapa |
|---|---|---|---|
| 1 | **3 monitores más en UptimeRobot** (`tercos.co`, `admin.tercos.co`, `cocina.tercos.co`) + aviso de expiración del certificado | 10 min, cero código | Hoy si Vercel sirve mal el admin o vence el certificado, nadie avisa |
| 2 | **Alarma de "dejó de vender"**: si entre las 12 y las 21 no hubo ninguna venta en 2 horas, avisa | media jornada | El fallo silencioso: nada se cayó, pero nadie puede cobrar |
| 3 | **Leyes matemáticas contra los datos REALES** (hoy corren sobre datos inventados): reproducir el costeo de producción y verificar que el inventario del reporte coincide con la base | ~1 jornada | Los números que dejan de cuadrar sin que nada lance un error |
| 4 | **Panel de novedades en el admin** leyendo `OWNER_ALERT_SENT` de la bitácora | pocas horas | Las alertas de negocio (descuadre, cortesía, anulación) que hoy solo quedan registradas y nadie ve |
| 5 | **Retención de logs**: verificar cuántos días guarda Railway en tu plan | 5 min de revisión | "¿Qué pasó hace dos semanas?" hoy no tiene respuesta |

### 5.1 Los 4 monitores que faltan, con su configuración exacta

En UptimeRobot: **+ New → Monitor**, tipo **Keyword** (no HTTP(s)), intervalo
5 min, y marcar tu correo en *Alert contacts*. Si aparece la opción **SSL /
domain expiration**, activarla.

| Nombre | URL | Palabra clave | Alertar cuando |
|---|---|---|---|
| Web del cliente | `https://tercos.co` | `No hay productos` | **existe** |
| Caja y gestión | `https://admin.tercos.co/login` | `POS Tercos` | no existe |
| Cocina | `https://cocina.tercos.co/login` | `Cocina Tercos` | no existe |
| Pantalla del local | `https://display.tercos.co` | `Pantalla del local` | no existe |

**Por qué esas palabras y no las obvias** (verificado contra producción el
2026-08-29): las pantallas de login **no contienen** "Contraseña" ni "Entrar" en
el HTML — el formulario usa `useSearchParams`, así que Next lo deja detrás de un
Suspense y el HTML inicial llega sin él. Elegir esa palabra dejaría el monitor
en rojo permanente. Lo único garantizado es el título de la página.

**El de la web va al revés a propósito**: `No hay productos` es lo que se
renderiza cuando el menú viene vacío, y viene vacío cuando **Vercel no pudo
hablar con el API**. La página responde 200 y se ve bien, pero el cliente no
puede pedir; hoy nada más detecta ese caso. Contrapartida: si alguna vez
desactivas todos los productos a propósito, ese monitor se pone rojo.

**Lo que estos 4 NO prueban:** que puedas iniciar sesión ni cobrar. Para eso
haría falta un monitor que haga login de verdad, que no está en el plan gratis;
ese hueco lo tapa el punto 3 de la tabla de arriba.

⚠️ El monitor de `api.tercos.co/healthz` **no se toca**: es el que cubre el
sistema caído entero.

---

El **1 y el 2** son los que yo haría primero: el 1 porque es gratis en tiempo y
el 2 porque es el único agujero que afecta directamente a un cliente que está
tratando de comprar.

---

## 6. Cosas que hay que tener en cuenta

- **El canal de avisos depende de un token de GitHub.** Si le pusiste fecha de
  vencimiento, el día que venza los avisos dejan de salir **en silencio**. El
  `alert-drill` es lo único que te lo dice. Anótalo en el calendario.
- **GitHub pausa los crons a los 60 días sin commits.** Eso apaga el backup
  nocturno. Lo detecta healthchecks.io, no lo detecta nadie más.
- **El sistema asume UNA sola instancia del API.** Si Railway escala a dos, el
  límite anti-abuso y los avisos de pedidos web dejan de ser confiables — hay
  una alarma para eso (`multi_instance`), que llega por el mismo canal.
- **Los reportes financieros tienen 60 segundos de retraso** (caché del motor de
  costos). Si acabas de anular una factura o una merma y el número no cambió,
  espera un minuto antes de pensar que hay un bug.
- **Un 500 no siempre es un bug tuyo.** Puede ser la DB saturada, R2 sin
  responder o el proveedor de IA caído. El mensaje del Issue lo suele decir.
- **No todo lo que se ve raro es un error.** Antes de investigar un número que
  no coincide con otro, mira las reglas de negocio en
  https://admin.tercos.co/guia/reglas — el domicilio fuera de los ingresos, el
  día de negocio que corta a las 4 am y varias más están ahí explicadas.
