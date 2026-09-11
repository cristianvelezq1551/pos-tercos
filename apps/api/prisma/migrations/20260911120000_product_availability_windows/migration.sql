-- Ventanas de disponibilidad por producto ("solo los miércoles").
-- PURAMENTE ADITIVA: crea una tabla nueva y no toca ninguna fila existente.
-- Sin filas para un producto = se vende siempre, que es el comportamiento
-- actual de todo el catálogo. Nada cambia hasta que alguien cree una ventana.
CREATE TABLE "product_availability_windows" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "days_of_week_mask" INTEGER NOT NULL,
    "time_start" TEXT,
    "time_end" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "product_availability_windows_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "product_availability_windows_product_id_idx"
    ON "product_availability_windows"("product_id");

ALTER TABLE "product_availability_windows"
    ADD CONSTRAINT "product_availability_windows_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Una máscara fuera de rango dejaría una ventana que no cubre ningún día (o
-- días inexistentes): el producto quedaría invendible sin decir por qué.
ALTER TABLE "product_availability_windows"
    ADD CONSTRAINT "chk_paw_days_mask" CHECK ("days_of_week_mask" BETWEEN 1 AND 127);

-- Las dos horas o ninguna: una sola no define una franja.
ALTER TABLE "product_availability_windows"
    ADD CONSTRAINT "chk_paw_times_pair"
    CHECK (("time_start" IS NULL) = ("time_end" IS NULL));

-- Formato HH:MM:SS en 24h, e inicio distinto de fin (una franja vacía haría
-- el producto invendible para siempre).
ALTER TABLE "product_availability_windows"
    ADD CONSTRAINT "chk_paw_times_format" CHECK (
        "time_start" IS NULL OR (
            "time_start" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$'
            AND "time_end" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$'
            AND "time_start" <> "time_end"
        )
    );
