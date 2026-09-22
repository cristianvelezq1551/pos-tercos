// OJO: `server.ts` NO se re-exporta acá. Trae `next/headers`, y con eso
// cualquier componente cliente que importe del barril rompe el build. Las
// pages lo importan por su ruta: `features/payables/server`.
export { PayablesView } from './components/PayablesView';
export { payableProofUrl } from './api/client';
