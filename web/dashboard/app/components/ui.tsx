import { type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../lib/utils';
import { Loader2 } from 'lucide-react';

/* ── Button ────────────────────────────────────────────────── */

type ButtonVariant = 'default' | 'primary' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

const btnBase = 'inline-flex items-center justify-center gap-1.5 font-medium rounded-lg border transition-all duration-150 whitespace-nowrap disabled:opacity-40 disabled:pointer-events-none active:scale-[0.97] cursor-pointer';

const btnVariants: Record<ButtonVariant, string> = {
  default: 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-750 hover:border-gray-300 dark:hover:border-gray-600',
  primary: 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700 hover:border-blue-700 dark:bg-blue-500 dark:border-blue-500 dark:hover:bg-blue-600 dark:hover:border-blue-600',
  danger: 'border-transparent bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 hover:bg-red-600 hover:text-white hover:border-red-600 dark:hover:bg-red-600 dark:hover:text-white',
  ghost: 'border-transparent bg-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100',
};

const btnSizes: Record<ButtonSize, string> = {
  sm: 'text-xs px-2.5 py-1.5',
  md: 'text-sm px-3.5 py-2',
  lg: 'text-sm px-5 py-2.5',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
}

export function Button({
  variant = 'default',
  size = 'md',
  loading,
  fullWidth,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        btnBase,
        btnVariants[variant],
        btnSizes[size],
        fullWidth && 'w-full',
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  );
}

/* ── Input ─────────────────────────────────────────────────── */

const inputBase =
  'w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm px-3 py-2 placeholder:text-gray-400 dark:placeholder:text-gray-500 transition-colors duration-150 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-50 dark:disabled:bg-gray-900';

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputBase, className)} {...props} />;
}

/* ── Select ────────────────────────────────────────────────── */

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(inputBase, 'cursor-pointer appearance-none bg-[length:16px] bg-[right_0.75rem_center] bg-no-repeat pr-9', className)}
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
      }}
      {...props}
    >
      {children}
    </select>
  );
}

/* ── Textarea ──────────────────────────────────────────────── */

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(inputBase, 'resize-y min-h-[80px]', className)} {...props} />;
}

/* ── Label ─────────────────────────────────────────────────── */

interface LabelProps {
  htmlFor?: string;
  children: ReactNode;
  hint?: string;
}

export function Label({ htmlFor, children, hint }: LabelProps) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5"
    >
      {children}
      {hint && (
        <span className="ml-1 font-normal normal-case tracking-normal text-gray-400 dark:text-gray-500">
          ({hint})
        </span>
      )}
    </label>
  );
}

/* ── FormGroup ─────────────────────────────────────────────── */

interface FormGroupProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}

export function FormGroup({ label, htmlFor, hint, children, className }: FormGroupProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={htmlFor} hint={hint}>
        {label}
      </Label>
      {children}
    </div>
  );
}

/* ── Checkbox ──────────────────────────────────────────────── */

interface CheckboxProps {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}

export function Checkbox({ id, checked, onChange, label, disabled }: CheckboxProps) {
  return (
    <label htmlFor={id} className="flex items-center gap-2.5 cursor-pointer select-none group">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 accent-blue-600 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      />
      <span className="text-sm text-gray-600 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-gray-200 transition-colors">
        {label}
      </span>
    </label>
  );
}

/* ── Badge ─────────────────────────────────────────────────── */

type BadgeTone = 'success' | 'warning' | 'error' | 'muted' | 'info';

const badgeTones: Record<BadgeTone, string> = {
  success: 'bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800',
  warning: 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800',
  error: 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800',
  muted: 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700',
  info: 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800',
};

const badgeDots: Record<BadgeTone, string> = {
  success: 'bg-green-500',
  warning: 'bg-amber-500',
  error: 'bg-red-500',
  muted: 'bg-gray-400',
  info: 'bg-blue-500',
};

interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  dot?: boolean;
}

export function Badge({ tone = 'muted', children, dot = true }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border',
        badgeTones[tone],
      )}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', badgeDots[tone])} />}
      {children}
    </span>
  );
}

/* ── Card ──────────────────────────────────────────────────── */

interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className }: CardProps) {
  return (
    <div
      className={cn(
        'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 shadow-xs',
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ── Banner ────────────────────────────────────────────────── */

interface BannerProps {
  tone: 'success' | 'error';
  children: ReactNode;
  onClose?: () => void;
}

export function Banner({ tone, children, onClose }: BannerProps) {
  const styles =
    tone === 'success'
      ? 'bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-300 border-green-200 dark:border-green-800'
      : 'bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800';

  return (
    <div className={cn('flex items-center gap-2.5 px-4 py-3 rounded-lg border text-sm font-medium mb-4 animate-in', styles)}>
      <span className="flex-1">{children}</span>
      {onClose && (
        <button
          onClick={onClose}
          className="opacity-60 hover:opacity-100 text-current transition-opacity cursor-pointer"
        >
          &times;
        </button>
      )}
    </div>
  );
}

/* ── Spinner ───────────────────────────────────────────────── */

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
      <Loader2 className="h-6 w-6 animate-spin mb-3" />
      {label && <p className="text-sm">{label}</p>}
    </div>
  );
}

/* ── EmptyState ────────────────────────────────────────────── */

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
}

export function EmptyState({ icon, title, description }: EmptyStateProps) {
  return (
    <div className="text-center py-12 px-6">
      <div className="text-gray-300 dark:text-gray-600 mb-3 flex justify-center">{icon}</div>
      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">{title}</h4>
      <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
    </div>
  );
}

/* ── PageHeader ────────────────────────────────────────────── */

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
          {title}
        </h2>
        {description && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

/* ── InfoItem ──────────────────────────────────────────────── */

interface InfoItemProps {
  label: string;
  value: string;
  mono?: boolean;
}

export function InfoItem({ label, value, mono }: InfoItemProps) {
  return (
    <div className="px-3 py-2.5 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-800">
      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">
        {label}
      </div>
      <div
        className={cn(
          'text-xs text-gray-800 dark:text-gray-200 break-all leading-relaxed',
          mono && 'font-mono',
        )}
      >
        {value || 'N/A'}
      </div>
    </div>
  );
}
