/**
 * Un producto de REVENTA DIRECTA no lleva receta: al venderlo se descuenta su
 * propio stock (`computeConsumptionSpecs` corta en `p.directResale`). El
 * servidor ya rechaza guardarle líneas; ofrecer igual el editor dejaba una
 * acción que siempre termina en error.
 */
export function SinRecetaNotice({ productName }: { productName: string }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground">
        {productName} no lleva receta
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Es un producto de reventa directa: se compra hecho y se vende igual. Al venderlo se
        descuenta <span className="text-foreground">una unidad de su propio stock</span>, no
        insumos. Su costo sale de la última factura de compra.
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        Para ver o mover sus existencias, entra a{' '}
        <span className="text-foreground">Existencias</span>; para cambiar su precio o su
        conversión de compra, a la ficha del producto.
      </p>
    </section>
  );
}
