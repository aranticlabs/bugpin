import { useEffect } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, userEvent, waitFor } from '../utils';
import { ErrorBoundary, useErrorHandler, withErrorBoundary } from '../../components/ErrorBoundary';

function ThrowOnce({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Boom');
  }
  return <div>Recovered</div>;
}

function HookThrower() {
  const handleError = useErrorHandler();
  useEffect(() => {
    handleError(new Error('Hook error'));
  }, [handleError]);
  return <div>Child</div>;
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // Mock clipboard API on navigator
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
        readText: vi.fn(),
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders fallback UI and allows retry/copy', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ErrorBoundary>
        <ThrowOnce shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /show technical details/i }));
    expect(document.querySelector('pre code')).not.toBeNull();

    const copyButton = screen.getByTitle('Copy error details');
    expect(copyButton).toBeInTheDocument();
    // Just verify the button exists and can be clicked
    await user.click(copyButton);

    rerender(
      <ErrorBoundary>
        <ThrowOnce shouldThrow={false} />
      </ErrorBoundary>,
    );

    await user.click(screen.getByRole('button', { name: /try again/i }));
    await waitFor(() => expect(screen.getByText('Recovered')).toBeInTheDocument());
  });

  it('supports hook and HOC helpers', async () => {
    render(
      <ErrorBoundary>
        <HookThrower />
      </ErrorBoundary>,
    );
    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();

    const Wrapped = withErrorBoundary(
      () => {
        throw new Error('Wrapped error');
      },
      <div>Fallback</div>,
    );
    render(<Wrapped />);
    expect(await screen.findByText('Fallback')).toBeInTheDocument();
  });
});
