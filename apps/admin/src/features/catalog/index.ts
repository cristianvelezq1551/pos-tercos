// Barrel CLIENT-SAFE: los helpers SSR viven en './server' y se importan
// directo desde las pages (acá romperían a los client components).
export { CatalogGrid } from './components/CatalogGrid';
export {
  ProductPickerModal,
  type PickerSelection,
} from './components/ProductPickerModal';
export { fetchActiveProducts, fetchAvailability, setSoldOut } from './api';
export { useAvailability } from './hooks/useAvailability';
