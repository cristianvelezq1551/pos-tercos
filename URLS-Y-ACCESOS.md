# URLs y accesos — POS Tercos

> **La chuleta.** Dónde está cada cosa, con qué se entra y qué hacer cuando algo
> se ve raro. Para el detalle de infraestructura (cómo se despliega, backups,
> costos, qué hacer si se cae) está `BIBLIA-OPERACION-INFRA.md`; para operar el
> negocio, `MANUAL-OPERACION.md`. Esto es solo el índice de puertas.
>
> Última verificación: 2026-08-26 — todas respondieron.

---

## 1. Producción — lo que usa el negocio

| Qué | URL | Quién entra |
|---|---|---|
| Web del cliente | https://tercos.co | Cualquiera, sin clave |
| Caja + gestión | https://admin.tercos.co | Dueño y admin operativo |
| Cocina | https://cocina.tercos.co | Cocinero, admin operativo, dueño |
| Pantalla del local | https://display.tercos.co | Nadie — corre sola en el TV |
| API (backend) | https://api.tercos.co | No es para abrir a mano |

`www.tercos.co` redirige solo al dominio sin www.

**Prueba de vida del backend:** https://api.tercos.co/healthz
Debe responder `{"status":"ok","checks":{"db":"ok"}}`. Si no, ve a la sección 6.

### Atajos dentro del admin

| Qué | URL |
|---|---|
| Caja (vender) | https://admin.tercos.co/caja |
| Cerrar turno / arqueo | https://admin.tercos.co/caja/cierre |
| Historial del día | https://admin.tercos.co/caja/historial |
| **Guía de capacitación** | https://admin.tercos.co/guia |
| Configurar la web del cliente | https://admin.tercos.co/publicidad |
| Productos | https://admin.tercos.co/products |
| Facturas de compra | https://admin.tercos.co/invoices |
| Existencias | https://admin.tercos.co/inventory |
| Estado financiero | https://admin.tercos.co/finanzas/estado |
| Usuarios | https://admin.tercos.co/users |
| Bitácora | https://admin.tercos.co/bitacora |

**Guía del cocinero:** https://cocina.tercos.co/guia

> La caja (`/caja`) la abre el **admin operativo**; al dueño lo devuelve al panel.
> Es a propósito: quien vende no es quien audita.

---

## 2. QA — para probar sin miedo

Datos de mentira. Rompe lo que quieras.

| Qué | URL |
|---|---|
| Admin/Caja | https://pos-tercos-admin-git-main-cristianvelezq1551s-projects.vercel.app |
| Web del cliente | https://pos-tercos-web-git-main-cristianvelezq1551s-projects.vercel.app |
| Cocina | https://pos-tercos-cocina-git-main-cristianvelezq1551s-projects.vercel.app |
| Pantalla | https://pos-tercos-public-display-git-main-cristianvelezq1551s-projects.vercel.app |
| API | https://api-qa-5833.up.railway.app · vida: `/healthz` |

**Dos cosas que confunden y no son fallas:**
- QA **duerme sin uso**: la primera carga tarda unos 10 segundos. Es normal.
- Las cuatro de Vercel están **detrás del login de Vercel**. Abren bien en tu
  navegador si estás con sesión de Vercel; por fuera responden 302.

---

## 3. Paneles de control

| Servicio | URL | Entras con | Para qué |
|---|---|---|---|
| Railway | https://railway.com/project/f52f1349-a330-469a-b5e1-c9e742f4db91 | Google | Backend y bases de datos |
| Vercel | https://vercel.com | GitHub | Las cuatro pantallas |
| Cloudflare | https://dash.cloudflare.com | email | Dominio, DNS y las fotos (R2) |
| Repositorio | https://github.com/cristianvelezq1551/pos-tercos | GitHub | El código |
| CI y backups | https://github.com/cristianvelezq1551/pos-tercos/actions | GitHub | Pruebas y respaldos |
| Avisos de errores | https://github.com/cristianvelezq1551/pos-tercos/issues?q=is%3Aopen+label%3Aalerta-produccion | GitHub | Los 500 del backend, agrupados |
| UptimeRobot | https://uptimerobot.com | tu cuenta | Vigila el API cada 5 min |
| healthchecks.io | https://healthchecks.io | tu cuenta | Avisa si el backup deja de correr |
| Llaves SSH de Railway | https://railway.com/account/ssh-keys | Google | Acceso a las bases sin exponerlas |

En Vercel, el scope es **`cristianvelezq1551s-projects`** y los proyectos son
`pos-tercos-admin`, `pos-tercos-web`, `pos-tercos-cocina` y
`pos-tercos-public-display`.

---

## 4. Cuentas del sistema

> Las claves NO se escriben acá. Van en tu gestor de contraseñas.

| Entorno | Correo del dueño | Rol |
|---|---|---|
| Producción | `cristianvelez1551@gmail.com` | DUENO |
| QA | `dueno-qa@tercos.co` | DUENO |

Cada uno tiene además un **PIN de 6 dígitos**, que es distinto de la contraseña:
la clave sirve para entrar, el PIN para **autorizar** (anular una venta,
reembolsar, abrir el cajón sin venta).

**Los cinco roles:**

