-- Turno asignado al pagar (no al crear): turn_number pasa a nullable.
ALTER TABLE "sales" ALTER COLUMN "turn_number" DROP NOT NULL;

-- Cola de turnos: ready_at (cocina marca listo) + called_at (cajero llama).
ALTER TABLE "sales" ADD COLUMN "ready_at" TIMESTAMP(3);
ALTER TABLE "sales" ADD COLUMN "called_at" TIMESTAMP(3);

-- Índice para la cola de "listos por llamar".
CREATE INDEX "sales_status_ready_at_idx" ON "sales"("status", "ready_at");
