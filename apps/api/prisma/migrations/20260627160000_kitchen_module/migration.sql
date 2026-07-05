-- CreateEnum
CREATE TYPE "KitchenIncidentCategory" AS ENUM ('INSUMO', 'EQUIPO', 'PRODUCCION', 'OTRO');

-- CreateEnum
CREATE TYPE "ChecklistType" AS ENUM ('OPEN', 'CLOSE');

-- CreateTable
CREATE TABLE "kitchen_incidents" (
    "id" TEXT NOT NULL,
    "category" "KitchenIncidentCategory" NOT NULL,
    "note" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "resolved_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kitchen_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_items" (
    "id" TEXT NOT NULL,
    "type" "ChecklistType" NOT NULL,
    "label" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_completions" (
    "id" TEXT NOT NULL,
    "type" "ChecklistType" NOT NULL,
    "day" TEXT NOT NULL,
    "done_item_ids" TEXT[],
    "completed_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checklist_completions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kitchen_incidents_created_at_idx" ON "kitchen_incidents"("created_at" DESC);

-- CreateIndex
CREATE INDEX "kitchen_incidents_resolved_at_idx" ON "kitchen_incidents"("resolved_at");

-- CreateIndex
CREATE INDEX "checklist_items_type_is_active_sort_order_idx" ON "checklist_items"("type", "is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "checklist_completions_type_day_key" ON "checklist_completions"("type", "day");
