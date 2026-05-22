# Probar el backend sin abrir las apps

Cómo verificar el flujo de **venta web + notificaciones WhatsApp** usando solo la
API + `curl`, sin levantar admin / POS / KDS. Útil para smoke tests rápidos.

## Requisitos

```bash
# Postgres (si no está corriendo)
docker compose up -d postgres
# Migraciones + seed (si la DB está vacía)
cd apps/api && pnpm prisma migrate deploy && pnpm prisma db seed && cd ../..
```

## 1. Levantar solo la API

```bash
pnpm -F @pos-tercos/api dev        # queda en :3001
curl -s http://localhost:3001/healthz   # → {"status":"ok",...,"checks":{"db":"ok"}}
```

En el log de arranque verás qué adapter de WhatsApp usa:
- `Using MockWhatsAppAdapter` → **no envía nada, solo loggea** (default en dev).
- `Using OpenWaWhatsAppAdapter` → envío real (ver §4).

## 2. Correr el flujo completo (copiá y pegá)

Simula lo que harían el cajero y la cocina. Cada paso dispara la notificación de
su etapa. Cambiá `CUSTOMER_PHONE` por el número que quieras (formato `+57...`).

```bash
cd /Users/cristianvelez/Documents/TERCOS
API=http://localhost:3001
CUSTOMER_PHONE="+573001234567"
P() { python3 -c "import sys,json;print(json.load(sys.stdin)$1)" 2>/dev/null; }

TOKEN=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"dueno@dev.local","password":"dev12345"}' | P "['accessToken']")
AUTH="Authorization: Bearer $TOKEN"

PID=$(curl -s -X POST $API/products -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"name":"Combo Prueba","basePrice":22000,"category":"Test"}' | P "['id']")

# turno (409 = ya hay uno abierto, está bien)
curl -s -X POST $API/shifts/open -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"openingCash":100000}' -o /dev/null -w "turno HTTP %{http_code}\n"

# Crear el pedido web YA dispara la notificación de instrucciones de pago (📲)
curl -s -X POST $API/web/orders -H 'Content-Type: application/json' \
  -d "{\"type\":\"WEB_PICKUP\",\"items\":[{\"productId\":\"$PID\",\"quantity\":1}],\"customerName\":\"Cristian\",\"customerPhone\":\"$CUSTOMER_PHONE\"}" \
  -o /tmp/order.json    # 📲 instrucciones de pago (automático al crear)
SID=$(python3 -c "import json;print(json.load(open('/tmp/order.json'))['order']['id'])")
TOTAL=$(python3 -c "import json;print(json.load(open('/tmp/order.json'))['order']['total'])")
echo "pedido $SID · total $TOTAL"

# El cajero confirma el pago cuando valida el comprobante (única acción suya)
curl -s -X POST $API/sales/$SID/confirm-payment -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"method\":\"CASH\",\"amountReceived\":$TOTAL}" -o /dev/null -w "  confirmar → HTTP %{http_code}\n"  # 📲 pago recibido
curl -s -X POST $API/kds/orders/$SID/start -H "$AUTH" -o /dev/null -w "  cocina inicia → HTTP %{http_code}\n"
curl -s -X POST $API/kds/orders/$SID/ready -H "$AUTH" -o /dev/null -w "  marcar listo → HTTP %{http_code}\n"  # 📲 listo para retirar
```

## 3. Ver las notificaciones

```bash
# tabla de auditoría (sent / failed por etapa)
docker exec pos-tercos-postgres psql -U pos -d pos_tercos_dev -c \
  "SELECT stage,status,to_phone,left(body,55) FROM whatsapp_messages ORDER BY created_at DESC LIMIT 6;"
```

En modo Mock, además, el texto completo aparece en el log de la API como
`[MOCK WhatsApp → +57...] ...`.

## 4. (Opcional) Envío REAL con OpenWA

