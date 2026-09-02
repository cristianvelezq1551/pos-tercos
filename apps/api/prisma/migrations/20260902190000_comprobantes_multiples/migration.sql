-- Un pago puede necesitar MÁS DE UN comprobante: una transferencia partida en
-- dos, el soporte del banco más la foto del recibo, la consignación y el
-- extracto. Hasta hoy solo cabía una imagen por pago y la segunda se perdía.
--
-- La columna nueva guarda las imágenes ADICIONALES. La vieja se conserva
-- intacta como la PRIMERA de la lista, así que todo lo que ya la lee
-- (`hasProof`, el endpoint del comprobante, tesorería, reportes) sigue
-- funcionando exactamente igual. La lista completa es
-- [proof_image_key, ...proof_extra_keys].
--
-- Puramente aditiva: no reescribe una sola fila y el default deja el
-- comportamiento como estaba hasta que alguien suba una segunda imagen.

ALTER TABLE "invoices"
  ADD COLUMN "payment_proof_extra_keys" TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE "fixed_cost_payments"
  ADD COLUMN "proof_extra_keys" TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE "payable_commitments"
  ADD COLUMN "proof_extra_keys" TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE "payroll_week_payments"
  ADD COLUMN "proof_extra_keys" TEXT[] NOT NULL DEFAULT '{}';
