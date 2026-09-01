-- Dos items ACTIVOS con el mismo nombre son indistinguibles en la caja (dos
-- fichas idénticas), parten un producto en dos filas del reporte y desvían el
-- emparejamiento de facturas, que es por parecido de nombre.
--
-- El índice es PARCIAL (solo `is_active`) para que desactivar libere el nombre, y
-- sobre `lower(trim(name))` porque "Gaseosa", "gaseosa" y "Gaseosa " son el mismo
-- nombre para quien lo lee.
--
-- Es un índice de expresión + parcial: Prisma no lo puede declarar en el schema,
-- así que va en SQL como los CHECK del repo. No aparece en schema.prisma.

-- ── 1. Desempatar lo que YA está repetido ──────────────────────────────────
-- Sin esto la migración falla en cualquier base que tenga duplicados. Se conserva
-- el más viejo con su nombre y a los demás se les marca visiblemente, para que
-- quien los vea sepa que hay algo que resolver (renombrar en silencio y bien
-- sería peor: el problema quedaría escondido).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['products', 'ingredients', 'subproducts'] LOOP
    EXECUTE format($f$
      UPDATE %I AS x
         SET name = x.name || ' (duplicado ' || d.n || ')'
        FROM (
          SELECT id,
                 row_number() OVER (
                   PARTITION BY lower(btrim(name)) ORDER BY created_at, id
                 ) AS n
            FROM %I
           WHERE is_active
        ) AS d
       WHERE d.id = x.id AND d.n > 1
    $f$, t, t);
  END LOOP;
END $$;

-- ── 2. La garantía ─────────────────────────────────────────────────────────
CREATE UNIQUE INDEX uq_products_nombre_activo
  ON products (lower(btrim(name))) WHERE is_active;

CREATE UNIQUE INDEX uq_ingredients_nombre_activo
  ON ingredients (lower(btrim(name))) WHERE is_active;

CREATE UNIQUE INDEX uq_subproducts_nombre_activo
  ON subproducts (lower(btrim(name))) WHERE is_active;
