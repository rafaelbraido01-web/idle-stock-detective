import { cn } from '@/lib/utils';

interface KPICardProps {
  title: string;
  value: string;
  subtitle?: string;
  className?: string;
  valueClassName?: string;
}

export function KPICard({ title, value, subtitle, className, valueClassName }: KPICardProps) {
  return (
    <div
      className={cn('bg-card rounded-xl p-5 shadow-card animate-fade-in', className)}
    >
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">{title}</p>
      <p className={cn('text-2xl font-semibold font-mono tracking-tight text-foreground', valueClassName)}>{value}</p>
      {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
    </div>
  );
}
