import { ChevronLeft, ChevronRight } from 'lucide-react';
import { TABLE_PAGE_SIZES, type TablePageSize } from '@shared/types';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

export const DEFAULT_TABLE_PAGE_SIZE: TablePageSize = 10;

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

export function toTablePageSize(value: string): TablePageSize | undefined {
  return TABLE_PAGE_SIZES.find((size) => String(size) === value);
}

export function TablePagination({
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  itemLabel,
  className,
}: {
  total: number;
  page: number;
  pageSize: TablePageSize;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: TablePageSize) => void;
  itemLabel: { singular: string; plural: string };
  className?: string;
}) {
  const pages = pageCount(total, pageSize);
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-sm text-muted-foreground',
        className
      )}
    >
      <span className="tabular-nums">
        {total} {total === 1 ? itemLabel.singular : itemLabel.plural}
      </span>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span>Rows per page</span>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => {
              const next = toTablePageSize(value);
              if (next) onPageSizeChange(next);
            }}
          >
            <SelectTrigger className="h-8 w-18" aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TABLE_PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <span className="tabular-nums">
          Page {Math.min(page, pages)} of {pages}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label="Previous page"
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= pages}
            aria-label="Next page"
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
