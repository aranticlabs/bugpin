import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { fireEvent, within } from '@testing-library/react';
import { http, HttpResponse, delay } from 'msw';
import { api } from '../../api/client';
import { ConversationCard } from '../../components/report-detail/ConversationCard';
import { useReporterMessages } from '../../hooks/useReporterMessages';
import { server } from '../mocks/server';
import { mockConversationMessages } from '../mocks/reporter-messages';
import { renderWithProviders, screen, userEvent, waitFor } from '../utils';
import type { ReporterMessage } from '@shared/types';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function Harness({
  reportId = 'report-1',
  ...props
}: Partial<Omit<React.ComponentProps<typeof ConversationCard>, 'conversation'>>) {
  const conversation = useReporterMessages(reportId);
  return (
    <ConversationCard
      reportId={reportId}
      canEdit
      messagingEnabled
      hasRecipient
      hasOwner
      portalEnabled
      conversation={conversation}
      {...props}
    />
  );
}

let messages: ReporterMessage[];
let sent: unknown[];
let originalCreate: typeof URL.createObjectURL;
let originalRevoke: typeof URL.revokeObjectURL;

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  messages = structuredClone(mockConversationMessages);
  sent = [];
  originalCreate = URL.createObjectURL;
  originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
  server.use(
    http.get('/api/reports/:id/reporter-messages', () =>
      HttpResponse.json({ success: true, messages })
    ),
    http.post('/api/reports/:id/reporter-messages', async ({ request }) => {
      const body = (await request.json()) as { message: string; ccSender?: boolean };
      sent.push(body);
      const message = {
        ...mockConversationMessages[0],
        id: 'new-message',
        message: body.message,
        files: [],
      };
      messages = [...messages, message];
      return HttpResponse.json({ success: true, reporterMessage: message });
    }),
    ...(['hide', 'unhide'] as const).map((action) =>
      http.post(`/api/reports/:id/reporter-messages/:messageId/${action}`, ({ params }) => {
        messages = messages.map((entry) =>
          entry.id === params.messageId
            ? { ...entry, hiddenAt: action === 'hide' ? '2026-11-02T10:00:00Z' : null }
            : entry
        );
        return HttpResponse.json({
          success: true,
          message: messages.find((entry) => entry.id === params.messageId),
        });
      })
    )
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
});

