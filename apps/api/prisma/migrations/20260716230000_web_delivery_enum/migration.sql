-- Delivery web (2026-07-16): el dueño reactiva los domicilios, que la
-- reorientación v2 había eliminado (junto con Mapbox, apps/repa y los estados
-- de reparto). Acá vuelve SOLO el tipo de venta; el reparto no se modela: el
-- pedido va a la dirección del cliente y listo.
--
-- El ADD VALUE va SOLO en esta migración: Postgres no permite usar un valor de
-- enum en la misma transacción en que se crea, y Prisma corre cada archivo en
-- una. Las columnas que lo referencian van en la migración siguiente.
ALTER TYPE "SaleType" ADD VALUE 'WEB_DELIVERY';
