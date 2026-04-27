# Plan de Arranque — POS Comida Rápida

> Te asume con cero infra, cero cuentas y cero código. Saca el proyecto del papel y lo lleva a Sprint 0 ejecutado en ~7-10 días, en paralelo a las gestiones externas (Meta WABA, contador, hardware).

---

## 0. Filosofía de ejecución

Tres reglas que aplicás todas las semanas, sin excepción:

1. **Paralelizá lo no-técnico desde día 1.** Meta WABA, hardware, contador y proveedores tardan días o semanas que NO podés acelerar. Dispará todo el día 1 mientras vos arrancás código.
2. **Probá en tienda lo antes posible, aunque sea feo.** Sprint 4-5 ya tenés un POS básico. Llevalo a la tienda con el cajero y dejalo correr 1-2 días. El feedback real vale más que el polish.
3. **No te enamores del plan.** El plan de 18 sprints es una guía, no una sentencia. Si Sprint 3 te toma 2 semanas porque la IA de facturas se complica, ajustá los siguientes. Lo único intocable es el alcance v1 cerrado en `pos-spec.v1.md`.

---

## 1. Acciones DÍA 1 — paralelas y no-técnicas

Estas se disparan ANTES de escribir una línea de código. Son las que tienen plazos largos por terceros.

### 1.1 Línea telefónica + WhatsApp Business

- [ ] Conseguir un **número celular dedicado** para el negocio (no tu personal).
  - Opción rápida: SIM nueva en Claro/Movistar/Tigo (1 día).
  - Plan mínimo prepago alcanza para este uso.
- [ ] Crear cuenta **Meta Business** en `business.facebook.com`.
- [ ] Verificar el negocio (verificación con RUT y documentos legales).
- [ ] Crear cuenta de **WhatsApp Business** asociada al número dedicado.
- [ ] Iniciar el alta de **WhatsApp Cloud API** desde Meta Business → "WhatsApp Manager".
- [ ] Configurar perfil del negocio (nombre, logo, descripción, dirección).

**Plazo realista:** 5-15 días hábiles hasta tener el número aprobado y poder enviar mensajes. La verificación del negocio es el cuello de botella.

### 1.2 Contador (validación DIAN — GAP-14)

- [ ] Reunión con tu contador esta semana.
- [ ] Pregunta exacta: *"Para mi restaurante con régimen [común/RST] y facturación anual estimada de $X, ¿estoy obligado a emitir documento equivalente electrónico POS desde el día 1, o puedo operar con recibo interno mientras integro DIAN en una segunda fase?"*
- [ ] Si la respuesta es **"obligado"**, detenete y reescopeá: hay que meter integración DIAN en v1 (proveedor típico: Facture, Soenac, Carvajal Digital, The Factory HKA). Esto suma 3-4 semanas y cambia el plan.
- [ ] Si la respuesta es **"podés operar con recibo interno por X meses"**, anotá la fecha límite y seguí con v1 como está.

**No te saltes esta validación.** Operar fuera de regla en Colombia te puede costar multas grandes.

### 1.3 Hardware

