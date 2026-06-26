-- CreateEnum
CREATE TYPE "HeroMediaType" AS ENUM ('IMAGE', 'VIDEO');

-- CreateTable
CREATE TABLE "web_hero_slides" (
    "id" TEXT NOT NULL,
    "media_type" "HeroMediaType" NOT NULL DEFAULT 'IMAGE',
    "media_key" TEXT NOT NULL,
    "media_mime" TEXT NOT NULL,
    "link_url" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web_hero_slides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "web_hero_slides_is_active_sort_order_idx" ON "web_hero_slides"("is_active", "sort_order");
