-- Evidencia de producción de cocina (#6): foto que sube el cocinero al registrar
-- una tanda. Se guarda el storage key en el movement +N (delta>0, PRODUCTION).
ALTER TABLE "inventory_movements" ADD COLUMN "evidence_key" TEXT;
