# Cobertura de tests — estado y cómo medirla

> Medición real del 2026-07-25. Reproducila con los comandos de abajo, no confíes en este número si pasaron semanas.

## Cómo medir

```bash
pnpm test                 # todos los tests unitarios (rápido, sin DB)
pnpm test:cov             # los mismos + reporte de cobertura por paquete

# e2e del backend (necesita Postgres arriba: docker compose up -d postgres)
pnpm -F @pos-tercos/api test:e2e
pnpm -F @pos-tercos/api test:e2e:cov   # + cobertura sobre apps/api/src
```

El HTML detallado queda en `<paquete>/coverage/index.html`.

## Números

| Paquete | Tests | Líneas | Ramas | Qué mide |
|---|---:|---:|---:|---|
| `packages/domain` | 314 | **94.9%** | 87.6% | lógica pura de negocio |
| `apps/api` (backend, e2e) | 354 | **76.8%** | 62.1% | e2e contra Postgres real |
| `apps/api` (`common/`, unit) | 106 | 58.5% | 91.9% | invariantes de arranque, tx, rangos HTTP, SSRF de Maps |
| `packages/types` | 162 | 57.8% | 80.3% | contratos Zod |
| `apps/print-agent` | 70 | 49.5% | 100% | auth, cola, ruteo, `.env`, contratos |
| `packages/ui` | 106 | 19.0% | 87.1% | formatters + inputs de plata + PIN + login |
| `apps/admin` | 112 | — | 88.6% | `lib/` + hooks + 2 componentes |
| `apps/cocina` | 32 | — | 93.4% | middleware (aislamiento de cookies) + uuid |
| `apps/web` | 21 | — | 88.2% | `lib/` |
| `apps/public-display` | 10 | — | 100% | fallback del B-roll |
| **Total** | **1.287** | | | 933 unit + 354 e2e |

`packages/brand` no tiene tests **a propósito**: son logos, marquesinas y
carruseles decorativos. Un test de "el tagline cambia a los 8 segundos" existiría
para subir el número, no para atrapar un bug.

**Cómo leer el % de líneas.** En los apps Next (`admin`, `web`, `cocina`,
`public-display`) y en `packages/ui` el denominador son TODOS los archivos del
paquete, y la mayoría son componentes React que ningún test unitario importa. Un
3.9% de líneas en `admin` no significa "el 96% está sin probar": significa que el
grueso de `admin/src` es UI, y la UI se verifica con Playwright
(`apps/admin/e2e/`). **En esos paquetes mirá la columna de RAMAS**, que se
calcula sobre el código que los tests sí ejecutan. Los números comparables contra
un objetivo son `domain` (94.9%) y el backend vía e2e (76.8%).

En `print-agent` el 49.5% restante es IO de hardware real (`writeWindowsRaw` por
el spooler de Windows, `writeUsb` por libusb): no se puede ejercitar sin la
impresora conectada. Toda la lógica que decide QUÉ y A DÓNDE mandar sí está
cubierta al 100% de ramas.

## Qué está cubierto

- **Motor de negocio** (`domain`): FIFO/COGS, recetas, promociones,
  disponibilidad, nómina, día de negocio, ESC/POS, plantillas de WhatsApp,
  prompts de IA.
- **Backend** (e2e): ciclo de venta completo, cobros divididos, cierre de caja,
  concurrencia Serializable, tesorería, cortesías, pedidos web.
- **Invariantes de producción** (`assert-env`): CORS, cookies Secure, entropía de
  secretos, storage efímero, `TRUST_PROXY_HOPS`, print-agent expuesto.
- **Contratos Zod**: descuentos manuales, cuenta abierta, pago simple XOR
  dividido, XOR polimórfico de inventario, teléfono E.164, promos por tipo,
  combos/reventa, factura + comprobante obligatorio, tesorería, nómina,
  horarios, empleo.
- **Print agent**: comparación timing-safe del secret, regla fail-safe de
  exposición (sin secret → solo loopback), serialización de la cola de impresión
  (y que un fallo no la rompa para siempre), prioridad de ruteo entre impresoras,
  parser del `.env`.
- **POS**: orquestación del cobro, ledger de stock offline, arqueo de cierre.
- **Cocina**: el middleware saca las cookies `admin_*`/`pos_*` antes de proxiar
  (sin eso el backend autenticaría al cocinero con la sesión del dueño).
- **Design system** (`packages/ui`): formatters de plata/fecha/cantidad (el
  `formatCop` de todo recibo y reporte), los inputs de monto (el usuario ve
  `100.000`, el estado guarda `100000`), el campo de PIN y el formulario de login
  de las tres apps.

## Deuda conocida

1. **`packages/types`** — 9 de 31 archivos de schema tienen tests. Los que faltan
   son más de forma que de regla de negocio, pero quedan varios `refine`
   (business-config, web-hero, suppliers, kitchen) sin cubrir.
2. **Ramas del backend al 61.9%**: los caminos de error/rollback de los servicios
   grandes (`sales`, `shifts`, `invoices`) se ejercitan menos que los felices.
3. **IO de hardware del print-agent**: solo verificable con la impresora física
   (checklist manual de `deploy.md`).
4. **Componentes de presentación** (`ui` y los apps Next): se verifican con los
   Playwright del admin, no con tests unitarios. Es una decisión, no un olvido.

## Reglas al agregar tests

- Un test tiene que **matar un mutante concreto**: escribí en el `describe` qué
  bug real detecta. Los tests que solo re-afirman el código no valen el mantenimiento.
- Lógica pura → `packages/domain`. Si la estás probando desde un app, casi
  siempre debería vivir en domain.
- Backend: e2e sobre Postgres real. Toda suite crea sus propios usuarios y llama
  `cleanDb` en `afterAll` (la caja única bloquea a la suite siguiente si queda abierta).
- Frontend: probá `lib/` y hooks con Vitest; los flujos de pantalla, con Playwright.
- Si algo no se puede testear porque tiene efectos al importarse (un servidor que
  arranca solo), extraé la lógica a un módulo aparte — es lo que se hizo con
  `print-agent/src/main.ts` (`auth`, `print-queue`, `schemas`, `env-file`).
- Jest en este repo **debe** usar `coverageProvider: "v8"` — `babel-plugin-istanbul@6`
  exige Babel ^7 y el monorepo ya está en Babel 8, así que instrumentar con el
  provider por defecto revienta el suite completo.
