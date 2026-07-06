-- Detector de multi-instancia: el sistema asume 1 réplica (throttle in-memory,
-- rooms de WS). Cada instancia registra un heartbeat; un cron cuenta las vivas
-- y alerta al dueño si hay más de una sostenida (autoscale activado por error).
CREATE TABLE "app_instances" (
    "id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_instances_pkey" PRIMARY KEY ("id")
);
