# Migración WhatsApp: OpenWA → Kapso (Cloud API oficial)

> **Objetivo:** reemplazar el envío por OpenWA (whatsapp-web.js, con riesgo de baneo)
> por la **WhatsApp Cloud API oficial de Meta** vía **Kapso** (Meta Business Partner).
> Número de producción: **chip físico prepago +57 dedicado**, usado una sola vez para
> el código de registro y luego guardado (el número vive 100% en la API, no en un teléfono).
>
> **Anti-baneo:** al ser Cloud API oficial, desaparece el baneo por automatización
> (la causa #1 con OpenWA). El número solo se arriesga por violación de políticas
> (spam, sin consentimiento). Nuestro uso es transaccional y con consentimiento
> implícito (el cliente acaba de pedir) → riesgo bajo.

---

## Estado de fases

| Fase | Qué | Estado |
|---|---|---|
| **A** | Adapter Kapso + cableado del factory (drop-in, mismo `sendText`) | ✅ HECHO (auditada 2026-07-05: config parcial `KAPSO_*`/`OPENWA_*` ahora es fail-fast al boot, no mock silencioso; documentada la semántica `sent`=aceptado-por-API) |
| **B** | Templates para mensajes business-initiated (`sendTemplate`) | ✅ **HECHO (2026-07-05)** — `templates.ts` en domain (5 builders + sanitizer, testeados), `sendTemplate` en Kapso+Mock, branch en NotificationService y OwnerNotificationService. Se activa con `WHATSAPP_TEMPLATES_ENABLED=true` (apagado = texto libre, sandbox sigue igual) |
| **C** | Bandeja de entrada para responder al cliente (inbox web) | ⏳ Usar la de Kapso (cero código) |
| **PROD** | Registro del número + env vars en Railway + go-live | ⏳ Derrotero abajo — **solo queda lo que necesita el NÚMERO físico** |

---

## ✅ CHECKLIST GO-LIVE (paso a paso, 2026-07-05)

> **No queda nada que programar (Fases A+B codeadas y verificadas).** Esto es TODO lo que
> falta para producción, en orden. Detalle de cada paso en el derrotero de abajo.

**Prueba ya mismo, sin número (sandbox — Paso 0):**
- [ ] Cuenta free en kapso.com → copiar `API key` + `phone number id` del **sandbox**.
- [ ] Unir tu celular al sandbox (mandar el código por WhatsApp al número sandbox).
- [ ] En `apps/api/.env.local`: `KAPSO_API_KEY` + `KAPSO_PHONE_NUMBER_ID` → el log de la API
      debe decir `Using KapsoWhatsAppAdapter`.
- [ ] Pedido web con tu teléfono → llegan los 4 avisos reales del flujo (texto libre).

**Producción (cuando esté el número):**
- [ ] **1. Chip prepago +57 nuevo y dedicado** — se usa UNA vez para el código de
      verificación y se guarda. NO abrirle WhatsApp normal. *(Paso 1)*
- [ ] **2. Registrar el número en Kapso** (embedded signup de Meta; sin verificación de
      negocio alcanza al arranque: ~250 conversaciones/día). Configurar perfil del negocio
      y anotar el `phone number id` de producción. *(Paso 2)*
- [ ] **3. Registrar los 5 templates utility (idioma `es`)** con los nombres EXACTOS
      cableados en el código: `payment_instructions`, `payment_received`, `pickup_ready`,
      `order_canceled`, `alerta_negocio`. Cuerpos exactos en el Paso 3. Aprobación:
      minutos a horas. Anotar el language code aprobado.
- [ ] **4. Env vars en Railway** *(Paso 6)*:
      `KAPSO_API_KEY` (prod) · `KAPSO_PHONE_NUMBER_ID` (prod) ·
      `WHATSAPP_TEMPLATES_ENABLED=true` (recién con los 5 templates APROBADOS) ·
      `WHATSAPP_TEMPLATE_LANG=es` (o `es_CO` según aprobación) · **borrar las `OPENWA_*`**.
      Confirmar que ya existen `BUSINESS_NAME`, `BUSINESS_ADDRESS_SHORT`,
      `PAYMENT_INSTRUCTIONS_NEQUI/TRANSFER`, `OWNER_WHATSAPP_PHONE`.
- [ ] **5. Redeploy + smoke de 9 pasos** *(Paso 7)*: pedido real → 4 templates al cliente +
      `alerta_negocio` al dueño + `whatsapp_messages.status='sent'` + respuestas visibles
      en la bandeja web de Kapso.
- [ ] **6. Operación**: responder clientes SIEMPRE desde la bandeja web de Kapso (no desde
      un celular); vigilar el quality rating *(Paso 8)*.

**Costo esperado:** Kapso $0 (free tier 2.000 msgs/mes) + Meta ~$0.0008 por template
utility en Colombia ≈ **$1–5 USD/mes**.

---

## Decisiones cerradas (no re-discutir)

- **Número:** chip físico prepago +57 **nuevo y dedicado**. NO se usa el número actual
  del local/domicilios (al migrarlo a la API perdería el WhatsApp del celular con el que
  se chatea a proveedores).
- **El chip se usa una sola vez** para recibir el código de verificación; luego se guarda.
  El número no se abre nunca en un teléfono.
- **Responder a clientes:** desde la **bandeja web de Kapso** (no desde el celular). La
  pueden usar varias personas a la vez. Dentro de la ventana de 24h las respuestas son
  texto libre y gratis.
- **Proveedor abstraído:** todo el sistema solo conoce `WhatsAppProvider`. Cambiar de
  OpenWA a Kapso es un adapter + el factory (sec 4.10 de CLAUDE.md). El `MockWhatsAppAdapter`
  sigue intacto para dev.

---

## Reglas de Meta que aplican (entenderlas antes de codear)

1. **Ventana de 24h (customer service window):** se abre cuando el cliente te escribe.
   Mientras está abierta, podés mandar **texto libre, sin template y gratis**.
2. **Fuera de la ventana** (primer contacto, o pasaron >24h sin que el cliente escriba):
   solo se permite mandar **templates pre-aprobados**. Los de categoría **utility**
   (transaccionales) son baratísimos o gratis.
3. **Quality rating:** Meta vigila la tasa de bloqueos/reportes. Si muchos clientes te
   bloquean, baja el rating (verde→amarillo→rojo) y limita el volumen. Solución: escribir
   solo a quien pidió, mensajes claros y esperados.

### Cómo cae cada mensaje nuestro — diseño robusto

> **Decisión:** los **4 mensajes de salida van por template** (utility). Así llegan
> SIEMPRE, sin depender de si el cliente escribió al número (la ventana de 24h puede no
> estar abierta). Cuesta centavos extra (~$0.0008 los que podrían ir gratis), a cambio
> de que ningún aviso falle. La **bandeja de Kapso** se usa para LEER respuestas/comprobante
> y responder preguntas (texto libre gratis dentro de 24h).

| Mensaje | Disparo | Salida |
|---|---|---|
| `payment_instructions` | Cliente crea pedido web | Template `payment_instructions` |
| `payment_received` | Cajero confirma pago | Template `payment_received` |
| `pickup_ready` | Cajero marca "listo para retirar" (`/sales/:id/mark-ready`) | Template `pickup_ready` |
| `canceled` | Cajero rechaza pedido no pagado | Template `order_canceled` |

→ **Registrar los 4 templates utility.** La ventana de 24h no se usa para la salida
(solo para que el equipo responda preguntas desde la bandeja).

> **Alternativa descartada:** usar texto libre para `payment_received`/`pickup_ready`
> (gratis dentro de ventana). Se descartó porque depende de que el cliente escriba al
> WhatsApp; si sube el comprobante por web o no responde, esos avisos fallarían. Los
> centavos no justifican la fragilidad.

---

## DERROTERO A PRODUCCIÓN

### Paso 0 — Probar todo SIN Meta (Fase A, ya posible hoy)

1. Crear cuenta **free en [kapso.com](https://kapso.com)**.
2. En el dashboard, obtener la **`API key`** y el **`phone number id`** del **número sandbox**.
3. Conectar tu celular al sandbox: agregar tu número → recibís un código de 6 caracteres →
   lo mandás por WhatsApp al número sandbox de Kapso (esto abre la ventana de 24h).
4. En `apps/api/.env.local`:
   ```
   KAPSO_API_KEY=...
   KAPSO_PHONE_NUMBER_ID=...
   # KAPSO_BASE_URL opcional (default https://api.kapso.ai/meta/whatsapp/v24.0)
   ```
5. Levantar la API (`pnpm -F @pos-tercos/api dev`). En el log debe aparecer
   `Using KapsoWhatsAppAdapter`.
6. Crear un pedido web con TU teléfono → deberías recibir las instrucciones de pago reales.
   Seguir el flujo completo (confirmar pago, marcar listo). Como tu celular ya escribió al
   sandbox, todos los mensajes llegan como texto libre.

✅ Acá validás la integración end-to-end **sin tocar Meta ni registrar un solo template**.

---

### Paso 1 — Conseguir el chip físico +57

1. Comprar un **chip prepago** de cualquier operador (Claro/Movistar/Tigo/WOM). Un plan
   mínimo basta — solo necesita poder **recibir un SMS o una llamada** una vez.
2. Ponerlo en cualquier teléfono, **activarlo** y anotar el número (+57XXXXXXXXXX).
3. Verificar que **recibe SMS** (mandate uno de prueba). Importante para el código de Meta.
4. **No lo uses para abrir WhatsApp** en ese teléfono. Si ya tiene WhatsApp personal,
   está bien, pero lo vamos a migrar a la API (perderá el WhatsApp normal — por eso es
   un chip dedicado, no el del local).

---

### Paso 2 — Registrar el número en Kapso (Cloud API)

> Esto crea/conecta el WhatsApp Business Account (WABA) detrás del número. Kapso abstrae
> el "embedded signup" de Meta. Necesitás una cuenta de Facebook Business (gratis); Kapso
> te guía. Para volumen bajo, la verificación de negocio de Meta **no es obligatoria al
> arranque** (negocios sin verificar tienen límite ~250 conversaciones/día, de sobra).

1. En el dashboard de Kapso → **Connect WhatsApp / agregar número** → camino "registrar
   tu propio número".
2. Ingresar el +57 del chip. Kapso (vía Meta) envía un **código de verificación** por
   **SMS o llamada** a ese número.
3. Leer el código en el teléfono con el chip e ingresarlo en Kapso.
4. ✅ El número queda registrado en la API. **Sacá el chip y guardalo** — no se necesita más.
5. Configurar el **perfil del negocio**: nombre visible ("Tercos"), foto, descripción,
   dirección. Esto es lo que ven los clientes.
6. Anotar el **nuevo `phone number id`** (el de producción, distinto al del sandbox).

---

### Paso 3 — Registrar los templates (la única burocracia real)

En Kapso → sección Templates → crear y enviar a aprobación los **4** (categoría **utility**, idioma `es`):

**Template `payment_instructions`** — `1=nombre`, `2=recibo`, `3=negocio`, `4=total`, `5=datos de pago`:
```
Hola {{1}}, recibimos tu pedido #{{2}} en {{3}}. Total: {{4}}.
Para pagar: {{5}}
Cuando pagues, enviános el comprobante por este chat para confirmarlo. ¡Gracias!
```
**Template `payment_received`** — `1=nombre`, `2=recibo`, `3=negocio`:
```
Hola {{1}}, tu pago del pedido #{{2}} fue confirmado. Ya pasó a cocina y te avisamos
cuando esté listo. — {{3}}
```

**Template `pickup_ready`** — `1=nombre`, `2=recibo`, `3=negocio`, `4=dirección`:
```
Hola {{1}}, tu pedido #{{2}} ya está listo para retirar. Te esperamos en {{4}}. — {{3}}
```

**Template `order_canceled`** — `1=nombre`, `2=recibo`, `3=negocio`:
```
Hola {{1}}, lamentablemente tu pedido #{{2}} en {{3}} fue cancelado.
Si creés que es un error o querés volver a pedir, escribinos por este chat.
```

**Template `alerta_negocio`** (5º — alertas internas al DUEÑO: descuadres, anulaciones,
descuentos, digest) — `1=texto de la alerta` (el backend lo aplana a una línea):
```
🔔 {{1}}
```

- ⚠️ Los NOMBRES y el ORDEN de variables de arriba están **cableados en el código**
  (`packages/domain/src/whatsapp/templates.ts` → `WHATSAPP_TEMPLATE_NAMES`). Registrarlos
  EXACTAMENTE así; si Meta obliga a cambiar un nombre, actualizar esa constante.
- Aprobación de utility suele tardar **minutos a pocas horas**.
- Anotar el **language code** aprobado (`es` o `es_CO`) → va en `WHATSAPP_TEMPLATE_LANG`.

---

### Paso 4 — Fase B (templates) en el backend ✅ YA CODEADA (2026-07-05)

> No queda nada de código por escribir. Lo implementado:
>
> - `packages/domain/src/whatsapp/templates.ts` — `buildNotificationTemplate` (4 stages,
>   variables en el orden EXACTO del Paso 3), `buildOwnerAlertTemplate` (`alerta_negocio`),
>   `sanitizeTemplateParam` (Meta rechaza `\n`/tabs en variables → se aplanan a " | ").
>   Con tests (domain 161).
> - Puerto `WhatsAppProvider.sendTemplate?` (opcional — OpenWA no lo implementa y sigue igual).
> - `KapsoWhatsAppAdapter.sendTemplate` (Cloud API `type:'template'`) y Mock con log.
> - `NotificationService` + `OwnerNotificationService`: si `WHATSAPP_TEMPLATES_ENABLED=true`
>   y el provider soporta templates → template; si no → texto libre (sandbox/dev intactos).
>   El texto humano SIEMPRE queda auditado en `whatsapp_messages`.
>
> **Activación = solo la env var** `WHATSAPP_TEMPLATES_ENABLED=true` (+ opcional
> `WHATSAPP_TEMPLATE_LANG=es_CO` si Meta aprobó con ese code; default `es`). Se puede
> togglear sin tocar código.

---

### Paso 5 — Bandeja de entrada (responder al cliente)

- **Inicial (cero código):** usar el **inbox web de Kapso**. Conectado el número, entrás
  a su panel, ves los chats de clientes y respondés desde el navegador. Varias personas a
  la vez. Dentro de 24h, texto libre gratis.
- **Futuro (Fase C, opcional):** integrar los chats dentro del POS vía webhooks de Kapso
  (mensajes entrantes → backend → pantalla de chat junto al pedido). Hay un inbox
  open-source de Kapso de base. NO necesario para arrancar.

---

### Paso 6 — Producción en Railway

1. Setear variables en el servicio API de Railway:
   ```
   KAPSO_API_KEY=<key de producción>
   KAPSO_PHONE_NUMBER_ID=<phone number id de producción>
   WHATSAPP_TEMPLATES_ENABLED=true          # ← recién cuando los 5 templates estén APROBADOS
   WHATSAPP_TEMPLATE_LANG=es                # o es_CO si Meta aprobó con ese code
   ```
2. Confirmar que ya están (de CLAUDE.md sec 14 / deploy.md):
   `BUSINESS_NAME`, `BUSINESS_ADDRESS_SHORT`, `PAYMENT_INSTRUCTIONS_NEQUI`,
   `PAYMENT_INSTRUCTIONS_TRANSFER`.
3. **Quitar/dejar** las `OPENWA_*`: el factory prefiere Kapso, así que con las `KAPSO_*`
   presentes ya ignora OpenWA. Recomendado **borrar las `OPENWA_*`** para evitar confusión.
4. Redeploy. Verificar en logs: `Using KapsoWhatsAppAdapter (KAPSO_* detected)`.

---

### Paso 7 — Smoke test en producción

1. Hacer un pedido web real con un teléfono de prueba.
2. Confirmar que llega `payment_instructions` (vía template).
3. Responder con un "comprobante" desde el teléfono → abre la ventana (se ve en la bandeja).
4. Confirmar pago en el POS → llega `payment_received` (vía template).
5. "Marcar listo" en el POS (modal Pedidos web) → llega `pickup_ready` (vía template).
6. Probar un rechazo → llega `order_canceled` (vía template).
7. Forzar una alerta al dueño (ej. anular una venta) → llega `alerta_negocio` al
   `OWNER_WHATSAPP_PHONE`.
8. Verificar en la tabla `whatsapp_messages` que cada envío quedó con `status='sent'`.
9. Verificar que las respuestas del cliente aparecen en la bandeja de Kapso.

---

### Paso 8 — Higiene operativa (mantener el número sano)

- ✅ Escribir **solo a clientes que pidieron** (consentimiento). Nunca listas frías.
- ✅ Mantener los templates en categoría **utility** (no marketing desde este número).
- ✅ Monitorear el **quality rating** en el dashboard de Kapso. Si baja a amarillo,
  revisar mensajes/frecuencia.
- ✅ Mensajes claros y esperados → menos bloqueos → rating verde → sin límites.
- ❌ Nada de promociones masivas desde este número (si en el futuro se quiere marketing,
  evaluar número/categoría aparte).

---

## Costos esperados

- **Kapso:** free tier (2.000 msgs/mes, 1 número) alcanza para el volumen actual.
- **Meta:** mensajes dentro de la ventana de 24h = **gratis**. Templates utility = centavos
  o gratis. Estimado total: **~$0–5 USD/mes** para volumen de un local.
- **Chip:** plan prepago mínimo, una vez (se guarda tras el registro).

---

## Resumen para retomar en frío

**TODO EL CÓDIGO YA ESTÁ (Fases A y B).** Lo que falta es 100% operativo y gira alrededor
del número de teléfono:

1. **Hoy, sin nada:** probar con sandbox (Paso 0) — solo cuenta free de Kapso + 2 env vars.
2. **Para prod:** chip +57 (Paso 1) → registrar el número en Kapso (Paso 2) → registrar los
   **5 templates** utility con los nombres EXACTOS (Paso 3) → env vars en Railway
   (`KAPSO_API_KEY`, `KAPSO_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATES_ENABLED=true`,
   `WHATSAPP_TEMPLATE_LANG`) y borrar las `OPENWA_*` (Paso 6) → smoke (Paso 7).
3. Responder clientes desde la **bandeja web de Kapso**, no desde un celular.
4. Cero baneo por automatización (es Cloud API oficial); cuidar solo el quality rating.
