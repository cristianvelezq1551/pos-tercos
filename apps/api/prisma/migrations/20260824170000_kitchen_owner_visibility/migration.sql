-- Visibilidad de cocina para el dueño (Fase 1: cimientos).
--
-- 1. `checklist_marks`: una fila por tarea marcada en un día, con su autor.
--    Antes solo existía `checklist_completions`, que exige la rutina COMPLETA y
--    guarda un único autor → un día a medias no dejaba rastro y no se podía
--    saber quién marcó qué. Los días previos se siguen leyendo desde
--    `checklist_completions.done_item_ids` (sin autor por tarea).
-- 2. `kitchen_incidents.evidence_key`: foto opcional de la incidencia.
-- 3. Índice por trabajador en movimientos: filtrar producción/merma por persona
--    sin escanear la tabla completa.

CREATE TABLE "checklist_marks" (
    "id" TEXT NOT NULL,
    "type" "ChecklistType" NOT NULL,
    "day" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "done_by_id" TEXT NOT NULL,
    "done_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checklist_marks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "checklist_marks_type_day_item_id_key" ON "checklist_marks"("type", "day", "item_id");

CREATE INDEX "checklist_marks_day_type_idx" ON "checklist_marks"("day", "type");

ALTER TABLE "checklist_marks" ADD CONSTRAINT "checklist_marks_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "checklist_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "kitchen_incidents" ADD COLUMN "evidence_key" TEXT;

CREATE INDEX "inventory_movements_user_id_created_at_idx" ON "inventory_movements"("user_id", "created_at" DESC);
