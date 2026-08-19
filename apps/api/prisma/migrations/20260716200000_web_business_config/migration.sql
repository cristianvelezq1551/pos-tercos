-- Config de la web del cliente editable desde el admin (2026-07-16).
-- Contacto, horarios, redes y "Nosotros" dejan de estar hardcodeados en
-- apps/web o en variables de entorno de Vercel: pasan a la fila singleton y
-- salen por `GET /web-hero/config`. El dueño los cambia sin redeploy.

ALTER TABLE "business_config"
  ADD COLUMN "phone" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "phone_display" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "address" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "maps_url" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "coords" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "hours" JSONB NOT NULL DEFAULT '{}',
  -- Default FALSE a propósito: prenderlo tiene que ser un acto deliberado del
  -- dueño. Con TRUE por default, un horario mal cargado empezaría a rechazar
  -- pedidos reales apenas se despliega.
  ADD COLUMN "orders_respect_schedule" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "instagram_url" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "tiktok_url" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "about_headline" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "about_story" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "about_values" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "about_image_key" TEXT,
  ADD COLUMN "about_image_mime" TEXT;

-- Siembra con lo que HOY está hardcodeado en apps/web, para que la web no
-- arranque en blanco tras el deploy. `ON CONFLICT DO UPDATE` toca solo las
-- columnas nuevas: `month_start_day` y `web_orders_enabled` quedan intactos.
INSERT INTO "business_config" (
  "id", "phone", "phone_display", "address", "maps_url", "coords",
  "hours", "about_headline", "about_story", "about_values"
) VALUES (
  'singleton',
  '+573207615261',
  '+57 320 761 5261',
  'Cra 31 #37s-49, Envigado, Antioquia',
  'https://maps.app.goo.gl/DEy1vMfKJFvG3DrG7',
  '6.1658173,-75.580882',
  -- Cerrado los lunes, 5 pm a 11 pm el resto. `restDayHolidayShift`: si el
  -- lunes cae festivo se trabaja y el descanso se corre al martes.
  '{"weekly":{"sun":[{"start":"17:00","end":"23:00"}],"mon":[],"tue":[{"start":"17:00","end":"23:00"}],"wed":[{"start":"17:00","end":"23:00"}],"thu":[{"start":"17:00","end":"23:00"}],"fri":[{"start":"17:00","end":"23:00"}],"sat":[{"start":"17:00","end":"23:00"}]},"overrides":[],"restDayHolidayShift":true}'::jsonb,
  'Nacimos tercos.',
  'En 2026 nació Tercos con una idea clara: traer una propuesta diferente a la ciudad y salirnos de lo tradicional. Desde el principio decidimos hacer las cosas a nuestra manera, creando sabores y combinaciones que se sienten nuevas, auténticas y con personalidad propia. Cada plato que sale de nuestra cocina está hecho con ingredientes frescos, fuego real y la terquedad de no conformarnos con lo común.',
  '[{"title":"Fuego Real","description":"Creamos combinaciones intensas y diferentes que hacen que cada plato se salga de lo común."},{"title":"Ingredientes Frescos","description":"Trabajamos con ingredientes frescos y selección local para que cada bocado tenga calidad de verdad."},{"title":"Hecho con Actitud","description":"Cada plato refleja nuestra esencia: hacer comida auténtica, diferente y con personalidad propia."}]'::jsonb
)
ON CONFLICT ("id") DO UPDATE SET
  "phone" = EXCLUDED."phone",
  "phone_display" = EXCLUDED."phone_display",
  "address" = EXCLUDED."address",
  "maps_url" = EXCLUDED."maps_url",
  "coords" = EXCLUDED."coords",
  "hours" = EXCLUDED."hours",
  "about_headline" = EXCLUDED."about_headline",
  "about_story" = EXCLUDED."about_story",
  "about_values" = EXCLUDED."about_values";