describe('ConversationCard', () => {
  it('shows both authors, media and authenticated file links', async () => {
    renderWithProviders(<Harness />);
    expect(
      await screen.findByRole('article', { name: 'Staff message from Anna Staff' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('article', { name: 'Reporter message from Taylor Reporter' })
    ).toBeInTheDocument();
    const entries = within(screen.getByRole('list', { name: 'Messages' })).getAllByRole('article');
    expect(entries[0]).toHaveTextContent('Could you share more details?');
    expect(entries[1]).toHaveTextContent('Here is a video');
    expect(screen.getByRole('link', { name: 'Download screen.png' })).toHaveAttribute(
      'href',
      '/api/reports/report-1/files/image-file'
    );
    expect(screen.getByLabelText('recording.mp4')).toHaveAttribute('preload', 'metadata');
    expect(screen.getByText('Visible to the reporter in the portal')).toBeInTheDocument();
  });

  it('opens an image using the existing lightbox', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    await user.click(await screen.findByRole('button', { name: 'View screen.png' }));
    expect(screen.getByRole('dialog', { name: 'screen.png' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open in new tab' })).toHaveAttribute(
      'href',
      '/api/reports/report-1/files/image-file'
    );
  });

  it('escapes message markup and links only HTTP URLs', async () => {
    messages[0].message =
      '<img src=x onerror=alert(1)> javascript:alert(1) https://example.com/details';
    renderWithProviders(<Harness />);
    const article = await screen.findByRole('article', { name: 'Staff message from Anna Staff' });
    expect(article).toHaveTextContent('<img src=x onerror=alert(1)>');
    expect(article.querySelector('img[onerror]')).toBeNull();
    const link = within(article).getByRole('link', { name: 'https://example.com/details' });
    expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow');
    expect(link).toHaveAttribute('target', '_blank');
    expect(article.querySelector('a[href^="javascript:"]')).toBeNull();
  });

  it.each([
    ['Visit https://example.com/page.,!?;:', 'https://example.com/page'],
    ['See (https://example.com/page).', 'https://example.com/page'],
    ['See https://example.com/wiki/Function_(math).', 'https://example.com/wiki/Function_(math)'],
    ['See (https://example.com/a_(b)).', 'https://example.com/a_(b)'],
    ['See https://example.com/a_(b(c))).', 'https://example.com/a_(b(c))'],
  ])('keeps punctuation as text in %s', async (text, href) => {
    messages[0].message = text;
    renderWithProviders(<Harness />);
    const article = await screen.findByRole('article', { name: 'Staff message from Anna Staff' });
    expect(within(article).getByRole('link', { name: href })).toHaveAttribute('href', href);
    expect(article.querySelector('p')).toHaveTextContent(text);
  });

  it('clears send and moderation failures when switching reports', async () => {
    server.use(
      http.post('/api/reports/:id/reporter-messages', () =>
        HttpResponse.json({ message: 'Send failed' }, { status: 400 })
      ),
      http.post('/api/reports/:id/reporter-messages/:messageId/hide', () =>
        HttpResponse.json({ message: 'Hide failed' }, { status: 400 })
      )
    );
    const user = userEvent.setup();
    const { rerender } = renderWithProviders(<Harness />);
    await user.type(screen.getByRole('textbox'), 'Reply');
    await user.click(screen.getByRole('button', { name: 'Send Message' }));
    await screen.findByText('Send failed');
    await user.click(screen.getByRole('button', { name: 'Hide message from Anna Staff' }));
    await screen.findByText('Hide failed');
    rerender(<Harness reportId="report-2" />);
    await screen.findByRole('article', { name: 'Staff message from Anna Staff' });
    expect(screen.queryByText('Send failed')).not.toBeInTheDocument();
    expect(screen.queryByText('Hide failed')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeEnabled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('discards a pending send failure after switching reports', async () => {
    let started = false;
    server.use(
      http.post('/api/reports/:id/reporter-messages', async () => {
        started = true;
        await delay(100);
        return HttpResponse.json({ message: 'Old report failure' }, { status: 400 });
      })
    );
    const user = userEvent.setup();
    const { rerender, queryClient } = renderWithProviders(<Harness />);
    await user.type(screen.getByRole('textbox'), 'Reply');
    await user.click(screen.getByRole('button', { name: 'Send Message' }));
    await waitFor(() => expect(started).toBe(true));
    rerender(<Harness reportId="report-2" />);
    await waitFor(() => expect(screen.getByRole('textbox')).toBeEnabled());
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(screen.queryByText('Old report failure')).not.toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('sends trimmed text and the CC flag through the legacy JSON path', async () => {
    const user = userEvent.setup();
    const { queryClient } = renderWithProviders(<Harness />);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    await user.type(screen.getByRole('textbox', { name: 'Message to reporter' }), '  A reply  ');
    await user.click(screen.getByRole('checkbox', { name: 'Send me a copy' }));
    await user.click(screen.getByRole('button', { name: 'Send Message' }));
    await waitFor(() => expect(sent).toEqual([{ message: 'A reply', ccSender: true }]));
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue(''));
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(await screen.findByText('A reply')).toBeInTheDocument();
    for (const key of [
      ['reporterMessages', 'report-1'],
      ['report', 'report-1'],
      ['reports'],
      ['dashboard'],
      ['gamification', 'me'],
    ]) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: key });
    }
  });

  it('sends a file-only multipart message and clears the selected files', async () => {
    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValue({ data: { reporterMessage: messages[0] } });
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Attach files' }));
    await user.upload(
      screen.getByTestId('file-dropzone-input'),
      new window.File(['image'], 'attachment.png', { type: 'image/png' })
    );
    await user.click(screen.getByRole('button', { name: 'Send Message' }));
    await waitFor(() => expect(post).toHaveBeenCalledOnce());
    const [path, body, config] = post.mock.calls[0];
    expect(path).toBe('/reports/report-1/reporter-messages');
    expect(body).toBeInstanceOf(FormData);
    const form = body as FormData;
    expect(form.get('message')).toBe('');
    expect(form.get('ccSender')).toBe('false');
    expect((form.get('files[]') as File).name).toBe('attachment.png');
    expect(config?.headers).toEqual({ 'Content-Type': 'multipart/form-data' });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Attach files' })).toHaveAttribute(
        'aria-expanded',
        'false'
      )
    );
  });

  it('preserves text, CC and attachments when sending fails', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(new Error('Daily upload limit reached'));
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    await user.type(screen.getByRole('textbox'), 'Keep this draft');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Attach files' }));
    await user.upload(
      screen.getByTestId('file-dropzone-input'),
      new window.File(['image'], 'draft.png', { type: 'image/png' })
    );
    await user.click(screen.getByRole('button', { name: 'Send Message' }));
    expect(await screen.findByText('Daily upload limit reached')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('Keep this draft');
    expect(screen.getByRole('checkbox')).toBeChecked();
    expect(screen.getByRole('button', { name: 'Attach files (1)' })).toBeInTheDocument();
    expect(screen.getByText('draft.png')).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('rejects a sixth file and oversized files before submitting', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness maxImageMb={0.000001} />);
    await user.click(screen.getByRole('button', { name: 'Attach files' }));
    const input = screen.getByTestId('file-dropzone-input');
    fireEvent.change(input, {
      target: {
        files: Array.from(
          { length: 6 },
          (_, i) => new window.File(['x'], `${i}.png`, { type: 'image/png' })
        ),
      },
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Attach up to 5 files');
    fireEvent.change(input, {
      target: { files: [new window.File(['image'], 'too-large.png', { type: 'image/png' })] },
    });
    expect(screen.getByRole('alert')).toHaveTextContent('too-large.png exceeds');
    expect(screen.getByRole('button', { name: 'Send Message' })).toBeDisabled();
    expect(sent).toEqual([]);
  });

  it('hides and unhides a message while retaining its files for staff', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    await user.click(await screen.findByRole('button', { name: 'Hide message from Anna Staff' }));
    expect(await screen.findByText('Hidden from reporter')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Download screen.png' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Unhide message from Anna Staff' }));
    await waitFor(() => expect(screen.queryByText('Hidden from reporter')).not.toBeInTheDocument());
  });

  it('shows moderation failures and leaves the message visible', async () => {
    server.use(
      http.post('/api/reports/:id/reporter-messages/:messageId/hide', () =>
        HttpResponse.json({ message: 'Cannot change visibility' }, { status: 400 })
      )
    );
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    await user.click(await screen.findByRole('button', { name: 'Hide message from Anna Staff' }));
    expect(await screen.findByText('Cannot change visibility')).toBeInTheDocument();
    expect(screen.queryByText('Hidden from reporter')).not.toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('keeps history readable when messaging is disabled', async () => {
    renderWithProviders(<Harness messagingEnabled={false} />);
    expect(await screen.findByText('Could you share more details?')).toBeInTheDocument();
    expect(screen.getByText(/Messaging is disabled for this project/)).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('gives viewers read-only access to the conversation', async () => {
    renderWithProviders(<Harness canEdit={false} />);
    expect(await screen.findByText('Could you share more details?')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Hide message/ })).not.toBeInTheDocument();
  });

  it('shows an empty thread and explains when no recipient exists', async () => {
    messages = [];
    renderWithProviders(<Harness hasRecipient={false} hasOwner={false} portalEnabled={false} />);
    expect(await screen.findByText('No messages yet.')).toBeInTheDocument();
    expect(screen.getByText('This report has no reporter or contact email.')).toBeInTheDocument();
    expect(screen.getByText('Portal disabled for this project')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('loads and retries a failed conversation request', async () => {
    let requests = 0;
    server.use(
      http.get('/api/reports/:id/reporter-messages', () => {
        requests++;
        return requests === 1
          ? HttpResponse.json({ message: 'Not available' }, { status: 400 })
          : HttpResponse.json({ success: true, messages });
      })
    );
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Could you share more details?')).toBeInTheDocument();
  });

  it('shows loading and sending states without accepting duplicate sends', async () => {
    server.use(
      http.get('/api/reports/:id/reporter-messages', async () => {
        await delay(40);
        return HttpResponse.json({ success: true, messages });
      }),
      http.post('/api/reports/:id/reporter-messages', async () => {
        await delay(100);
        return HttpResponse.json({ success: true, reporterMessage: messages[0] });
      })
    );
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading conversation');
    await user.type(screen.getByRole('textbox'), 'Reply');
    await user.click(screen.getByRole('button', { name: 'Send Message' }));
    expect(screen.getByRole('button', { name: 'Sending...' })).toBeDisabled();
    expect(screen.getByRole('textbox')).toBeDisabled();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Send Message' })).toBeInTheDocument()
    );
  });
});
