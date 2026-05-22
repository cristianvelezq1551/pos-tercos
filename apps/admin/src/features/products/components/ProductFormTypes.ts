/** Shared form state shape for ProductForm and its sub-components. */
export interface FormState {
  name: string;
  description: string;
  basePrice: string;
  category: string;
  imageUrl: string;
  modifiersEnabled: boolean;
  isCombo: boolean;
  comboPrice: string;
  isActive: boolean;
  directResale: boolean;
  unitPurchase: string;
  unitStock: string;
  conversionFactor: string;
  thresholdMin: string;
}