| Ítem | Modelo recomendado | Aprox COP | Dónde comprar |
|---|---|---|---|
| Impresora térmica USB | Epson TM-T20III | $700k-900k | Mercado Libre, Computrade, Alkomprar empresarial |
| Cajón monedero | Compatible RJ11/12 (cualquiera, ~$200k) | $200k-300k | MercadoLibre |
| PC mostrador | Mini-PC o desktop usado decente (i3+, 8GB RAM, SSD) | $700k-1.2M | Lo que ya tengas o usado |
| Tablet pantalla pública | Lenovo Tab M9 o Samsung A9 (10") | $700k-1M | Cualquier tienda |
| Soporte tablet pared/pedestal | — | $80k-150k | MercadoLibre |
| Router decente para WiFi tienda | TP-Link Archer mid-range | $200k-400k | Si tu router actual es flojo |

**Total hardware:** ~$2.6M-3.7M COP.

Comprá ya la impresora y la tablet — son las que necesitás disponibles para Sprint 5-6.

### 1.4 Cuentas / SaaS a crear

Hacé estos signups la primera semana, todos requieren email:

- [ ] **GitHub** (gratis) — repo del proyecto.
- [ ] **Vercel** (gratis para empezar, Pro USD $20/mes en producción) — frontends.
- [ ] **Railway** (USD $5 free credit + paga al usar) — backend + Postgres.
- [ ] **Cloudflare** (gratis) — DNS + R2 storage.
- [ ] **Anthropic Console** (`console.anthropic.com`) — API key Claude Haiku 4.5. Recargá USD $10-20 inicial.
- [ ] **OpenAI Platform** (`platform.openai.com`) — API key GPT-4o-mini fallback. USD $5-10 inicial alcanzan.
- [ ] **Mapbox** (`account.mapbox.com`) — token gratis.
- [ ] **Tailscale** (gratis para 1 device) — VPN para acceso remoto al PC mostrador.
- [ ] **Sentry** (gratis tier) — error tracking en producción.

**Importante:** anotá todas las API keys en un password manager (Bitwarden gratis, 1Password, etc.). No las dejes en archivos de texto plano.

### 1.5 Dominio

- [ ] Registrar dominio (ej. `tu-negocio.co` o `tu-negocio.com.co`) — Cloudflare Registrar a precio costo (~USD $10-15/año).
- [ ] Definir subdominios pre-asignados:
  - `tu-negocio.co` → web pública.
  - `pos.tu-negocio.co` → POS Cajero.
  - `kds.tu-negocio.co` → KDS Cocina.
  - `display.tu-negocio.co` → pantalla pública.
  - `admin.tu-negocio.co` → admin completo.
  - `repa.tu-negocio.co` → app del repartidor.
  - `api.tu-negocio.co` → backend NestJS.

---

## 2. Setup técnico DÍAS 1-3 (Sprint 0 inicio)

Esto se hace en paralelo a lo de arriba. La meta: terminar el día 3 con monorepo en GitHub, backend deployable y frontends placeholders en Vercel.

### 2.1 Día 1 — Local

```bash
# Instalar herramientas si no las tenés
brew install node@20 pnpm
node --version  # 20.x
pnpm --version  # 9.x
```

```bash
# Crear el monorepo
mkdir pos-tercos && cd pos-tercos
pnpm dlx create-turbo@latest .
# Elegí "TypeScript", "pnpm", remover apps que no necesitás
```

Estructura inicial mínima:

```
pos-tercos/
├── apps/
│   ├── api/           # NestJS — crearlo con `nest new api` adentro
│   └── web/           # Next.js placeholder
├── packages/
│   └── types/         # tsconfig + zod base
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

```bash
# Inicializar git y push a GitHub
git init
git add -A
git commit -m "chore: initial monorepo scaffold"
gh repo create pos-tercos --private --source=. --push
```

### 2.2 Día 2 — Backend NestJS + Postgres local

```bash
cd apps/api
pnpm dlx @nestjs/cli new . --package-manager pnpm --skip-git
pnpm add @prisma/client zod nestjs-zod
pnpm add -D prisma
pnpm dlx prisma init
```

Crear `docker-compose.dev.yml` en raíz con Postgres local. Levantar.

Implementar:
- Healthcheck `/healthz`.
- Prisma schema con `users` table (la primera).
- Endpoint `POST /auth/login` simple.

### 2.3 Día 3 — Vercel + Railway deploy

- Conectar GitHub repo a Vercel para los frontends (auto-deploy en push a main).
- Conectar GitHub repo a Railway para el backend `apps/api`.
- Crear servicio Postgres en Railway.
- Configurar env vars (DATABASE_URL, JWT_SECRET, etc.).
- Verificar que `/healthz` responde en `https://api.tu-negocio.co`.
- Configurar DNS en Cloudflare apuntando a Vercel y Railway.

**Hito Sprint 0 día 3:** podés hacer `git push` y ver el cambio en producción en 2 minutos. Esto es la base sobre la que crecen los siguientes 17 sprints.

---

## 3. Cómo trabajar con Claude Code

Tu fuerza multiplicadora real. La diferencia entre 18 semanas y 30 semanas la define **cómo lo usás**.

### 3.1 Ciclo recomendado por sprint

1. **Lunes (planeación, 30 min):** abrís Claude Code en la raíz del repo. Le pasás el sprint actual de `architecture.md` sección 12 + un prompt tipo:
   > *"Vamos a empezar Sprint N. Plan paso a paso para el sprint, en checkpoints chicos verificables. No empieces a codear todavía."*
   
   Claude te devuelve un plan más fino. Vos lo revisás, le marcás dónde podría salir mal, ajustás.

2. **Martes-jueves (implementación):** Claude codea siguiendo el plan. Vos revisás cada PR/commit. Aceptás, rechazás o pedís cambios.

3. **Viernes (verificación + push):** corrés el sprint completo end-to-end manualmente. Si funciona, deploy a staging. Si no, lista de bugs para el lunes.

### 3.2 Reglas para evitar quemar tu tiempo

- **Una tarea bien definida por mensaje a Claude.** No le digas "termina el sprint 3". Decile "implementá el adapter `LLMProvider` con la interfaz X y la impl `AnthropicAdapter` que hace una request POST al endpoint Y con headers Z; los tipos están en `packages/types/llm.ts`".
- **Pedile que escriba tests primero** en backend. Hace el código más estable y te ahorra debugging a futuro.
- **Revisá las migrations Prisma manualmente antes de aplicarlas en prod.** Una migration mala destruye datos. Pediles a Claude que las marque `--create-only` para revisarlas.
- **No le dejes tomar decisiones de UX importantes solo.** El UX del cajero (F-J) lo definís vos. Claude implementa lo que vos decidís.
- **Mantené `pos-spec.v1.md` y `architecture.md` actualizados.** Si en un sprint cambia algo, lo editás. Claude usa estos docs como contexto. Documentación obsoleta = decisiones malas.

### 3.3 Comandos / skills de Claude Code útiles

- `/init` — crear `CLAUDE.md` en el repo (contexto persistente para Claude). Hacelo en Sprint 0 día 3.
- `/review` — revisar un PR antes de mergearlo.
- `/security-review` — antes de exponer una superficie nueva (web pública, API).

Cuando llegues a Sprint 8 (WhatsApp), Sprint 12 (anti-fraude / IA auto-pedido), o Sprint 16 (QA con usuarios reales), considerá usar agentes especializados (`prompt-master` para mensajes WhatsApp, `fact-checker` para validar precios IA, `humanizalo` para textos de la web pública).

---

## 4. CLAUDE.md inicial del repo

En Sprint 0 día 3, creá `CLAUDE.md` en la raíz con este contenido base. Es el contexto que Claude lee siempre.

```markdown
# POS Tercos — Guía para Claude Code

## Contexto del proyecto
POS para restaurante de comida rápida en Colombia. 1 punto de venta, 1 cajero por turno.
v1 alcance cerrado en `pos-spec.v1.md`. Arquitectura en `architecture.md`. Plan en `kickoff-plan.md`.

## Stack
- Backend: NestJS + Prisma + Postgres (Railway)
- Frontends: Next.js App Router (Vercel)
- Monorepo: Turborepo + pnpm workspaces
- Auth: JWT
- Realtime: WebSocket (KDS, repartidor) + SSE (pantalla pública)
- IA: Anthropic Claude Haiku 4.5 + OpenAI GPT-4o-mini fallback
- WhatsApp: Cloud API oficial Meta
- Mapas: Mapbox

## Reglas de código
- TypeScript strict.
- Validación con Zod, schemas en `packages/types`. Backend infiere desde Zod.
- Prisma como ORM. Una migration por feature, revisable.
- Idempotency keys obligatorias en endpoints POST que crean recursos críticos (ventas, movimientos).
- Audit log inmutable para acciones sensibles (anulaciones, descuentos, ajustes).
- No comentarios obvios. Solo cuando el "por qué" no es evidente.

## Convenciones
- Commits: convencional commits (feat, fix, chore, refactor, docs, test).
- PRs (cuando aplique): título corto + descripción con qué cambió y por qué.
- Tests: jest unit en `apps/api`, supertest e2e para endpoints críticos.

## NO hacer sin preguntarme
- Cambiar el alcance de v1.
- Borrar migraciones aplicadas en producción.
- Tocar variables de entorno de producción.
- Aplicar migraciones a Railway directamente sin revisar.
- Agregar dependencias nuevas pesadas (más de 50 KB).

## Sprint actual
Editá esta sección al inicio de cada sprint con el sprint vigente y los checkpoints.
```

---

## 5. Cadencia operativa semanal

| Día | Tiempo | Actividad |
|---|---|---|
| Lunes | 30-60 min | Planeación de sprint con Claude. Editar `CLAUDE.md` con sprint vigente. |
| Martes | 4-6 hs | Implementación con Claude. Revisar y mergear. |
| Miércoles | 4-6 hs | Implementación. |
| Jueves | 4-6 hs | Implementación. |
| Viernes | 2-4 hs | Verificación end-to-end. Deploy a staging. Bugfix lista. |
| Sábado/Domingo | descanso o buffer | Solo si vas atrasado. **No quemes weekends por costumbre.** |

**Total semanal de dev real estimado: 25-35 hs.** Esto es lo realista para 1 dev solo si querés sostener 18 semanas sin burnout.

---

## 6. Hitos críticos para parar y validar

| Sprint | Hito | Cómo validar |
|---|---|---|
| 0 (sem 1) | Repo desplegando a producción con un push | Push a main → ver cambio en Vercel/Railway en <2 min |
| 3 (sem 4) | IA de facturas funciona con facturas reales | Procesar 10+ facturas distintas tuyas, medir precisión |
| 5 (sem 6) | POS imprime y abre cajón offline | Pruebas con la impresora real, sin internet en el momento |
| 8 (sem 9) | WhatsApp manda mensajes en producción | Mensaje real de prueba al celular tuyo desde Meta |
| 11 (sem 12) | Sistema de descuadre alerta al Dueño | Forzar un descuadre, verificar que llega WhatsApp |
| 17 (sem 18) | Tienda vendiendo con el sistema | 1 día completo de operación real |

Si un hito no se cumple, **detenete y arreglalo antes de seguir**. Acumular bugs entre sprints es el camino directo a la trampa de "nunca está listo".

---

## 7. Cuándo retomamos Fase 4 y Fase 5

- **Fase 4 (mcp-builder — diseño detallado de integraciones externas):** la abrimos al inicio de **Sprint 8** (WhatsApp), porque ahí necesitás el contrato exacto de la integración. Los demás adapters (IA, R2, Mapbox) no necesitan ese nivel de detalle, los cubre `architecture.md`.
- **Fase 5 (humanizalo + fact-checker → MVP-GUIDE.md):** la abrimos al final de **Sprint 16**, antes del soft launch. Es el documento que vas a leer cuando ya hayas construido todo y quieras un manual de operación final + verificación de afirmaciones técnicas/regulatorias.

---

## 8. Lista cerrada de ítems para tachar la semana 1

Si hacés esta semana solo esto, ya estás bien:

- [ ] Línea telefónica nueva y SIM activada para el negocio.
- [ ] Cuenta Meta Business creada + verificación iniciada.
- [ ] Reunión con contador agendada.
- [ ] Compra de impresora y tablet hecha (o pedido en camino).
- [ ] Cuentas creadas: GitHub, Vercel, Railway, Cloudflare, Anthropic, OpenAI, Mapbox, Tailscale.
- [ ] Dominio registrado en Cloudflare.
- [ ] Repo monorepo creado en GitHub, push hecho.
- [ ] Backend NestJS deployando a Railway, frontend placeholder en Vercel.
- [ ] `/healthz` responde en `https://api.tu-negocio.co`.
- [ ] `CLAUDE.md` creado en raíz con contexto inicial.

**Si lográs ese punto, llegaste al fin de Sprint 0.** Lo demás es cuesta abajo, sprint a sprint, siguiendo `architecture.md` sección 12.

---

## 9. Qué hacer si algo se atrasa

| Situación | Acción |
|---|---|
| Meta WABA tarda > 2 semanas | Empezás Sprint 8 con sandbox de Twilio (tiene WhatsApp dev gratis). Cambiás a Meta cuando se apruebe — el adapter ya está listo. |
| Hardware no llega | Sprints 1-3 no necesitan hardware. Avanzás. La impresora se necesita en Sprint 5. |
| Contador dice "obligado a DIAN" | Pausa scope, contratás proveedor DIAN, reescopeás. Suma 3-4 semanas a v1. |
| IA de facturas tiene baja precisión real | Ajustás prompt, probás Haiku con imágenes pre-procesadas (rotación, contraste). Si sigue floja, evaluás Document AI o aceptás la tasa de fallback al manual rápido. |
| Vas atrasado 2+ semanas en algún sprint | **No metas weekends.** Mová Sprint 14 (RRHH ligero) a v1.1, ganás 1 semana. Si sigue corto, mová Sprint 13 (dashboard secundario, dejás solo top 8) a v1.1, ganás 0.5 semana. |

---

**Empezá hoy. La semana 1 ya tiene una lista cerrada arriba — sacala. El monorepo y los signups los terminás en 2-3 días si te concentrás. El resto del proyecto se construye encima de esa base.**
