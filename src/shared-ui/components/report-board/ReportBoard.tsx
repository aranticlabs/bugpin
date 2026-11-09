import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { ChevronsLeftRight, ListChecks } from 'lucide-react';
import type { ReportStatus } from '@shared/types';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Spinner } from '../ui/spinner';
import { cn } from '../../lib/utils';
import { ReportStatusIcon, ReportStatusLabel } from '../../lib/status';
import { useMarqueeSelection } from './useMarqueeSelection';

export interface ReportBoardLabels {
  columnSummary: (label: string, total: number, collapsed: boolean) => string;
  selectAll: (label: string) => string;
  deselectAll: (label: string) => string;
  collapseColumn: (label: string) => string;
  expandColumn: (label: string) => string;
  openCard: (label: string, selected: boolean) => string;
  loadMore: (remaining: number) => string;
  loadError: string;
  retry: string;
}

const DEFAULT_LABELS: ReportBoardLabels = {
  columnSummary: (label, total, collapsed) =>
    `${label}, ${total} ${total === 1 ? 'report' : 'reports'}${collapsed ? ', collapsed' : ''}`,
  selectAll: (label) => `Select all in ${label}`,
  deselectAll: (label) => `Deselect all in ${label}`,
  collapseColumn: (label) => `Collapse ${label}`,
  expandColumn: (label) => `Expand ${label}`,
  openCard: (label, selected) => `Open ${label}${selected ? ', selected' : ''}`,
  loadMore: (remaining) => `Show more (${remaining} remaining)`,
  loadError: "Couldn't load reports",
  retry: 'Retry',
};

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
  /** The column's reports, or its next page, failed to load */
  error?: boolean;
  onRetry?: () => void;
}

export interface ReportBoardColumnProps {
  labels?: Partial<ReportBoardLabels>;
  status: ReportStatus;
  label: string;
  total: number;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** Selects every loaded card of the column, or clears them when all are selected */
  onSelectAll?: () => void;
  allSelected?: boolean;
  children: ReactNode;
}

export interface ReportBoardCardProps {
  labels?: Partial<ReportBoardLabels>;
  id: string;
  status: ReportStatus;
  index: number;
  label: string;
  movable: boolean;
  onOpen: () => void;
  selected?: boolean;
  /** Cmd or Ctrl + click toggles the card; Shift + click selects a range within its column */
  onSelect?: (mode: BoardSelectMode) => void;
  actions?: ReactNode;
  children: ReactNode;
}

export type BoardSelectMode = 'toggle' | 'range';

