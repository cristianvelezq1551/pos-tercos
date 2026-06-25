-- Acuse del cajero: una cortesía "Observada" (rechazada) avisa hasta que el
-- cajero la marca como vista.
ALTER TABLE "cortesia_requests"
  ADD COLUMN "seen_by_requester" BOOLEAN NOT NULL DEFAULT false;
