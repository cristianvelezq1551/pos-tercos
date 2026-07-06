-- Retención de audit_log (informe de calidad B2): la tabla crece ~1.2M
-- filas/año sin freno y llena el disco de Railway a 18-24 meses. La
-- inmutabilidad se CONSERVA para la ventana operativa: UPDATE prohibido
-- siempre; DELETE permitido SOLO para filas de más de 24 meses (purga de
-- retención). inventory_movements y sale_status_log NO cambian (siguen con
-- reject_update_delete estricto: son la fuente del FIFO y de reportes).
CREATE OR REPLACE FUNCTION audit_log_immutable_with_retention()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.created_at < now() - interval '24 months' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Table % is insert-only; UPDATE/DELETE rejected (retención: DELETE solo >24 meses)', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_insert_only ON "audit_log";
CREATE TRIGGER audit_log_insert_only
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable_with_retention();
