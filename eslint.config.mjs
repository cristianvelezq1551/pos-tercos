import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/next-env.d.ts',
      '**/public/sw.js',
      '.claude/**',
      '_legacy/**',
      'apps/api/prisma/generated/**',
      // Artefactos de build de Flutter (JS generado por plugins, no es código nuestro)
      'apps/kds-flutter/build/**',
      'apps/kds-flutter/.dart_tool/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
  {
    // NestJS uses decorators heavily; relax rules that conflict
    files: ['apps/api/**/*.ts'],
    rules: {
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },
  // Promesas sueltas: las DOS reglas que necesitan tipos y que atrapan el bug
  // más caro de un código tan asíncrono como este — un `await` olvidado en un
  // cobro, un movimiento de stock o un cierre de caja, que "funciona" en dev y
  // pierde escrituras bajo carga. Hoy el repo tiene CERO violaciones: esto no
  // limpia nada, congela la disciplina que ya existe para que no se pierda.
  //
  // `checksVoidReturn.attributes: false` es la configuración estándar de React:
  // `onClick={async () => …}` es idiomático y React ignora la promesa a
  // propósito. Sin ese flag la regla marca 88 sitios sanos y termina apagada.
  ...['api', 'admin', 'web', 'cocina', 'public-display'].map((app) => ({
    // Solo `src/`: los archivos de configuración (next.config.ts,
    // vitest.config.ts, prisma/seed.ts) están fuera del tsconfig de la app y el
    // parser con tipos no los puede resolver. Ahí no hay lógica asíncrona.
    files: [`apps/${app}/src/**/*.{ts,tsx}`],
    ignores: [`apps/${app}/src/**/*.{test,spec}.{ts,tsx}`],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: new URL(`./apps/${app}/`, import.meta.url).pathname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
    },
  })),
  // --- Enforcement de las reglas de tamaño de §3 (antes solo vivían en
  // CLAUDE.md y dependían de memoria: 42 componentes >200 líneas y contando).
  // Los archivos EXISTENTES que ya violaban quedan congelados en un baseline
  // más abajo (no se refactoriza a ciegas); todo archivo NUEVO cumple o el
  // lint falla. NO agregar archivos al baseline: partir el componente.
  {
    files: ['apps/*/src/**/*.tsx'],
    ignores: ['**/*.{test,spec}.tsx'],
    rules: {
      'max-lines': [
        'error',
        { max: 200, skipBlankLines: true, skipComments: true },
      ],
    },
  },
  {
    // Funciones <50 líneas (§3) en el backend y el dominio puro. El límite
    // real del error es 50 líneas de CÓDIGO (sin blancos ni comentarios).
    files: ['apps/api/src/**/*.ts', 'packages/domain/src/**/*.ts'],
    ignores: ['**/*.{test,spec}.ts', '**/test-support/**'],
    rules: {
      'max-lines-per-function': [
        'error',
        { max: 50, skipBlankLines: true, skipComments: true, IIFEs: false },
      ],
    },
  },
  {
    // Boundaries de features (§3): a un feature ajeno se entra por su barrel
    // (index.ts) o por su server.ts (helpers SSR, separado a propósito del
    // barrel cliente). Nunca por sus internos.
    files: ['apps/*/src/**/*.{ts,tsx}'],
    ignores: ['**/*.{test,spec}.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                // Desde app/ o lib/: features/<x>/<interno> (barrel y server permitidos).
                '**/features/*/**',
                '!**/features/*/server',
                // Desde dentro de un feature: ../<otro-feature>/<capa>/**, a 1-3
                // niveles de profundidad. `[a-z]*` ancla el nombre del feature:
                // sin eso, `*` matchea `..` (minimatch corre con dot:true acá) y
                // la regla marcaba `../../../lib/api-server` (la lib compartida).
                '../[a-z]*/api/**',
                '../[a-z]*/components/**',
                '../[a-z]*/hooks/**',
                '../[a-z]*/lib/**',
                '../[a-z]*/store/**',
                '../../[a-z]*/api/**',
                '../../[a-z]*/components/**',
                '../../[a-z]*/hooks/**',
                '../../[a-z]*/lib/**',
                '../../[a-z]*/store/**',
                '../../../[a-z]*/api/**',
                '../../../[a-z]*/components/**',
                '../../../[a-z]*/hooks/**',
                '../../../[a-z]*/lib/**',
                '../../../[a-z]*/store/**',
              ],
              message:
                'A un feature ajeno se entra por su index.ts (o server.ts para SSR), nunca por sus internos.',
            },
          ],
        },
      ],
    },
  },
  // ------------------------------------------------------------------
  // BASELINE 2026-08-14 — deuda EXISTENTE congelada, medida con las reglas
  // de arriba el día que se activaron. La regla del juego: esta lista solo
  // puede ACHICARSE. Si tu archivo nuevo aparece acá te equivocaste de
  // camino — parte el componente / la función, o entra por el barrel.
  // ------------------------------------------------------------------
  {
    // 31 archivos que ya superaban 200 líneas de código al activar la regla.
    files: [
      // Los [corchetes] de las rutas dinámicas se escapan: para el glob son clases de caracteres.
      'apps/admin/src/app/(authenticated)/invoices/\\[id\\]/page.tsx',
      'apps/admin/src/app/styleguide/client-demos.tsx',
      'apps/admin/src/app/styleguide/page.tsx',
      'apps/admin/src/components/AdminSidebar.tsx',
      'apps/admin/src/features/audit/components/AuditTable.tsx',
      'apps/admin/src/features/cortesias/components/CortesiasPanel.tsx',
      'apps/admin/src/features/dashboard/components/LiveDashboardSections.tsx',
      'apps/admin/src/features/ingredients/components/IngredientForm.tsx',
      'apps/admin/src/features/inventory/components/AdjustStockForm.tsx',
      'apps/admin/src/features/invoices/components/CreateStockableInline.tsx',
      'apps/admin/src/features/invoices/components/InvoiceConfirmModal.tsx',
      'apps/admin/src/features/invoices/components/InvoiceUploader.tsx',
      'apps/admin/src/features/products/components/ProductForm.tsx',
      'apps/admin/src/features/products/components/ProductsTable.tsx',
      'apps/admin/src/features/promotions/components/PromotionDiscountSection.tsx',
      'apps/admin/src/features/purchase-suggestions/components/SendToSupplierDialog.tsx',
      'apps/admin/src/features/purchase-suggestions/components/SuggestionDetail.tsx',
      'apps/admin/src/features/recipes/components/RecipeEditor.tsx',
      'apps/admin/src/features/reports/components/ReconciliationView.tsx',
      'apps/admin/src/features/sales/components/DayHistoryPanel.tsx',
      'apps/admin/src/features/sales/components/EditSaleModal.tsx',
      'apps/admin/src/features/sales/components/OrdersPanel.tsx',
      'apps/admin/src/features/shifts/components/ShiftSessionOrdersTable.tsx',
      'apps/admin/src/features/subproducts/components/SubproductForm.tsx',
      'apps/admin/src/features/suppliers/components/SupplierForm.tsx',
      'apps/admin/src/features/users/components/UserFormDialog.tsx',
      'apps/public-display/src/features/display/components/BrollStage.tsx',
      'apps/web/src/features/cart/components/CartDrawer.tsx',
      'apps/web/src/features/catalog/components/ProductPickerModal.tsx',
      'apps/web/src/features/checkout/components/CheckoutForm.tsx',
      'apps/web/src/features/checkout/components/OrderStatusView.tsx',
    ],
    rules: { 'max-lines': 'off' },
  },
  {
    // 41 archivos con funciones >50 líneas de código al activar la regla
    // (varias son closures transaccionales legítimos — ver §3 de CLAUDE.md).
    files: [
      'apps/api/src/common/assert-env.ts',
      'apps/api/src/cortesias/cortesias.service.ts',
      'apps/api/src/fixed-costs/fixed-costs.service.ts',
      'apps/api/src/inventory/inventory.service.ts',
      'apps/api/src/inventory/stock-counts.service.ts',
      'apps/api/src/invoices/invoice-payments.service.ts',
      'apps/api/src/invoices/invoices.mappers.ts',
      'apps/api/src/invoices/invoices.service.ts',
      'apps/api/src/notifications/notification.service.ts',
      'apps/api/src/notifications/owner-notification.service.ts',
      'apps/api/src/payables/payables.service.ts',
      'apps/api/src/products/products.service.ts',
      'apps/api/src/promotions/promotions.service.ts',
      'apps/api/src/purchase-suggestions/purchase-suggestions.service.ts',
      'apps/api/src/recipe-book/recipe-book.service.ts',
      'apps/api/src/recipes/recipes.service.ts',
      'apps/api/src/reports/cogs.service.ts',
      'apps/api/src/reports/finance-summary.service.ts',
      'apps/api/src/reports/financial-reports.service.ts',
      'apps/api/src/reports/inventory-usage.service.ts',
      'apps/api/src/reports/owner-digest.service.ts',
      'apps/api/src/reports/reconciliation.service.ts',
      'apps/api/src/reports/sales-reports.service.ts',
      'apps/api/src/sales/sales-consumption.service.ts',
      'apps/api/src/sales/sales-edit.service.ts',
      'apps/api/src/sales/sales-offline.service.ts',
      'apps/api/src/sales/sales-receipt.service.ts',
      'apps/api/src/sales/sales.mappers.ts',
      'apps/api/src/sales/sales.service.ts',
      'apps/api/src/shifts/shifts.service.ts',
      'apps/api/src/subproducts/production.service.ts',
      'apps/api/src/treasury/treasury.service.ts',
      'apps/api/src/users/users.service.ts',
      'apps/api/src/workers/workers-weekly.service.ts',
      'packages/domain/src/availability/evaluate.ts',
      'packages/domain/src/cost-fifo/run-ledger.ts',
      'packages/domain/src/printer/render-comanda.ts',
      'packages/domain/src/printer/render-escpos.ts',
      'packages/domain/src/printer/render-receipt.ts',
      'packages/domain/src/recipe/compute-cost.ts',
      'packages/domain/src/whatsapp/templates.ts',
    ],
    rules: { 'max-lines-per-function': 'off' },
  },
  {
    // 21 archivos con imports cross-feature que saltan el barrel (auditoría
    // 2026-08-14). Los de cocina son pages hacia features SIN index.ts (deuda
    // estructural de §7.v11); el resto son los cruces documentados.
    files: [
      'apps/admin/src/app/caja/arqueos/\\[shiftId\\]/metodo/\\[method\\]/page.tsx',
      'apps/admin/src/app/caja/layout.tsx',
      'apps/admin/src/components/AdminSidebar.tsx',
      'apps/admin/src/features/caja-cortesias/components/OrderCortesiaModal.tsx',
      'apps/admin/src/features/catalog/components/CatalogGrid.tsx',
      'apps/admin/src/features/catalog/components/ProductPickerModal.tsx',
      'apps/admin/src/features/catalog/components/ProductTile.tsx',
      'apps/admin/src/features/financial/components/PendingPayablesCard.tsx',
      'apps/admin/src/features/sales/api/print.ts',
      'apps/admin/src/features/sales/hooks/useFacturaPrint.tsx',
      'apps/admin/src/lib/socket-auth.ts',
      'apps/cocina/src/app/(authenticated)/biblia/page.tsx',
      'apps/cocina/src/app/(authenticated)/checklist/page.tsx',
      'apps/cocina/src/app/(authenticated)/incidencias/page.tsx',
      'apps/cocina/src/app/(authenticated)/inventario/page.tsx',
      'apps/cocina/src/app/(authenticated)/produccion/page.tsx',
      'apps/web/src/features/cart/components/CartDrawer.tsx',
      'apps/web/src/features/catalog/components/CatalogGrid.tsx',
      'apps/web/src/features/checkout/components/CartChangesBanner.tsx',
      'apps/web/src/features/checkout/components/OrderSummaryCard.tsx',
      'apps/web/src/features/checkout/hooks/use-cart-reconcile.ts',
    ],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    // React surfaces: enforce hooks correctness.
    // `cocina` (§7.v11) faltaba y `pos` ya no existe (se fusionó en `admin`):
    // la app de cocina quedó sin reglas de hooks desde que se creó. Al agregar
    // una app nueva, agregarla ACÁ o queda sin linter de hooks en silencio.
    files: [
      'apps/{admin,cocina,web,public-display}/**/*.{ts,tsx}',
      'packages/{ui,brand}/**/*.{ts,tsx}',
    ],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
);
