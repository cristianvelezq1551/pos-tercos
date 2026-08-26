/**
 * Piezas comunes de los documentos imprimibles de compras (la orden a un
 * proveedor y la lista de faltantes). Viven juntas para que los dos papeles
 * se vean como del mismo negocio y para no tener dos hojas de estilo que se
 * separen con el primer retoque.
 */

export function esc(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function cop(amount: number): string {
  return `$ ${Math.round(amount).toLocaleString('es-CO')}`;
}

export function num(value: number): string {
  return value.toLocaleString('es-CO', { maximumFractionDigits: 2 });
}

export const STYLES = `<style>
  @page { size: A4; margin: 18mm; }
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
         color: #14181f; margin: 0; font-size: 12pt; line-height: 1.45; }
  header { display: flex; justify-content: space-between; align-items: flex-start;
           border-bottom: 2px solid #14181f; padding-bottom: 10px; margin-bottom: 18px; }
  h1 { font-size: 15pt; margin: 0 0 2px; letter-spacing: -0.01em; }
  .muted { color: #5b6472; font-size: 10pt; }
  .biz { text-align: right; }
  .biz strong { font-size: 12pt; }
  .to { margin-bottom: 16px; }
  .to strong { font-size: 13pt; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 3px 14px; margin: 0 0 18px; font-size: 10.5pt; }
  dt { color: #5b6472; }
  dd { margin: 0; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 9.5pt; text-transform: uppercase; letter-spacing: .05em;
       color: #5b6472; border-bottom: 1px solid #c9cfd8; padding: 0 0 6px; }
  td { padding: 9px 0; border-bottom: 1px solid #e7eaef; vertical-align: top; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .sub { color: #5b6472; font-size: 9.5pt; font-weight: normal; }
  tfoot td { border-bottom: none; border-top: 2px solid #14181f; padding-top: 10px; font-weight: 700; }
  .note { margin-top: 16px; padding: 9px 12px; background: #f4f6f9; border-radius: 5px; font-size: 10.5pt; }
  footer { margin-top: 26px; font-size: 9.5pt; color: #5b6472; border-top: 1px solid #e7eaef; padding-top: 8px; }
  /* En pantalla el @page no aplica: el documento necesita su propio margen
     para no quedar pegado al borde. */
  @media screen { body { max-width: 210mm; margin: 0 auto; padding: 18mm 18mm 90px; } }
  @media print { .noprint { display: none !important; } }
  /* Abajo, no arriba: en la esquina superior derecha tapaba los datos del
     negocio. */
  .noprint { position: fixed; bottom: 18px; right: 18px; }
  .noprint button { font: inherit; padding: 10px 16px; border-radius: 6px;
                    border: 1px solid #14181f; background: #14181f; color: #fff; cursor: pointer;
                    box-shadow: 0 2px 10px rgba(0,0,0,.25); }
</style>`;

