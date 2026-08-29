import {
  ArrowLeftRight,
  Box,
  ClipboardCheck,
  Coins,
  CookingPot,
  Gift,
  Globe,
  HandCoins,
  Layers,
  LineChart,
  Map,
  Package,
  Receipt,
  ShieldCheck,
  ShoppingBasket,
  ShoppingCart,
  Tag,
  Trash2,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Truck,
  Undo2,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

/**
 * Los capítulos guardan el NOMBRE del ícono (string) para que el contenido siga
 * siendo datos serializables y no arrastre componentes de React.
 */
const ICONS: Record<string, LucideIcon> = {
  'arrow-left-right': ArrowLeftRight,
  'gift': Gift,
  'hand-coins': HandCoins,
  'layers': Layers,
  'package': Package,
  'tag': Tag,
  'trending-down': TrendingDown,
  'triangle-alert': TriangleAlert,
  'truck': Truck,
  'undo': Undo2,
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
