-- Emoji representativo por producto (🍔🍟🥤). Alternativa ligera a la foto:
-- se muestra en el menú web cuando no hay imagen. NULL = sin emoji.
ALTER TABLE "products" ADD COLUMN "emoji" TEXT;
