-- Canal de la promoción: caja (POS), web pública, o ambos (default).
CREATE TYPE "PromotionChannel" AS ENUM ('BOTH', 'POS', 'WEB');

ALTER TABLE "promotions"
  ADD COLUMN "channel" "PromotionChannel" NOT NULL DEFAULT 'BOTH';
