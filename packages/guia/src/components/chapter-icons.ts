import {
  Box,
  ClipboardCheck,
  Coins,
  CookingPot,
  Globe,
  LineChart,
  Map,
  Receipt,
  ShieldCheck,
  ShoppingBasket,
  ShoppingCart,
  Trash2,
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
  trash: Trash2,
  'clipboard-check': ClipboardCheck,
  coins: Coins,
};

export function chapterIcon(name: string): LucideIcon {
  return ICONS[name] ?? Map;
}
