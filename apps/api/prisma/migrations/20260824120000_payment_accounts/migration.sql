-- A dónde paga el cliente (Nequi, cuenta bancaria). Vivía en las env vars
-- PAYMENT_INSTRUCTIONS_NEQUI/TRANSFER: cambiar de cuenta exigía entrar a
-- Railway y reiniciar el servicio. Forma: [{label, value, note}] — el número
-- va separado de su rótulo porque en el mensaje se imprime solo en su línea,
-- para que el cliente lo copie de un toque.
ALTER TABLE "business_config"
  ADD COLUMN "payment_accounts" JSONB NOT NULL DEFAULT '[]';