export interface BoardSelection {
  selectedIds: ReadonlySet<string>;
  onSelect: (id: string, mode: BoardSelectMode) => void;
  onSelectColumn: (status: ReportStatus) => void;
  onChange: (next: Set<string>) => void;
  onClear: () => void;
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
  labels?: Partial<ReportBoardLabels>;
  ColumnComponent?: ComponentType<ReportBoardColumnProps>;
  CardComponent?: ComponentType<ReportBoardCardProps>;
  /** Fixed board height; columns then scroll on their own instead of growing */
  height?: number;
  containerRef?: Ref<HTMLDivElement>;
  /** Enables selecting cards by modifier clicks, column headers, and a drawn rectangle */
  selection?: BoardSelection;
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
  labels,
  emptyColumnText = 'No reports',
  ColumnComponent = ReportBoardColumn,
  CardComponent = ReportBoardCard,
  height,
  containerRef,
  selection,
}: ReportBoardProps<T>) {
  const text = { ...DEFAULT_LABELS, ...labels };
  const boardRef = useRef<HTMLDivElement | null>(null);
  const setBoardRef = (element: HTMLDivElement | null) => {
    boardRef.current = element;
    if (typeof containerRef === 'function') containerRef(element);
    else if (containerRef) containerRef.current = element;
  };
  const noSelection = useRef<ReadonlySet<string>>(new Set()).current;
  const selectedIds = selection?.selectedIds ?? noSelection;
  const marquee = useMarqueeSelection({
    containerRef: boardRef,
    enabled: selection !== undefined,
    selectedIds,
    onChange: (next) => selection?.onChange(next),
    onClear: () => selection?.onClear(),
  });
  const clearOnEscape = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && !event.defaultPrevented && selectedIds.size > 0) {
      selection?.onClear();
    }
  };

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
      ref={setBoardRef}
      data-selecting={selectedIds.size > 0 || undefined}
      className="group/board -mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0"
      style={height === undefined ? undefined : { height }}
      onKeyDown={clearOnEscape}
      {...marquee.handlers}
    >
      {marquee.rect && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-50 rounded-sm border border-primary/60 bg-primary-tint/40"
          style={marquee.rect}
        />
      )}
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
            labels={text}
            status={column.status}
            label={statusLabels[column.status]}
            total={column.total}
            collapsed={collapsed.includes(column.status)}
            onToggleCollapsed={() => onToggleCollapsed(column.status)}
            onSelectAll={
              selection && column.items.length > 0
                ? () => selection.onSelectColumn(column.status)
                : undefined
            }
            allSelected={
              column.items.length > 0 && column.items.every((item) => selectedIds.has(item.id))
            }
          >
            {column.loading ? (
              <div className="flex justify-center py-8">
                <Spinner size="sm" className="text-primary" />
              </div>
            ) : column.error && column.items.length === 0 ? (
              <ColumnLoadError onRetry={column.onRetry} labels={text} />
            ) : (
              <>
                {column.items.map((item, index) => (
                  <CardComponent
                    key={item.id}
                    labels={text}
                    id={item.id}
                    status={column.status}
                    index={index}
                    label={getItemLabel(item)}
                    movable={canMove?.(item) ?? false}
                    onOpen={() => onOpen(item)}
                    selected={selectedIds.has(item.id)}
                    onSelect={selection && ((mode) => selection.onSelect(item.id, mode))}
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
                {column.error ? (
                  <ColumnLoadError onRetry={column.onRetry} labels={text} />
                ) : (
                  column.hasMore && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground"
                      disabled={column.loadingMore}
                      onClick={column.onLoadMore}
                    >
                      {column.loadingMore && <Spinner size="sm" />}
                      {text.loadMore(column.total - column.items.length)}
                    </Button>
                  )
                )}
              </>
            )}
          </ColumnComponent>
        ))}
      </div>
    </div>
  );
}