| Rol | Entra a | No puede |
|---|---|---|
| Dueño | Gestión completa y Cocina | Operar la caja |
| Admin operativo | Caja, Cocina y la parte operativa de Gestión | Ver finanzas, reportes, nómina ni auditoría |
| Cocinero | Solo Cocina | Ver costos, precios de compra ni ventas |
| Cajero | Nada — rol retirado | Quedó del modelo viejo |
| Trabajador | Nada | Existe para la nómina, no para entrar |

---

## 5. Cómo se despliega un cambio

```
rama de trabajo ──PR──► CI en verde ──► merge a `main` ──► QA (solo)
                                              │
                                              └── merge a `prod` ──► PRODUCCIÓN
```

**Nunca** se toca producción directo. El orden completo está en
`BIBLIA-OPERACION-INFRA.md` §4. Lo mínimo que hay que saber:

1. Rama desde `main`, cambios, PR.
2. Esperar el CI verde (typecheck, lint, ~700 pruebas, 485 e2e y un navegador
   real operando la caja).
3. Merge a `main` → QA se despliega solo en unos minutos.
4. Probar en QA.
5. Promover a producción:
   ```bash
   git checkout prod && git merge --ff-only main && git push origin prod && git checkout main
   ```

**Si el cambio trae migración de base de datos:** correr un backup manual antes
(GitHub → Actions → "Postgres backup" → Run workflow) y confirmar que la
migración corrió limpia en QA. Las migraciones no se deshacen solas.

---

## 6. Cuando algo se ve raro

| Síntoma | Qué mirar primero |
|---|---|
| No carga ninguna pantalla | `https://api.tercos.co/healthz`. Si no responde, el backend está caído: Railway → `api-prod` → Deploy logs |
| Una sola pantalla no carga | Vercel → ese proyecto → último deployment |
| "Agotado" en productos que sí hay | Falta registrar producción de subproductos, o falta cargar una compra. Mira `admin.tercos.co/inventory/negativos` |
| El arqueo no cuadra | La guía lo explica: https://admin.tercos.co/guia/caja-cierre |
| Un número no coincide con otro | Casi siempre es una regla de negocio, no un error. Está en https://admin.tercos.co/guia/reglas |
| Llegó un Issue de GitHub `alerta-produccion` | Un error 500 en el backend. El Issue trae la ruta y el mensaje; el detalle con stack está en `railway logs --service api-prod` |
| Llegó un correo de UptimeRobot "DOWN" | El API no responde. Railway → `api-prod` |
| Llegó un correo de healthchecks.io | El backup dejó de correr. GitHub → Actions |

**Ver logs del backend:**
```bash
railway logs --service api-prod      # producción (elegir entorno production)
railway logs --service api           # QA (entorno qa)
```

**Entrar a una base de datos sin exponerla** (requiere CLI 5.x y tu llave SSH
registrada):
```bash
railway connect Postgres --environment qa           # QA
railway connect Postgres-c6Li --environment production   # producción
```

> ⚠️ **No prendas "Public Networking" en las bases.** Railway te lo advierte:
> cualquiera con la cadena se conecta. El túnel de arriba hace lo mismo cifrado
> y sin exponer nada.

---

## 7. Respaldos

- **Automático:** cada noche, la base de producción se respalda a Cloudflare R2
  (bucket `pos-tercos-backups`). Si falla, se abre un Issue en GitHub y llega
  correo de healthchecks.io.
- **Manual:** GitHub → Actions → "Postgres backup" → Run workflow. Tarda ~30 s.
- **Restaurar:** el procedimiento está en `BIBLIA-OPERACION-INFRA.md`. Ojo: los
  dumps son de PostgreSQL 18, así que hay que restaurarlos con un cliente 18
  (imagen `postgres:18` de Docker).

Las fotos (productos, comprobantes, evidencias de merma, publicidad) viven en el
bucket `pos-tercos-prod`, **separado del de backups**: las llaves de uno no
sirven para el otro.

---

## 8. Configuración que vive en la base, no en el código

Esto se carga desde el admin y **se pierde si se resetea la base**. Si alguna vez
haces un reset limpio, esta es la lista de lo que hay que volver a cargar:

- Datos de pago (las cuentas a las que transfiere el cliente)
- Teléfono, dirección, enlace del mapa y coordenadas
- Horarios de atención y sus excepciones por fecha
- Domicilios: si están activos y el radio de cobertura
- Página "Nosotros", redes sociales
- Publicidad y música de la pantalla del local
- Medios de pago habilitados
- Tesorería: fecha de corte y saldos iniciales
- Puntos del checklist de cocina
- El catálogo completo (productos, insumos, subproductos, recetas, promociones)

El usuario dueño, su PIN y las categorías base **sí** se recrean solos con el
script `apps/api/prisma/bootstrap-prod.ts`.

---

## 9. Documentos hermanos

| Documento | Para qué |
|---|---|
| `MONITOREO.md` | **Cómo sé si el sistema está bien**: las 4 alarmas, qué hacer cuando suenan y la rutina por frecuencia |
| `BIBLIA-OPERACION-INFRA.md` | Infraestructura a fondo: despliegue, backups, monitoreo, costos, qué hacer si algo falla |
| `MANUAL-OPERACION.md` | Operar el negocio día a día |
| `CLAUDE.md` | Estado y decisiones de arquitectura del sistema |
| `deploy.md` | Detalle exhaustivo de variables de entorno y migraciones |
| La guía en la app | https://admin.tercos.co/guia — 12 capítulos, 80 temas, paso a paso |
