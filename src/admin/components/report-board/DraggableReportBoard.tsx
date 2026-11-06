import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from 'react';
import {
  DragDropProvider,
  useDroppable,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/react';
import { Accessibility } from '@dnd-kit/dom';
import { isSortable, useSortable } from '@dnd-kit/react/sortable';
import { REPORT_STATUSES, type ReportStatus } from '@shared/types';
import { boardSensors } from '../../lib/sortable-sensors';
import {
  ReportBoard,
  ReportBoardCard,
  ReportBoardColumn,
  type ReportBoardCardProps,
  type ReportBoardColumnData,
  type ReportBoardColumnProps,
  type ReportBoardItem,
  type ReportBoardProps,
} from './ReportBoard';

const CARD_TYPE = 'report-card';
// Cards win over the column underneath them, so the column only catches drops on its empty area.
const LOW_COLLISION_PRIORITY = 1;

export type BoardOrder = Record<ReportStatus, string[]>;

type PluginList = Exclude<
  NonNullable<ComponentProps<typeof DragDropProvider>['plugins']>,
  (...args: never[]) => unknown
>;

export interface BoardPlacement {
  status: ReportStatus;
  previousId: string | null;
  nextId: string | null;
}

function isReportStatus(value: unknown): value is ReportStatus {
  return typeof value === 'string' && (REPORT_STATUSES as readonly string[]).includes(value);
}

function orderOf<T extends ReportBoardItem>(columns: ReportBoardColumnData<T>[]): BoardOrder {
  const order: BoardOrder = { open: [], in_progress: [], resolved: [], closed: [] };
  for (const column of columns) order[column.status] = column.items.map((item) => item.id);
  return order;
}

function statusOf(order: BoardOrder, id: string): ReportStatus | undefined {
  return REPORT_STATUSES.find((status) => order[status].includes(id));
}

/** Moves a card to an index of a column; returns the same object when nothing changes */
export function moveInOrder(
  order: BoardOrder,
  id: string,
  toStatus: ReportStatus,
  toIndex: number
): BoardOrder {
  const fromStatus = statusOf(order, id);
  if (!fromStatus) return order;
  if (fromStatus === toStatus && order[fromStatus].indexOf(id) === toIndex) return order;
  const next: BoardOrder = { ...order, [fromStatus]: order[fromStatus].filter((x) => x !== id) };
  const target = [...next[toStatus]];
  target.splice(Math.max(0, Math.min(toIndex, target.length)), 0, id);
  next[toStatus] = target;
  return next;
}

/** The column and neighbors of a card, or null when the card is not on the board */
export function placementOf(order: BoardOrder, id: string): BoardPlacement | null {
  const status = statusOf(order, id);
  if (!status) return null;
  const index = order[status].indexOf(id);
  return {
    status,
    previousId: order[status][index - 1] ?? null,
    nextId: order[status][index + 1] ?? null,
  };
}

/**
 * Moves cards so they sit together, in the given order, at a column position. A neighbor that is
 * not in the column puts the cards at the end it was pointing to.
 */
export function moveGroupInOrder(
  order: BoardOrder,
  ids: readonly string[],
  placement: BoardPlacement
): BoardOrder {
  const moving = new Set(ids);
  const next = { ...order };
  for (const status of REPORT_STATUSES) {
    next[status] = order[status].filter((id) => !moving.has(id));
  }
  const target = [...next[placement.status]];
  const previousIndex = placement.previousId ? target.indexOf(placement.previousId) : -1;
  const nextIndex = placement.nextId ? target.indexOf(placement.nextId) : -1;
  const index =
    previousIndex !== -1
      ? previousIndex + 1
      : nextIndex !== -1
        ? nextIndex
        : placement.previousId
          ? target.length
          : 0;
  target.splice(index, 0, ...ids);
  next[placement.status] = target;
  return next;
}

function sameOrder(a: BoardOrder, b: BoardOrder): boolean {
  return REPORT_STATUSES.every((status) => a[status].join(',') === b[status].join(','));
}

function samePlacement(a: BoardPlacement, b: BoardPlacement): boolean {
  return a.status === b.status && a.previousId === b.previousId && a.nextId === b.nextId;
}

const SCREEN_READER_INSTRUCTIONS =
  'To pick up a card, press the space bar. While dragging, use the arrow keys to move it ' +
  'within or between columns. Press space again to drop it, or press escape to cancel. ' +
  'Press enter to open the card.';

/** Where a card sits, read out for screen readers */
function describePlacement(
  order: BoardOrder | null,
  id: string,
  statusLabels: Record<ReportStatus, string>
): string {
  const status = order ? statusOf(order, id) : undefined;
  if (!order || !status) return '';
  const position = order[status].indexOf(id) + 1;
  return `${statusLabels[status]}, position ${position} of ${order[status].length}`;
}

// The column a dragged card has moved into, so the whole column shows where the card will land
// even while the pointer is over other cards rather than the column's empty area.
const DropColumnContext = createContext<ReportStatus | null>(null);

function DroppableColumn(props: ReportBoardColumnProps) {
  const dropColumn = useContext(DropColumnContext);
  const { ref, isDropTarget } = useDroppable({
    id: `report-column-${props.status}`,
    type: 'column',
    accept: CARD_TYPE,
    collisionPriority: LOW_COLLISION_PRIORITY,
    data: { status: props.status },
  });
  return (
    <ReportBoardColumn
      {...props}
      ref={ref}
      isDropTarget={isDropTarget || dropColumn === props.status}
    />
  );
}

// The selected cards that move with the dragged one, so they can show that they come along.
const GroupDragContext = createContext<{ draggedId: string; ids: ReadonlySet<string> } | null>(
  null
);

function SortableCard(props: ReportBoardCardProps) {
  const group = useContext(GroupDragContext);
  const inGroup = group?.ids.has(props.id) ?? false;
  const { ref, handleRef, isDragging } = useSortable({
    id: props.id,
    index: props.index,
    group: props.status,
    type: CARD_TYPE,
    accept: CARD_TYPE,
    disabled: !props.movable,
  });
  return (
    <ReportBoardCard
      {...props}
      ref={ref}
      handleRef={handleRef}
      isDragging={isDragging}
      dimmed={inGroup && props.id !== group?.draggedId}
      groupCount={inGroup && props.id === group?.draggedId ? group.ids.size : undefined}
    />
  );
}

type DraggableReportBoardProps<T extends ReportBoardItem> = Omit<
  ReportBoardProps<T>,
  'ColumnComponent' | 'CardComponent'
> & {
  /** Called when a card is dropped at another column or position */
  onReorder: (item: T, placement: BoardPlacement, origin: BoardPlacement) => void;
  /**
   * Called when a selected card is dropped while other cards are selected too; the cards are in
   * board order and the placement is where the block goes
   */
  onReorderGroup?: (items: T[], placement: BoardPlacement) => void;
};

export function DraggableReportBoard<T extends ReportBoardItem>({
  onReorder,
  onReorderGroup,
  ...props
}: DraggableReportBoardProps<T>) {
  const { columns, statusLabels, getItemLabel, selection, canMove } = props;
  // While dragging, and until the caller's data reflects the drop, the board renders this order.
  const [order, setOrder] = useState<BoardOrder | null>(null);
  const orderRef = useRef<BoardOrder | null>(null);
  const originRef = useRef<BoardOrder | null>(null);
  const awaitingDataRef = useRef<string | null>(null);
  const [dragged, setDragged] = useState<{
    id: string;
    from: ReportStatus;
    group: string[];
  } | null>(null);
  const groupRef = useRef<string[]>([]);

  const itemsById = useMemo(() => {
    const map = new Map<string, T>();
    for (const column of columns) for (const item of column.items) map.set(item.id, item);
    return map;
  }, [columns]);
  const signature = columns
    .map((column) => `${column.status}:${column.items.map((item) => item.id).join(',')}`)
    .join('|');

  const updateOrder = (next: BoardOrder | null) => {
    orderRef.current = next;
    setOrder(next);
  };

  useEffect(() => {
    if (awaitingDataRef.current !== null && awaitingDataRef.current !== signature) {
      awaitingDataRef.current = null;
      updateOrder(null);
    }
  }, [signature]);

  // Announcements are created once with the drag manager, so they read the latest state from refs.
  const announcementState = useRef({ itemsById, statusLabels, getItemLabel });
  announcementState.current = { itemsById, statusLabels, getItemLabel };
  const plugins = useMemo(() => {
    const labelOf = (id: string | number) => {
      const { itemsById: items, getItemLabel: label } = announcementState.current;
      const item = items.get(String(id));
      return item ? label(item) : 'Card';
    };
    const columnOf = (id: string | number) => {
      const status = orderRef.current ? statusOf(orderRef.current, String(id)) : undefined;
      return status ? announcementState.current.statusLabels[status] : 'the board';
    };
    const where = (id: string | number) =>
      describePlacement(orderRef.current, String(id), announcementState.current.statusLabels);
    const accessibility = Accessibility.configure({
      screenReaderInstructions: { draggable: SCREEN_READER_INSTRUCTIONS },
      announcements: {
        dragstart: ({ operation: { source } }: DragStartEvent) => {
          if (!source) return undefined;
          const others = groupRef.current.length - 1;
          const carried =
            others > 0 ? ` and ${others} other selected ${others === 1 ? 'card' : 'cards'}` : '';
          return `Picked up ${labelOf(source.id)}${carried}. ${where(source.id)}.`;
        },
        dragover: ({ operation: { source } }: DragOverEvent) =>
          source ? `${labelOf(source.id)}: ${where(source.id)}.` : undefined,
        dragend: ({ operation: { source }, canceled }: DragEndEvent) => {
          if (!source) return undefined;
          return canceled
            ? `Movement canceled. ${labelOf(source.id)} returned to where it was.`
            : groupRef.current.length > 1
              ? `Dropped ${groupRef.current.length} cards in ${columnOf(source.id)}.`
              : `Dropped ${labelOf(source.id)}. ${where(source.id)}.`;
        },
      },
    });
    return (defaults: PluginList): PluginList =>
      defaults.map((plugin) => (plugin === Accessibility ? accessibility : plugin));
  }, []);

  const handleDragStart = (event: DragStartEvent) => {
    const initial = orderOf(columns);
    originRef.current = initial;
    awaitingDataRef.current = null;
    updateOrder(initial);
    const id = event.operation.source ? String(event.operation.source.id) : null;
    const from = id ? statusOf(initial, id) : undefined;
    const selected = selection?.selectedIds;
    const movable = (cardId: string) => {
      const card = itemsById.get(cardId);
      return card !== undefined && (canMove?.(card) ?? false);
    };
    const group =
      id && onReorderGroup && selected?.has(id)
        ? REPORT_STATUSES.flatMap((status) => initial[status]).filter(
            (cardId) => selected.has(cardId) && movable(cardId)
          )
        : [];
    groupRef.current = group.length > 1 ? group : [];
    setDragged(id && from ? { id, from, group: groupRef.current } : null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    // The board moves cards through React state; dnd-kit must not reorder the DOM itself.
    event.preventDefault();
    const current = orderRef.current;
    const { source, target } = event.operation;
    if (!current || !source || !target || source.id === target.id) return;
    const sourceId = String(source.id);
    const fromStatus = statusOf(current, sourceId);
    if (!fromStatus) return;

    let next = current;
    if (isSortable(target)) {
      const toStatus = statusOf(current, String(target.id));
      if (!toStatus) return;
      let toIndex = current[toStatus].indexOf(String(target.id));
      const shape = target.shape;
      if (toStatus !== fromStatus && shape && event.operation.position.current.y > shape.center.y) {
        toIndex += 1;
      }
      next = moveInOrder(current, sourceId, toStatus, toIndex);
    } else {
      const toStatus = target.data?.status;
      if (isReportStatus(toStatus) && toStatus !== fromStatus) {
        next = moveInOrder(current, sourceId, toStatus, current[toStatus].length);
      }
    }
    if (next !== current) updateOrder(next);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const group = dragged?.group ?? [];
    setDragged(null);
    const final = orderRef.current;
    const origin = originRef.current;
    const sourceId = event.operation.source ? String(event.operation.source.id) : null;
    const item = sourceId ? itemsById.get(sourceId) : undefined;
    const placement = final && sourceId ? placementOf(final, sourceId) : null;
    const from = origin && sourceId ? placementOf(origin, sourceId) : null;

    if (group.length > 1 && sourceId && final && origin && onReorderGroup && !event.canceled) {
      // The dragged card's neighbors among the cards that stay put decide where the block goes.
      const others = new Set(group.filter((cardId) => cardId !== sourceId));
      const staying = { ...final };
      for (const status of REPORT_STATUSES) {
        staying[status] = final[status].filter((cardId) => !others.has(cardId));
      }
      const blockPlacement = placementOf(staying, sourceId);
      const next = blockPlacement ? moveGroupInOrder(origin, group, blockPlacement) : origin;
      const items = group
        .map((cardId) => itemsById.get(cardId))
        .filter((candidate): candidate is T => candidate !== undefined);
      if (!blockPlacement || sameOrder(next, origin) || items.length !== group.length) {
        updateOrder(null);
        return;
      }
      updateOrder(next);
      awaitingDataRef.current = signature;
      onReorderGroup(items, blockPlacement);
      return;
    }

    if (event.canceled || !item || !placement || !from || samePlacement(placement, from)) {
      updateOrder(null);
      return;
    }
    awaitingDataRef.current = signature;
    onReorder(item, placement, from);
  };

  const displayed = order
    ? columns.map((column) => ({
        ...column,
        items: order[column.status]
          .map((id) => itemsById.get(id))
          .filter((item): item is T => item !== undefined),
      }))
    : columns;

  const draggedTo = dragged && order ? statusOf(order, dragged.id) : undefined;
  const dropColumn = dragged && draggedTo !== dragged.from ? (draggedTo ?? null) : null;
  const groupDrag = useMemo(
    () =>
      dragged && dragged.group.length > 1
        ? { draggedId: dragged.id, ids: new Set(dragged.group) }
        : null,
    [dragged]
  );

  return (
    <DragDropProvider
      sensors={boardSensors}
      plugins={plugins}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <DropColumnContext.Provider value={dropColumn}>
        <GroupDragContext.Provider value={groupDrag}>
          <ReportBoard
            {...props}
            columns={displayed}
            ColumnComponent={DroppableColumn}
            CardComponent={SortableCard}
          />
        </GroupDragContext.Provider>
      </DropColumnContext.Provider>
    </DragDropProvider>
  );
}
