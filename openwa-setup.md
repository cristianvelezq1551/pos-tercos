# WhatsApp con OpenWA — Setup

> WS-2. El backend de Tercos envía notificaciones WhatsApp al cliente
> **automáticamente** vía [OpenWA](https://github.com/rmyndharis/OpenWA)
> (gateway self-hosted, $0/mes). Reemplaza el esquema wa.me manual.

## Cómo funciona

En 3 transiciones de un pedido **WEB_PICKUP** el backend envía un mensaje:

| Disparador | Endpoint / hook | Mensaje al cliente |
|---|---|---|
| Cajero presiona **"Aceptar"** en el drawer del POS | `POST /sales/:id/accept` | Instrucciones de pago (Nequi/transferencia) + pedir comprobante |
| Cajero **confirma el pago** | hook en `POST /sales/:id/confirm-payment` | "Pago confirmado ✅, ya está en cocina" |
| Cocina marca **listo** | hook en `POST /kds/orders/:id/ready` | "Listo para retirar en {dirección}" |

- Idempotente: cada envío setea un flag `notified_*` en `sales`; no se reenvía.
- Cada envío se registra en la tabla `whatsapp_messages` (status `sent`/`failed`).
- **Nunca bloquea la transición**: si OpenWA falla, la venta avanza igual y el fallo queda logueado.
- COUNTER y pedidos sin teléfono no notifican.

## Adapter (dev vs prod)

`apps/api/src/adapters/whatsapp/` — selección lazy igual que storage/printer:

- **Sin env vars** → `MockWhatsAppAdapter`: no envía nada, loggea el mensaje. **Default en dev.**
- **Con `OPENWA_URL` + `OPENWA_API_KEY` + `OPENWA_SESSION_ID`** → `OpenWaWhatsAppAdapter` (envío real).

## Variables de entorno (`apps/api/.env`)

```bash
# OpenWA (omitir las 3 → usa mock, no envía nada)
OPENWA_URL=http://localhost:2785
OPENWA_API_KEY=<contenido de data/.api-key del OpenWA>
OPENWA_SESSION_ID=<id de la sesión creada en OpenWA>

# Texto de pago que va en el mensaje de instrucciones (una o ambas)
PAYMENT_INSTRUCTIONS_NEQUI=Nequi: 300 123 4567 (a nombre de Tercos)
PAYMENT_INSTRUCTIONS_TRANSFER=Bancolombia ahorros 123-456789-00

# Branding del mensaje
BUSINESS_NAME=Tercos
BUSINESS_ADDRESS_SHORT=Cra 43A # 11-12, Medellín
```

## Pasos para levantar OpenWA

1. **Clonar y arrancar** (ver README OPENWA.md para detalle):
   ```bash
   git clone https://github.com/rmyndharis/OpenWA.git && cd OpenWA
   docker compose up -d        # API en :2785, dashboard en :2886
   ```
2. **Copiar la API key**: se genera en `data/.api-key` al primer arranque → `OPENWA_API_KEY`.
3. **Crear la sesión**:
   ```bash
   curl -X POST http://localhost:2785/api/sessions \
     -H "X-API-Key: $OPENWA_API_KEY" -H "Content-Type: application/json" \
     -d '{"name": "tercos"}'
   ```
   El `id` que devuelve → `OPENWA_SESSION_ID`.
4. **Iniciar + escanear QR** con el WhatsApp **del negocio** (no el personal):
   ```bash
   curl -X POST http://localhost:2785/api/sessions/<id>/start -H "X-API-Key: $OPENWA_API_KEY"
   curl http://localhost:2785/api/sessions/<id>/qr -H "X-API-Key: $OPENWA_API_KEY"
   ```
   (El dashboard en `:2886` muestra el QR de forma más cómoda.)
5. **Verificar conectado**: `GET /api/sessions/<id>` debe dar `status: CONNECTED`.
6. **Setear las env vars** en `apps/api/.env` y reiniciar la API. El log debe decir
   `Using OpenWaWhatsAppAdapter (OPENWA_* detected)`.

## Notas de producción

- OpenWA corre como servicio aparte (Docker). En prod, desplegarlo junto al backend
  (misma red) y apuntar `OPENWA_URL` a su host interno.
- La sesión de WhatsApp es persistente (`data/sessions`); sobrevive reinicios mientras
  el volumen Docker se conserve. Si se desconecta, re-escanear el QR.
- El número del negocio debe ser una línea dedicada (no la personal del dueño).
