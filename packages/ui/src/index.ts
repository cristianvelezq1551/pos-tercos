// ─── Layout & shell ─────────────────────────────────────────────
export { AppShell, type AppShellProps } from './components/app-shell';
export { Topbar, type TopbarProps } from './components/topbar';
export {
  Sidebar,
  sidebarLinkClass,
  type SidebarProps,
  type SidebarSectionProps,
  type SidebarLinkProps,
} from './components/sidebar';
export { PageHeader, type PageHeaderProps, type BreadcrumbItem } from './components/page-header';
export { UserMenu, type UserMenuProps, type UserMenuUser } from './components/user-menu';
export { BrandFooter, type BrandFooterProps } from './components/brand-footer';
export { Container, type ContainerProps } from './components/container';
export { Section, type SectionProps } from './components/section';
export { Card, type CardProps } from './components/card';
export { BrandHeader, type BrandHeaderProps } from './components/brand-header';
export { Stamp, type StampProps, type StampTone } from './components/stamp';

// ─── Datos & estado ─────────────────────────────────────────────
export { Badge, type BadgeProps, type BadgeTone, type BadgeVariant, type BadgeSize } from './components/badge';
export {
  StatusBadge,
  type StatusBadgeProps,
  type StatusMapping,
  type StatusMappingEntry,
} from './components/status-badge';
export { Chip, type ChipProps } from './components/chip';
export {
  ConnectionDot,
  type ConnectionDotProps,
  type ConnectionState,
} from './components/connection-dot';
export { StatCard, type StatCardProps, type StatTone } from './components/stat-card';
export { EmptyState, type EmptyStateProps } from './components/empty-state';
export {
  LoadingSkeleton,
  type LoadingSkeletonProps,
  type SkeletonShape,
} from './components/loading-skeleton';
export { DataTable, type DataTableProps, type DataTableColumn } from './components/data-table';

// ─── Forms ──────────────────────────────────────────────────────
export { FormField, type FormFieldProps } from './components/form-field';
export { Input, type InputProps } from './components/input';
export { Textarea, type TextareaProps } from './components/textarea';
export { Select, type SelectProps } from './components/select';
export { Label, type LabelProps } from './components/label';
export { Checkbox, type CheckboxProps } from './components/checkbox';
export { Switch, type SwitchProps } from './components/switch';
export { RadioGroup, type RadioGroupProps, type RadioOption } from './components/radio-group';
export { NumberInput, type NumberInputProps } from './components/number-input';
export {
  DateInput,
  TimeInput,
  DateRangeInput,
  type DateInputProps,
  type DateRangeInputProps,
} from './components/date-input';
export { SearchInput, type SearchInputProps } from './components/search-input';
export { FileDropzone, type FileDropzoneProps } from './components/file-dropzone';

// ─── Acciones & feedback ───────────────────────────────────────
export { Button, buttonVariants, type ButtonProps } from './components/button';
export { IconButton, type IconButtonProps } from './components/icon-button';
export { ButtonGroup, type ButtonGroupProps } from './components/button-group';
export { Dialog, type DialogProps } from './components/dialog';
export { Drawer, type DrawerProps } from './components/drawer';
export {
  ToastProvider,
  useToast,
  type ToastInput,
  type ToastTone,
} from './components/toast';
export { ConfirmDialog, type ConfirmDialogProps } from './components/confirm-dialog';
export { Tooltip, type TooltipProps } from './components/tooltip';
export { Popover, type PopoverProps } from './components/popover';

// ─── Money & números ───────────────────────────────────────────
export { Money, type MoneyProps } from './components/money';
export { Quantity, type QuantityProps } from './components/quantity';
export { Percentage, type PercentageProps } from './components/percentage';
export { Countdown, type CountdownProps } from './components/countdown';

// ─── Composiciones de feature ──────────────────────────────────
export { LoginForm, type LoginFormProps } from './components/login-form';

// ─── Utils ─────────────────────────────────────────────────────
export { cn } from './lib/utils';
export {
  formatCop,
  formatNumber,
  formatPercent,
  formatDate,
  formatDuration,
  type DateFormat,
} from './lib/format';
