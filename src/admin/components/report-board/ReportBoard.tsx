import type { ComponentType, CSSProperties, ReactNode, Ref } from 'react';
import { ChevronsLeftRight } from 'lucide-react';
import type { ReportStatus } from '@shared/types';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Spinner } from '../ui/spinner';
import { cn } from '../../lib/utils';

export interface ReportBoardItem {
  id: string;
  status: ReportStatus;
}

export interface ReportBoardColumnData<T extends ReportBoardItem> {
  status: ReportStatus;
  items: T[];
  total: number;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}

export interface ReportBoardColumnProps {
  status: ReportStatus;
  label: string;
  total: number;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  children: ReactNode;
}

export interface ReportBoardCardProps {
  id: string;
  status: ReportStatus;
  index: number;
  label: string;
  movable: boolean;
  onOpen: () => void;
  actions?: ReactNode;
  children: ReactNode;
}

export interface ReportBoardProps<T extends ReportBoardItem> {
  columns: ReportBoardColumnData<T>[];
  statusLabels: Record<ReportStatus, string>;
  collapsed: readonly ReportStatus[];
  onToggleCollapsed: (status: ReportStatus) => void;
  getItemLabel: (item: T) => string;
  renderCard: (item: T) => ReactNode;
  onOpen: (item: T) => void;
  renderCardActions?: (item: T) => ReactNode;
  canMove?: (item: T) => boolean;
  emptyColumnText?: string;
  ColumnComponent?: ComponentType<ReportBoardColumnProps>;
  CardComponent?: ComponentType<ReportBoardCardProps>;
}

export function ReportBoard<T extends ReportBoardItem>({
  columns,
  statusLabels,
  collapsed,
  onToggleCollapsed,
  getItemLabel,
  renderCard,
  onOpen,
  renderCardActions,
  canMove,
  emptyColumnText = 'No reports',
  ColumnComponent = ReportBoardColumn,
  CardComponent = ReportBoardCard,
}: ReportBoardProps<T>) {
  const expandedCount = columns.filter((column) => !collapsed.includes(column.status)).length;
  const template = (expanded: string) =>
    columns.map((column) => (collapsed.includes(column.status) ? '3rem' : expanded)).join(' ');
  // Narrow screens scroll fixed-width columns sideways; wide screens share the width.
  const gridStyle = {
    '--board-columns-narrow': template('17rem'),
    '--board-columns-wide': template(`minmax(${expandedCount > 3 ? 15 : 17}rem, 1fr)`),
  } as CSSProperties;

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      <div
        className="grid w-max grid-cols-[var(--board-columns-narrow)] gap-3 lg:w-auto lg:grid-cols-[var(--board-columns-wide)]"
        style={gridStyle}
      >
        {columns.map((column) => (
          <ColumnComponent
            key={column.status}
            status={column.status}
            label={statusLabels[column.status]}
            total={column.total}
            collapsed={collapsed.includes(column.status)}
            onToggleCollapsed={() => onToggleCollapsed(column.status)}
          >
            {column.loading ? (
              <div className="flex justify-center py-8">
                <Spinner size="sm" className="text-primary" />
              </div>
            ) : (
              <>
                {column.items.map((item, index) => (
                  <CardComponent
                    key={item.id}
                    id={item.id}
                    status={column.status}
                    index={index}
                    label={getItemLabel(item)}
                    movable={canMove?.(item) ?? false}
                    onOpen={() => onOpen(item)}
                    actions={renderCardActions?.(item)}
                  >
                    {renderCard(item)}
                  </CardComponent>
                ))}
                {column.items.length === 0 && (
                  <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                    {emptyColumnText}
                  </p>
                )}
                {column.hasMore && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    disabled={column.loadingMore}
                    onClick={column.onLoadMore}
                  >
                    {column.loadingMore && <Spinner size="sm" />}
                    Show more ({column.total - column.items.length} remaining)
                  </Button>
                )}
              </>
            )}
          </ColumnComponent>
        ))}
      </div>
    </div>
  );
}

export function ReportBoardColumn({
  status,
  label,
  total,
  collapsed,
  onToggleCollapsed,
  children,
  ref,
  isDropTarget = false,
}: ReportBoardColumnProps & { ref?: Ref<HTMLElement>; isDropTarget?: boolean }) {
  const countLabel = `${total} ${total === 1 ? 'report' : 'reports'}`;

  if (collapsed) {
    return (
      <section
        ref={ref}
        aria-label={`${label}, ${countLabel}, collapsed`}
        className={cn(
          'flex flex-col items-center rounded-lg border bg-muted/50 py-3 transition-colors',
          isDropTarget && 'border-primary bg-primary/10'
        )}
      >
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={onToggleCollapsed}
          aria-label={`Expand ${label}`}
        >
          <ChevronsLeftRight />
        </Button>
        <span className="mt-2 text-xs font-medium text-muted-foreground">{total}</span>
        <span className="mt-3 text-sm font-medium [writing-mode:vertical-rl]">{label}</span>
      </section>
    );
  }

  return (
    <section
      ref={ref}
      aria-label={`${label}, ${countLabel}`}
      className={cn(
        'flex min-h-48 flex-col gap-2 rounded-lg border bg-muted/50 p-2 transition-colors',
        isDropTarget && 'border-primary bg-primary/10'
      )}
    >
      <div className="flex items-center justify-between gap-2 px-1 py-1">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`status-${status} whitespace-nowrap`}>
            {label}
          </Badge>
          <span className="text-xs font-medium text-muted-foreground">{total}</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground"
          onClick={onToggleCollapsed}
          aria-label={`Collapse ${label}`}
        >
          <ChevronsLeftRight />
        </Button>
      </div>
      {children}
    </section>
  );
}

// The open button covers the whole card and doubles as the drag handle. Card content sits above
// it without pointer events, so clicks anywhere on the card reach the button.
export function ReportBoardCard({
  label,
  movable,
  onOpen,
  actions,
  children,
  ref,
  handleRef,
  isDragging = false,
}: ReportBoardCardProps & {
  ref?: Ref<HTMLDivElement>;
  handleRef?: Ref<HTMLButtonElement>;
  isDragging?: boolean;
}) {
  return (
    <Card
      ref={ref}
      className={cn(
        'group relative p-3 shadow-sm transition-colors hover:border-primary/50',
        movable && handleRef && 'cursor-grab active:cursor-grabbing',
        isDragging && 'shadow-lg ring-2 ring-primary'
      )}
    >
      <button
        ref={handleRef}
        type="button"
        className="absolute inset-0 rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Open ${label}`}
        onClick={onOpen}
      />
      <div className="pointer-events-none relative">{children}</div>
      {actions && (
        <div className="absolute right-1.5 top-1.5 focus-within:opacity-100 has-[[data-state=open]]:opacity-100 md:opacity-0 md:group-hover:opacity-100">
          {actions}
        </div>
      )}
    </Card>
  );
}
