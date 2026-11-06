import {
  useEffect,
  useState,
  type ComponentType,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { ChevronsLeftRight } from 'lucide-react';
import type { ReportStatus } from '@shared/types';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Spinner } from '../ui/spinner';
import { cn } from '../../lib/utils';
import { ReportStatusIcon, ReportStatusLabel } from '../report/ReportStatusPriority';

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
  /** Fixed board height; columns then scroll on their own instead of growing */
  height?: number;
  containerRef?: Ref<HTMLDivElement>;
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
  height,
  containerRef,
}: ReportBoardProps<T>) {
  const expandedCount = columns.filter((column) => !collapsed.includes(column.status)).length;
  const template = (expanded: string, collapsedSize: string) =>
    columns
      .map((column) => (collapsed.includes(column.status) ? collapsedSize : expanded))
      .join(' ');
  // Narrow screens scroll fixed-width columns sideways; wide screens share the width. Collapsed
  // and expanded tracks use the same shape so the browser can animate between them.
  const gridStyle = {
    '--board-columns-narrow': template('17rem', '3rem'),
    '--board-columns-wide': template(
      `minmax(${expandedCount > 3 ? 15 : 17}rem, 1fr)`,
      'minmax(3rem, 0fr)'
    ),
  } as CSSProperties;

  return (
    <div
      ref={containerRef}
      className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0"
      style={height === undefined ? undefined : { height }}
    >
      <div
        className={cn(
          'grid w-max grid-cols-[var(--board-columns-narrow)] gap-3 transition-[grid-template-columns] duration-200 ease-linear motion-reduce:transition-none lg:w-auto lg:grid-cols-[var(--board-columns-wide)]',
          height !== undefined && 'h-full grid-rows-[minmax(0,1fr)]'
        )}
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

const COLUMN_RESIZE_MS = 200;

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
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
  // While the column shrinks, the expanded content keeps its old width and fades out as the
  // collapsed layout fades in on top of it; the expanded content unmounts once resizing is done.
  const [shownExpanded, setShownExpanded] = useState(!collapsed);
  const [frozenWidth, setFrozenWidth] = useState<number | null>(null);
  if (!collapsed && !shownExpanded) setShownExpanded(true);
  const closing = collapsed && shownExpanded;

  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(
      () => {
        setShownExpanded(false);
        setFrozenWidth(null);
      },
      prefersReducedMotion() ? 0 : COLUMN_RESIZE_MS
    );
    return () => window.clearTimeout(timer);
  }, [closing]);

  const collapse = (event: MouseEvent<HTMLButtonElement>) => {
    const content = event.currentTarget.closest<HTMLElement>('[data-column-content]');
    setFrozenWidth(content?.offsetWidth ?? null);
    onToggleCollapsed();
  };

  return (
    <section
      ref={ref}
      aria-label={`${label}, ${countLabel}${collapsed ? ', collapsed' : ''}`}
      className={cn(
        'group/column relative flex min-w-0 flex-col overflow-hidden rounded-lg border bg-muted/50 transition-colors',
        shownExpanded ? 'min-h-48 p-2' : 'py-3',
        isDropTarget && 'border-primary bg-primary/10'
      )}
    >
      {shownExpanded && (
        <div
          key="expanded"
          data-column-content
          inert={closing}
          className={cn(
            'flex min-h-0 min-w-52 flex-1 flex-col gap-2 transition-opacity duration-150 starting:opacity-0 motion-reduce:transition-none',
            closing && 'opacity-0'
          )}
          style={frozenWidth === null ? undefined : { width: frozenWidth }}
        >
          <div className="flex items-center justify-between gap-2 px-1 py-1">
            <div className="flex items-center gap-2">
              <ReportStatusLabel status={status} label={label} />
              <span className="text-xs font-medium text-muted-foreground">{total}</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground"
              onClick={collapse}
              aria-label={`Collapse ${label}`}
            >
              <ChevronsLeftRight />
            </Button>
          </div>
          {/* The scrollbar keeps its width but only shows while the column is hovered or focused. */}
          <div
            className={cn(
              '-mx-1 -mb-1 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-1 pb-1',
              '[scrollbar-color:color-mix(in_oklab,var(--muted-foreground)_0%,transparent)_transparent] [&::-webkit-scrollbar-thumb]:bg-transparent',
              'transition-[scrollbar-color] duration-300 ease-out group-focus-within/column:delay-200 group-hover/column:delay-200',
              'group-focus-within/column:[scrollbar-color:var(--muted-foreground)_transparent] group-hover/column:[scrollbar-color:var(--muted-foreground)_transparent]',
              'group-focus-within/column:[&::-webkit-scrollbar-thumb]:bg-muted-foreground group-hover/column:[&::-webkit-scrollbar-thumb]:bg-muted-foreground'
            )}
          >
            {children}
          </div>
        </div>
      )}
      {collapsed && (
        <div
          key="collapsed"
          className={cn(
            'flex flex-col items-center transition-opacity duration-200 starting:opacity-0 motion-reduce:transition-none',
            closing && 'absolute inset-x-0 top-0 pt-3'
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
          <ReportStatusIcon status={status} className="mt-2" />
          <span className="mt-2 text-xs font-medium text-muted-foreground">{total}</span>
          <span className="mt-3 text-sm font-medium [writing-mode:vertical-rl]">{label}</span>
        </div>
      )}
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
