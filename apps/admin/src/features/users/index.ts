export { UsersManager } from './components/UsersManager';
export { EditSalaryDialog } from './components/EditSalaryDialog';
export { TerminateDialog } from './components/TerminateDialog';
// `getUsersServer` vive en './server' (usa next/headers). NO se re-exporta aquí:
// este barrel lo consumen client components y arrastraría el bundle de servidor.
