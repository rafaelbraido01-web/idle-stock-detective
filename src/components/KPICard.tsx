import { motion } from 'framer-motion';
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
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
      className={cn('bg-card rounded-xl p-5 shadow-card', className)}
    >
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">{title}</p>
      <p className={cn('text-2xl font-semibold font-mono tracking-tight text-foreground', valueClassName)}>{value}</p>
      {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
    </motion.div>
  );
}
