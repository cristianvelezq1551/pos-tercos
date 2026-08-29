-- Distinguir un GASTO de un movimiento financiero en los compromisos por pagar.
--
-- Hasta acá los compromisos no llegaban al estado de resultados en NINGÚN caso
-- (`FinancialReportsService` solo leía COGS, nómina y costos fijos): un arreglo
-- del horno salía de tesorería pero no bajaba el neto ni movía el punto de
-- equilibrio. Al conectarlos hace falta la distinción, porque devolver un
-- préstamo NO es una pérdida —esa plata ya se había recibido— y contarlo como
-- gasto mostraría un bajón inventado.
--
-- Default true: el caso común (arreglo, servicio, compra suelta) es gasto, y
-- los compromisos históricos entran como tales, que es lo correcto para ellos.
ALTER TABLE "payable_commitments"
  ADD COLUMN "is_expense" BOOLEAN NOT NULL DEFAULT true;
