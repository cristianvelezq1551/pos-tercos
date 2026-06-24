-- BusinessConfig: fila única con el día de corte del "mes del negocio".
CREATE TABLE "business_config" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "month_start_day" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "business_config_pkey" PRIMARY KEY ("id")
);

-- Semilla de la fila única (mes calendario por defecto).
INSERT INTO "business_config" ("id", "month_start_day") VALUES ('singleton', 1);
