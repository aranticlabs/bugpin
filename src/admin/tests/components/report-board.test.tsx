import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReportStatus } from '@shared/types';
import { ReportBoard, type ReportBoardColumnData } from '../../components/report-board/ReportBoard';
import {
  DraggableReportBoard,
  moveInOrder,
  placementOf,
  type BoardOrder,
} from '../../components/report-board/DraggableReportBoard';
import { ReportViewSwitcher } from '../../components/report-board/ReportViewSwitcher';

interface Item {
  id: string;
  status: ReportStatus;
  title: string;
}

const labels: Record<ReportStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

function column(
  status: ReportStatus,
  items: Item[],
  overrides: Partial<ReportBoardColumnData<Item>> = {}
): ReportBoardColumnData<Item> {
  return {
    status,
    items,
    total: items.length,
    loading: false,
    loadingMore: false,
    hasMore: false,
    onLoadMore: vi.fn(),
    ...overrides,
  };
}

const crash: Item = { id: 'r1', status: 'open', title: 'Crash on save' };
const typo: Item = { id: 'r2', status: 'in_progress', title: 'Typo in footer' };

function boardProps(columns: ReportBoardColumnData<Item>[]) {
  return {
    columns,
    statusLabels: labels,
    collapsed: [] as ReportStatus[],
    onToggleCollapsed: vi.fn(),
    getItemLabel: (item: Item) => item.title,
    renderCard: (item: Item) => <p>{item.title}</p>,
    onOpen: vi.fn(),
  };
}

describe('ReportBoard', () => {
  it('renders one column per status with its server total', () => {
    render(
      <ReportBoard
        {...boardProps([
          column('open', [crash], { total: 12 }),
          column('in_progress', [typo]),
          column('resolved', []),
        ])}
      />
    );

    expect(screen.getByRole('region', { name: 'Open, 12 reports' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'In Progress, 1 report' })).toBeInTheDocument();
    const resolved = screen.getByRole('region', { name: 'Resolved, 0 reports' });
    expect(within(resolved).getByText('No reports')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /^Closed/ })).not.toBeInTheDocument();
  });

  it('opens a report when its card is clicked', async () => {
    const user = userEvent.setup();
    const props = boardProps([column('open', [crash])]);
    render(<ReportBoard {...props} />);

    await user.click(screen.getByRole('button', { name: 'Open Crash on save' }));

    expect(props.onOpen).toHaveBeenCalledWith(crash);
  });

  it('loads more cards and shows how many remain', async () => {
    const user = userEvent.setup();
    const onLoadMore = vi.fn();
    render(
      <ReportBoard
        {...boardProps([column('open', [crash], { total: 30, hasMore: true, onLoadMore })])}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Show more (29 remaining)' }));

    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('collapses and expands columns through the handler', async () => {
    const user = userEvent.setup();
    const props = boardProps([column('open', [crash]), column('closed', [], { total: 40 })]);
    render(<ReportBoard {...props} collapsed={['closed']} />);

    expect(
      screen.getByRole('region', { name: 'Closed, 40 reports, collapsed' })
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Expand Closed' }));
    await user.click(screen.getByRole('button', { name: 'Collapse Open' }));

    expect(props.onToggleCollapsed).toHaveBeenNthCalledWith(1, 'closed');
    expect(props.onToggleCollapsed).toHaveBeenNthCalledWith(2, 'open');
  });

  it('shows card actions only where the caller provides them', () => {
    render(
      <ReportBoard
        {...boardProps([column('open', [crash]), column('in_progress', [typo])])}
        renderCardActions={(item) =>
          item.id === 'r1' ? <button type="button">Actions</button> : undefined
        }
      />
    );

    expect(screen.getAllByRole('button', { name: 'Actions' })).toHaveLength(1);
  });

  it('renders the cards with drag and drop enabled', () => {
    render(
      <DraggableReportBoard
        {...boardProps([column('open', [crash]), column('in_progress', [typo])])}
        canMove={() => true}
        onReorder={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Open Crash on save' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'In Progress, 1 report' })).toBeInTheDocument();
  });
});

describe('board order helpers', () => {
  const order: BoardOrder = {
    open: ['a', 'b', 'c'],
    in_progress: ['d'],
    resolved: [],
    closed: [],
  };

  it('moves a card within its column', () => {
    expect(moveInOrder(order, 'a', 'open', 2).open).toEqual(['b', 'c', 'a']);
    expect(moveInOrder(order, 'c', 'open', 0).open).toEqual(['c', 'a', 'b']);
  });

  it('moves a card into another column at the given index', () => {
    const next = moveInOrder(order, 'b', 'in_progress', 0);
    expect(next.open).toEqual(['a', 'c']);
    expect(next.in_progress).toEqual(['b', 'd']);
    expect(moveInOrder(order, 'b', 'resolved', 5).resolved).toEqual(['b']);
  });

  it('returns the same order when nothing changes or the card is unknown', () => {
    expect(moveInOrder(order, 'b', 'open', 1)).toBe(order);
    expect(moveInOrder(order, 'x', 'open', 0)).toBe(order);
  });

  it('describes a card by its column and neighbors', () => {
    expect(placementOf(order, 'b')).toEqual({ status: 'open', previousId: 'a', nextId: 'c' });
    expect(placementOf(order, 'd')).toEqual({
      status: 'in_progress',
      previousId: null,
      nextId: null,
    });
    expect(placementOf(order, 'x')).toBeNull();
  });
});

describe('ReportViewSwitcher', () => {
  it('reports the chosen view', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ReportViewSwitcher value="list" onChange={onChange} />);

    expect(screen.getByRole('tab', { name: 'List' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('tab', { name: 'Board' }));

    expect(onChange).toHaveBeenCalledWith('board');
  });
});