> ⚠️ OpenWA usa WhatsApp **no-oficial** (whatsapp-web.js). Riesgo bajo de
> suspensión: usá la **línea del negocio**, no la personal, y evitá volumen tipo spam.

```bash
# 4.1 Levantar OpenWA (vive en ~/Documents/OpenWA)
cd ~/Documents/OpenWA && docker compose up -d openwa-api
docker exec openwa-api cat /app/data/.api-key          # → OPENWA_API_KEY

# 4.2 Crear sesión + iniciar
KEY=<api-key>; API=http://localhost:2785
SID=$(curl -s -X POST $API/api/sessions -H "X-API-Key: $KEY" -H 'Content-Type: application/json' \
  -d '{"name":"tercos"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
curl -s -X POST $API/api/sessions/$SID/start -H "X-API-Key: $KEY" >/dev/null

# 4.3 Esperar status qr_ready y abrir el QR (escanear con WhatsApp del negocio →
#     Ajustes → Dispositivos vinculados → Vincular un dispositivo)
curl -s $API/api/sessions/$SID/qr -H "X-API-Key: $KEY" | python3 -c \
  "import sys,json,base64,re;d=json.load(sys.stdin);m=re.sub(r'^data:image/\w+;base64,','',d['qrCode']);open('/tmp/qr.png','wb').write(base64.b64decode(m))"
open /tmp/qr.png

# 4.4 Verificar conectado → status "ready" + phone poblado
curl -s $API/api/sessions/$SID -H "X-API-Key: $KEY" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['status'],d.get('phone'))"
```

Activar en la API de Tercos — en `apps/api/.env` (descomentar/poner):

```bash
OPENWA_URL=http://localhost:2785
OPENWA_API_KEY=<api-key>
OPENWA_SESSION_ID=<SID>
# y para que el mensaje de pago se vea claro:
PAYMENT_INSTRUCTIONS_NEQUI=Nequi: 3046706847
PAYMENT_INSTRUCTIONS_TRANSFER=Bancolombia ahorros 12345678 a nombre de Tercos
```

Reiniciar la API (Ctrl-C + `pnpm -F @pos-tercos/api dev`). El log debe decir
`Using OpenWaWhatsAppAdapter`. Corré el flujo de §2 con un `CUSTOMER_PHONE` real
→ llegan los 3 mensajes.

## 5. Bajar todo

```bash
# API: Ctrl-C en su terminal
cd ~/Documents/OpenWA && docker compose down   # conserva la sesión vinculada (volumen)
# volver a Mock en dev: comentar las OPENWA_* en apps/api/.env
sed -i '' 's/^OPENWA_/# OPENWA_/' apps/api/.env
```

## Notas

- **Mock** = no envía (default dev, ideal para probar lógica). **Real** = OpenWA.
- El envío de WhatsApp **nunca bloquea la venta**: si OpenWA está caído, el pedido
  avanza igual y el fallo queda registrado en `whatsapp_messages` (status `failed`).
- Idempotente: re-disparar la misma etapa no reenvía (flags `notified_*` en `sales`).

## Tests automatizados (e2e)

Tests de integración del flujo del dinero (sales / shifts / invoices) contra una
DB de test separada (nunca tocan `pos_tercos_dev`):

```bash
# crear la DB de test (una vez)
docker exec pos-tercos-postgres createdb -U pos pos_tercos_test
# aplicar el schema a la test DB (PASS está en apps/api/.env → DATABASE_URL)
cd apps/api
DATABASE_URL="postgresql://pos:<PASS>@localhost:5432/pos_tercos_test?schema=public" pnpm prisma migrate deploy
# correr (25 tests)
DATABASE_URL="postgresql://pos:<PASS>@localhost:5432/pos_tercos_test?schema=public" pnpm test:e2e
```

Cada test trunca la test DB antes de correr (repetibles). Cubren: crear venta
COUNTER + idempotencia + confirmar pago, cierre de turno con descuadre, y
confirmar factura (movimientos PURCHASE + lastUnitCost).