function ColumnLoadError({ onRetry, labels }: { onRetry?: () => void; labels: ReportBoardLabels }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-2 rounded-md border border-dashed p-4 text-center"
    >
      <p className="text-xs text-muted-foreground">{labels.loadError}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {labels.retry}
        </Button>
      )}
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
  onSelectAll,
  allSelected = false,
  children,
  ref,
  isDropTarget = false,
  labels,
}: ReportBoardColumnProps & { ref?: Ref<HTMLElement>; isDropTarget?: boolean }) {
  const text = { ...DEFAULT_LABELS, ...labels };
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
    return () => {
      window.clearTimeout(timer);
      setFrozenWidth(null);
    };
  }, [closing]);

  const collapse = (event: MouseEvent<HTMLButtonElement>) => {
    const content = event.currentTarget.closest<HTMLElement>('[data-column-content]');
    setFrozenWidth(content?.offsetWidth ?? null);
    onToggleCollapsed();
  };

  return (
    <section
      ref={ref}
      aria-label={text.columnSummary(label, total, collapsed)}
      className={cn(
        'group/column relative flex min-w-0 flex-col overflow-hidden rounded-lg border bg-muted/50 transition-colors',
        shownExpanded ? 'min-h-48 p-2' : 'py-3',
        isDropTarget && 'border-primary/60 bg-primary-tint'
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
            <div className="flex items-center">
              {onSelectAll && (
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    'size-7 text-muted-foreground focus-visible:opacity-100 md:opacity-0 md:group-hover/column:opacity-100',
                    allSelected && 'text-primary md:opacity-100'
                  )}
                  onClick={onSelectAll}
                  aria-label={allSelected ? text.deselectAll(label) : text.selectAll(label)}
                  aria-pressed={allSelected}
                >
                  <ListChecks />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground"
                onClick={collapse}
                aria-label={text.collapseColumn(label)}
              >
                <ChevronsLeftRight />
              </Button>
            </div>
          </div>
          {/* The scrollbar keeps its width but only shows while the column is hovered or focused. */}
          <div
            data-board-column-scroll
            className={cn(
              '-mx-1 -mb-1 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-1 pb-1',
              // Room under the last card for the floating selection bar.
              'group-data-[selecting]/board:pb-16',
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
            aria-label={text.expandColumn(label)}
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

// A card carrying other selected cards shows their edges behind it, like a pile. Box shadows draw the
// edges because the dragged card is lifted into its own layer, where elements placed behind it would
// paint over its background.
const STACK_OF_TWO =
  'shadow-[6px_6px_0_-1px_var(--card),6px_6px_0_0_color-mix(in_oklab,var(--primary)_60%,transparent),0_12px_20px_-4px_rgb(0_0_0/0.35)]';
const STACK_OF_MORE =
  'shadow-[6px_6px_0_-1px_var(--card),6px_6px_0_0_color-mix(in_oklab,var(--primary)_60%,transparent),12px_12px_0_-1px_var(--card),12px_12px_0_0_color-mix(in_oklab,var(--primary)_60%,transparent),0_12px_20px_-4px_rgb(0_0_0/0.35)]';

// The open button covers the whole card and doubles as the drag handle. Card content sits above
// it without pointer events, so clicks anywhere on the card reach the button.
export function ReportBoardCard({
  id,
  label,
  movable,
  onOpen,
  selected = false,
  onSelect,
  actions,
  children,
  ref,
  handleRef,
  isDragging = false,
  dimmed = false,
  groupCount,
  labels,
}: ReportBoardCardProps & {
  ref?: Ref<HTMLDivElement>;
  handleRef?: Ref<HTMLButtonElement>;
  isDragging?: boolean;
  /** Another selected card is being dragged and this one moves with it */
  dimmed?: boolean;
  /** How many cards a group drag carries, shown on the dragged card */
  groupCount?: number;
}) {
  // Space picks a draggable card up and drops it; the click a button fires when Space is released
  // must not open the card as well.
  const text = { ...DEFAULT_LABELS, ...labels };
  const releasedSpace = useRef(false);
  const draggableByKeyboard = movable && handleRef !== undefined;

  return (
    <Card
      ref={ref}
      data-board-card-id={id}
      className={cn(
        'group relative overflow-visible p-3 shadow-sm transition-[color,background-color,border-color,opacity] hover:border-primary/50',
        movable && handleRef && 'cursor-grab active:cursor-grabbing',
        selected && 'border-primary/60 bg-primary-tint hover:border-primary/60',
        isDragging && 'ring-2 ring-primary/40',
        isDragging && 'shadow-lg',
        isDragging && groupCount === 2 && STACK_OF_TWO,
        isDragging && groupCount !== undefined && groupCount > 2 && STACK_OF_MORE,
        dimmed && 'opacity-40'
      )}
    >
      {groupCount !== undefined && groupCount > 1 && (
        <span
          aria-hidden
          className="pointer-events-none absolute -right-1.5 -top-1.5 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-medium text-primary-foreground"
        >
          {groupCount}
        </span>
      )}
      <button
        ref={handleRef}
        type="button"
        className="absolute inset-0 rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={text.openCard(label, selected)}
        onKeyUp={(event) => {
          if (!draggableByKeyboard || event.key !== ' ') return;
          releasedSpace.current = true;
          window.setTimeout(() => {
            releasedSpace.current = false;
          });
        }}
        onClick={(event) => {
          if (releasedSpace.current) {
            releasedSpace.current = false;
            return;
          }
          if (onSelect && (event.metaKey || event.ctrlKey)) {
            onSelect('toggle');
            return;
          }
          if (onSelect && event.shiftKey) {
            onSelect('range');
            return;
          }
          onOpen();
        }}
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
