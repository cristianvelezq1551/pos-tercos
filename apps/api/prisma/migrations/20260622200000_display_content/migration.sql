-- Turnero configurable: el dueño administra slides (productos/fotos/precios)
-- y tracks de música, antes hardcodeados en el frontend.

CREATE TABLE "display_slides" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "price" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "image_key" TEXT NOT NULL,
    "image_mime" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "display_slides_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "display_slides_is_active_sort_order_idx" ON "display_slides"("is_active", "sort_order");

CREATE TABLE "display_tracks" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "audio_key" TEXT NOT NULL,
    "audio_mime" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "display_tracks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "display_tracks_is_active_sort_order_idx" ON "display_tracks"("is_active", "sort_order");
