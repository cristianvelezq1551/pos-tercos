# Recorrido automático de la checklist de QA

Dos baterías que ejecutan parte de `CHECKLIST-QA-DESPLIEGUE.md` sola, contra un
entorno **dedicado** para no ensuciar el de desarrollo:

| Batería | Qué prueba | Checks |
|---|---|---:|
| `apps/api/qa/checklist-automatica.mjs` | reglas de negocio por la **API** | 77 |
| `apps/admin/e2e-qa/checklist-ui.spec.ts` | los flujos por la **pantalla** | 30 |

## Levantar el entorno

```bash
# 1. Base limpia (OJO: terminar las conexiones primero, si no el DROP falla en silencio)
docker exec pos-tercos-postgres psql -U pos -d postgres \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='pos_qa'" \
  -c "DROP DATABASE IF EXISTS pos_qa" -c "CREATE DATABASE pos_qa"

export QA_DB="postgresql://pos:pos_dev@localhost:5432/pos_qa?schema=public"
cd apps/api
DATABASE_URL=$QA_DB pnpm prisma migrate deploy
DATABASE_URL=$QA_DB pnpm dlx tsx prisma/seed.ts

# 2. API + las tres apps de usuario, en puertos que no chocan con los de dev
DATABASE_URL=$QA_DB PORT=3011 pnpm dev                                    # API   :3011
cd ../admin  && API_INTERNAL_URL=http://localhost:3011 \
               NEXT_PUBLIC_API_WS_URL=http://localhost:3011 npx next dev -p 3104   # Caja  :3104
cd ../web    && API_INTERNAL_URL=http://localhost:3011 npx next dev -p 3100        # Web   :3100
cd ../cocina && API_INTERNAL_URL=http://localhost:3011 npx next dev -p 3106        # Cocina:3106
```

## Correr

```bash
node apps/api/qa/checklist-automatica.mjs                                   # API
cd apps/admin && pnpm exec playwright test --config e2e-qa/playwright.config.ts   # pantalla
```

## Dos trampas que cuestan tiempo

**Arrancá de una base recién sembrada.** Si la reusás, la caja del día ya quedó
cerrada por la corrida anterior y fallan ~20 checks en cascada por algo que no
tiene nada que ver con el código.

**El `DROP DATABASE` falla si hay conexiones abiertas** y, si redirigís la
salida a `/dev/null`, el error no se ve: la corrida siguiente usa la base sucia
y uno se pasa un rato buscando un bug que no existe. De ahí el
`pg_terminate_backend` de arriba.

## Lo que NO cubren

Está listado en la checklist como `[ ]`: impresora y cajón, la IA de facturas,
WhatsApp, el modo sin conexión con la red real, y todo lo que es criterio
humano — que se entienda, que se lea, que sirva para quien opera la caja.
