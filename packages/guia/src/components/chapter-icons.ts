import {
  Box,
  CookingPot,
  Globe,
  LineChart,
  Map,
  Receipt,
  ShieldCheck,
  ShoppingBasket,
  ShoppingCart,
  TrendingUp,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

/**
 * Los capítulos guardan el NOMBRE del ícono (string) para que el contenido siga
 * siendo datos serializables y no arrastre componentes de React.
 */
const ICONS: Record<string, LucideIcon> = {
  map: Map,
  'shopping-cart': ShoppingCart,
  wallet: Wallet,
  globe: Globe,
  'cooking-pot': CookingPot,
  'shopping-basket': ShoppingBasket,
  receipt: Receipt,
  box: Box,
  'trending-up': TrendingUp,
  'line-chart': LineChart,
  users: Users,
  'shield-check': ShieldCheck,
};

export function chapterIcon(name: string): LucideIcon {
  return ICONS[name] ?? Map;
}
