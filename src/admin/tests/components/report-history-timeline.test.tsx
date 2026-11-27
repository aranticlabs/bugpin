import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReportHistoryTimeline } from '../../components/report/ReportHistoryTimeline';
import type { ReportHistoryEntry } from '@shared/types';

function entry(overrides: Partial<ReportHistoryEntry>): ReportHistoryEntry {
  return {
    id: overrides.action ?? 'entry',
    reportId: 'report-1',
    userName: 'Anna Staff',
    action: 'created',
    createdAt: '2026-11-01T10:00:00Z',
    ...overrides,
  };
}

describe('ReportHistoryTimeline', () => {
  it.each<[Partial<ReportHistoryEntry>, string]>([
    [
      { action: 'owner_assigned', newValue: 'rptr_jane', newDisplay: 'jane@example.com' },
      'Anna Staff assigned reporter jane@example.com',
    ],
    [{ action: 'owner_assigned', newValue: 'rptr_jane' }, 'Anna Staff assigned reporter rptr_jane'],
    [
      { action: 'owner_removed', oldValue: 'rptr_jane', oldDisplay: 'jane@example.com' },
      'Anna Staff removed reporter jane@example.com',
    ],
    [{ action: 'owner_removed', oldValue: 'rptr_jane' }, 'Anna Staff removed reporter rptr_jane'],
    [
      { action: 'claimable_set', newValue: 'contact@example.com' },
      'Anna Staff made this report claimable by contact@example.com',
    ],
    [{ action: 'message_hidden' }, 'Anna Staff hid a message from the reporter'],
    [
      { action: 'message_unhidden', userName: undefined },
      'System unhid a message for the reporter',
    ],
  ])('describes %o', (overrides, text) => {
    render(<ReportHistoryTimeline entries={[entry(overrides)]} isLoading={false} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });
});
