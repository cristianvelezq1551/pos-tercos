/**
 * Rutina de apertura y cierre, con marca por tarea y autoguardado.
 *
 * Superficie pública del feature (§3): a un feature ajeno se entra por acá,
 * nunca por sus internos. Se exporta solo lo que se consume desde afuera —
 * un barril que re-exporta todo no es una frontera, es una lista.
 */
export { ChecklistView } from './ChecklistView';
