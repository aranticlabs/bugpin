import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  ReportPriorityIcon,
  ReportPriorityLabel,
  ReportStatusLabel,
} from '../../components/report/ReportStatusPriority';

describe('report status and priority labels', () => {
  it('shows the status name next to a decorative icon', () => {
    const { container } = render(<ReportStatusLabel status="in_progress" />);

    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('uses a custom status label when given one', () => {
    render(<ReportStatusLabel status="in_progress" label="In progress" />);

    expect(screen.getByText('In progress')).toBeInTheDocument();
  });

  it('shows the priority in normal case', () => {
    render(<ReportPriorityLabel priority="highest" />);

    expect(screen.getByText('Highest')).toBeInTheDocument();
    expect(screen.queryByText('HIGHEST')).not.toBeInTheDocument();
  });

  it('names the priority of an icon-only priority', () => {
    render(<ReportPriorityIcon priority="medium" />);

    expect(screen.getByRole('img', { name: 'Medium priority' })).toBeInTheDocument();
  });

  it('falls back to the raw value for unknown statuses and priorities', () => {
    const { container } = render(
      <>
        <ReportStatusLabel status="archived" />
        <ReportPriorityLabel priority="urgent" />
        <ReportPriorityIcon priority="urgent" />
      </>
    );

    expect(screen.getByText('archived')).toBeInTheDocument();
    expect(screen.getByText('urgent')).toBeInTheDocument();
    expect(container.querySelectorAll('svg')).toHaveLength(0);
  });
});
