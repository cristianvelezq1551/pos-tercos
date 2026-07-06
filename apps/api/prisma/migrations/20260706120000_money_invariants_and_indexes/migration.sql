-- Invariantes de PLATA a nivel DB (informe de calidad A4) + índice A5.
-- Hasta ahora vivían solo en el código: un path alterno (script, backfill,
-- bug) podía corromperlas en silencio y contaminar caja/Z-report/reconciliación.

-- ============================================================
-- 1. Σ sale_payments.amount == sales.total (en ventas COBRADAS)
-- ============================================================
-- Constraint trigger DIFERIDO: valida al COMMIT, así el cobro puede insertar
-- las N partes + setear paid_at dentro de la misma transacción en cualquier
-- orden. Solo exige cuadre cuando la venta ya tiene paid_at (las pendientes /
-- canceladas sin cobrar no tienen pagos).
CREATE OR REPLACE FUNCTION assert_sale_payments_match()
RETURNS trigger AS $$
DECLARE
  v_sale_id TEXT;
  v_total NUMERIC;
  v_paid_at TIMESTAMP;
  v_paid NUMERIC;
BEGIN
  IF TG_TABLE_NAME = 'sales' THEN
    v_sale_id := NEW.id;
  ELSE
    v_sale_id := COALESCE(NEW.sale_id, OLD.sale_id);
  END IF;
  SELECT total, paid_at INTO v_total, v_paid_at FROM sales WHERE id = v_sale_id;
  IF v_paid_at IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT COALESCE(SUM(amount), 0) INTO v_paid FROM sale_payments WHERE sale_id = v_sale_id;
  IF ABS(v_paid - v_total) > 0.01 THEN
    RAISE EXCEPTION 'sale %: la suma de pagos (%) no cuadra con el total (%)',
      v_sale_id, v_paid, v_total;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_sale_payments_match
  AFTER INSERT OR UPDATE OR DELETE ON sale_payments
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_sale_payments_match();

-- También al tocar el total o cobrar la venta (editItems ajusta ambos lados
-- en la misma tx → el diferido valida el estado final).
CREATE CONSTRAINT TRIGGER trg_sale_total_matches_payments
  AFTER UPDATE OF total, paid_at ON sales
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_sale_payments_match();

-- ============================================================
-- 2. Una sola caja OPEN en el negocio (caja única)
-- ============================================================
-- Antes solo lo garantizaba el advisory lock aplicativo; una carrera o un
-- write directo podían bifurcar la contabilidad del día en dos cajas.
CREATE UNIQUE INDEX "uniq_shift_open_singleton"
  ON "shifts" ((true)) WHERE "status" = 'OPEN';

-- ============================================================
-- 3. El descuento no puede exceder el subtotal
-- ============================================================
-- NOT VALID: protege escrituras nuevas sin re-validar filas legacy (mismo
-- criterio que los CHECKs financieros de 20260626120000).
ALTER TABLE "sales" ADD CONSTRAINT "sales_discount_le_subtotal"
  CHECK ("discount_total" <= "subtotal") NOT VALID;
ALTER TABLE "sales" ADD CONSTRAINT "sales_order_discount_le_subtotal"
  CHECK ("order_discount_amount" <= "subtotal") NOT VALID;

-- ============================================================
-- 4. Índice para los reversos/lecturas por origen (A5)
-- ============================================================
-- void/edición/cortesía/producción filtran por (source_type, source_id) —
-- sin esto era seq scan de la tabla entera, algunos dentro de tx SERIALIZABLE.
CREATE INDEX "inventory_movements_source_type_source_id_idx"
  ON "inventory_movements" ("source_type", "source_id");
