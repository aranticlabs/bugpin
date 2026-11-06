import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DragDropProvider,
  useDroppable,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/react';
import { isSortable, useSortable } from '@dnd-kit/react/sortable';
import { REPORT_STATUSES, type ReportStatus } from '@shared/types';
import { pointerSensors } from '../../lib/sortable-sensors';
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

function samePlacement(a: BoardPlacement, b: BoardPlacement): boolean {
  return a.status === b.status && a.previousId === b.previousId && a.nextId === b.nextId;
}

function DroppableColumn(props: ReportBoardColumnProps) {
  const { ref, isDropTarget } = useDroppable({
    id: `report-column-${props.status}`,
    type: 'column',
    accept: CARD_TYPE,
    collisionPriority: LOW_COLLISION_PRIORITY,
    data: { status: props.status },
  });
  return <ReportBoardColumn {...props} ref={ref} isDropTarget={isDropTarget} />;
}

function SortableCard(props: ReportBoardCardProps) {
  const { ref, handleRef, isDragging } = useSortable({
    id: props.id,
    index: props.index,
    group: props.status,
    type: CARD_TYPE,
    accept: CARD_TYPE,
    disabled: !props.movable,
  });
  return <ReportBoardCard {...props} ref={ref} handleRef={handleRef} isDragging={isDragging} />;
}

type DraggableReportBoardProps<T extends ReportBoardItem> = Omit<
  ReportBoardProps<T>,
  'ColumnComponent' | 'CardComponent'
> & {
  /** Called when a card is dropped at another column or position */
  onReorder: (item: T, placement: BoardPlacement, origin: BoardPlacement) => void;
};

export function DraggableReportBoard<T extends ReportBoardItem>({
  onReorder,
  ...props
}: DraggableReportBoardProps<T>) {
  const { columns } = props;
  // While dragging, and until the caller's data reflects the drop, the board renders this order.
  const [order, setOrder] = useState<BoardOrder | null>(null);
  const orderRef = useRef<BoardOrder | null>(null);
  const originRef = useRef<BoardOrder | null>(null);
  const awaitingDataRef = useRef<string | null>(null);

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

  const handleDragStart = () => {
    const initial = orderOf(columns);
    originRef.current = initial;
    awaitingDataRef.current = null;
    updateOrder(initial);
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
    const final = orderRef.current;
    const origin = originRef.current;
    const sourceId = event.operation.source ? String(event.operation.source.id) : null;
    const item = sourceId ? itemsById.get(sourceId) : undefined;
    const placement = final && sourceId ? placementOf(final, sourceId) : null;
    const from = origin && sourceId ? placementOf(origin, sourceId) : null;

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

  return (
    <DragDropProvider
      sensors={pointerSensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <ReportBoard
        {...props}
        columns={displayed}
        ColumnComponent={DroppableColumn}
        CardComponent={SortableCard}
      />
    </DragDropProvider>
  );
}
