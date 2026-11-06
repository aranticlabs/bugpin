import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { TableHead } from './ui/table';

export type SortDirection = 'asc' | 'desc';

export function SortableTableHead<K extends string>({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
  alignRight = false,
  className,
}: {
  label: string;
  sortKey: K;
  activeKey: string;
  direction: SortDirection;
  onSort: (key: K) => void;
  alignRight?: boolean;
  className?: string;
}) {
  const active = activeKey === sortKey;
  const Icon = !active ? ArrowUpDown : direction === 'asc' ? ArrowUp : ArrowDown;
  return (
    <TableHead
      className={cn(alignRight && 'text-right', className)}
      aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <Button
        variant="ghost"
        size="sm"
        className={cn('h-8 font-medium', alignRight ? '-mr-3' : '-ml-3')}
        onClick={() => onSort(sortKey)}
      >
        {label}
        <Icon className={active ? '' : 'text-muted-foreground/60'} />
      </Button>
    </TableHead>
  );
}
