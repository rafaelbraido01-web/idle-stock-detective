import { getAgingCategory } from '@/types/inventory';
import { cn } from '@/lib/utils';

interface AgingBadgeProps {
  dias: number;
  className?: string;
}

export function AgingBadge({ dias, className }: AgingBadgeProps) {
  const category = getAgingCategory(dias);
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider',
      category.bgClassName,
      category.className,
      className
    )}>
      {category.label}
    </span>
  );
}
