import { type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../lib/utils';

const btnBase = 'inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:pointer-events-none';
const btnVariants = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500/40 dark:bg-blue-500 dark:hover:bg-blue-600',
  secondary: 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 focus:ring-slate-400/20',
  ghost: 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 focus:ring-slate-400/20',
  danger: 'bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 focus:ring-red-500/30',
};
const btnSizes = {
  sm: 'px-2.5 py-1.5 text-xs gap-1',
  md: 'px-3.5 py-2',
  lg: 'px-5 py-2.5 text-sm',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof btnVariants;
  size?: keyof typeof btnSizes;
}

export function Button({ variant = 'secondary', size = 'md', className, ...props }: ButtonProps) {
  return <button className={cn(btnBase, btnVariants[variant], btnSizes[size], className)} {...props} />;
}

const inputCls = 'w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 dark:focus:border-blue-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputCls, className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(inputCls, 'cursor-pointer appearance-none bg-[length:16px] bg-[right_10px_center] bg-no-repeat pr-9', 'bg-[url("data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2716%27%20height=%2716%27%20viewBox=%270%200%2024%2024%27%20fill=%27none%27%20stroke=%27%2394a3b8%27%20stroke-width=%272%27%20stroke-linecap=%27round%27%20stroke-linejoin=%27round%27%3E%3Cpath%20d=%27m6%209%206%206%206-6%27/%3E%3C/svg%3E")]', className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(inputCls, 'resize-y', className)} {...props} />;
}

export function Label({ children, htmlFor, className }: { children: ReactNode; htmlFor?: string; className?: string }) {
  return <label htmlFor={htmlFor} className={cn('block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5', className)}>{children}</label>;
}

export function FormGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('space-y-1.5', className)}>{children}</div>;
}

export function Checkbox({ label, checked, onChange, disabled, id }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; id?: string }) {
  return (
    <label htmlFor={id} className={cn('flex items-center gap-2.5 text-sm cursor-pointer select-none', disabled && 'opacity-50 cursor-not-allowed')}>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500/30 accent-blue-600 cursor-pointer" />
      <span className="text-slate-600 dark:text-slate-400">{label}</span>
    </label>
  );
}

const badgeTones = {
  success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400',
  warning: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400',
  error: 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400',
  muted: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  info: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400',
};
const dotTones = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  error: 'bg-red-500',
  muted: 'bg-slate-400 dark:bg-slate-500',
  info: 'bg-blue-500',
};

export function Badge({ children, tone = 'muted', dot }: { children: ReactNode; tone?: keyof typeof badgeTones; dot?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold', badgeTones[tone])}>
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', dotTones[tone])} />}
      {children}
    </span>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm', className)}>{children}</div>;
}

export function CardHeader({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800', className)}>{children}</div>;
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('p-5', className)}>{children}</div>;
}

export function CardFooter({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-wrap gap-2 px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 rounded-b-xl', className)}>{children}</div>;
}

const bannerVariants = {
  success: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/50 text-emerald-800 dark:text-emerald-300',
  error: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/50 text-red-800 dark:text-red-300',
  info: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800/50 text-blue-800 dark:text-blue-300',
};

export function Banner({ children, variant = 'info', onClose }: { children: ReactNode; variant?: keyof typeof bannerVariants; onClose?: () => void }) {
  return (
    <div className={cn('flex items-center gap-3 px-4 py-3 rounded-lg border text-sm font-medium animate-[fade-in_0.2s_ease]', bannerVariants[variant])}>
      <span className="flex-1">{children}</span>
      {onClose && <button onClick={onClose} className="opacity-60 hover:opacity-100 transition-opacity text-current">&times;</button>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <div className={cn('h-6 w-6 border-2 border-slate-200 dark:border-slate-700 border-t-blue-500 rounded-full animate-spin', className)} />;
}

export function EmptyState({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="text-center py-12 px-6">
      <div className="text-4xl mb-3 opacity-30">{icon}</div>
      <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">{title}</h4>
      <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p>
    </div>
  );
}

export function InfoItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="px-3 py-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800">
      <div className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">{label}</div>
      <div className={cn('text-xs text-slate-800 dark:text-slate-200 break-all leading-relaxed', mono !== false && 'font-mono')}>{value || 'N/A'}</div>
    </div>
  );
}

export function PageHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">{title}</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{description}</p>
    </div>
  );
}

export function SectionHeader({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex items-center justify-between gap-3 mb-4', className)}>{children}</div>;
}

export function FormGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-1 sm:grid-cols-2 gap-4', className)}>{children}</div>;
}

export function FormActions({ children }: { children: ReactNode }) {
  return <div className="flex gap-2 mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">{children}</div>;
}
