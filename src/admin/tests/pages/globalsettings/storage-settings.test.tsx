import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithQuery, screen, userEvent, waitFor } from '../../utils';
import { StorageSettings } from '../../../pages/globalsettings/StorageSettings';
import { server } from '../../mocks/server';
import { http, HttpResponse } from 'msw';
import { api } from '../../../api/client';
import { toast } from 'sonner';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

const licenseApiMocks = vi.hoisted(() => ({
  getFeatures: vi.fn(),
}));

vi.mock('../../../api/license', () => ({
  licenseApi: licenseApiMocks,
}));

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  listeners: Record<string, (event: MessageEvent) => void> = {};
  onerror: ((this: EventSource, ev: Event) => any) | null = null;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    this.listeners[type] = listener as (event: MessageEvent) => void;
  }

  close() {}

  emit(type: string, data: unknown) {
    const handler = this.listeners[type];
    if (handler) {
      handler({ data: JSON.stringify(data) } as MessageEvent);
    }
  }
}

describe('StorageSettings', () => {
  const originalEventSource = global.EventSource;

  beforeEach(() => {
    localStorage.clear();
    MockEventSource.instances = [];
    global.EventSource = MockEventSource as unknown as typeof EventSource;

    licenseApiMocks.getFeatures.mockResolvedValue({
      features: {
        'custom-branding': true,
        's3-storage': true,
        'webhooks': true,
        'api-access': true,
        'custom-email-templates': true,
        'white-label': true,
      },
    });

    server.use(
      http.get('/api/settings', () => {
        return HttpResponse.json({
          success: true,
          settings: {
            s3Enabled: true,
            s3Config: {
              bucket: 'bugpin-bucket',
              region: 'us-east-1',
              accessKeyId: 'AKIA123',
              secretAccessKey: 'secret',
              endpoint: '',
            },
          },
        });
      }),
      http.get('/api/storage/stats', () => {
        return HttpResponse.json({
          success: true,
          stats: {
            totalFiles: 10,
            localFiles: 5,
            s3Files: 5,
            totalSizeBytes: 1024 * 1024 * 12,
          },
        });
      }),
      http.post('/api/storage/s3/test', () => {
        return HttpResponse.json({ success: true });
      }),
      http.post('/api/storage/migrate', () => {
        return HttpResponse.json({ success: true });
      }),
      http.post('/api/storage/migrate/cancel', () => {
        return HttpResponse.json({ success: true });
      }),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
    global.EventSource = originalEventSource;
  });

  it('tests connection and shows storage stats', async () => {
    const user = userEvent.setup();
    const postSpy = vi.spyOn(api, 'post');

    renderWithQuery(<StorageSettings />);

    expect(await screen.findByText('Storage Settings')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Storage Migration')).toBeInTheDocument();
    });

    const testButton = screen.getByRole('button', { name: /test connection/i });
    await user.click(testButton);

    await waitFor(() => {
      const called = postSpy.mock.calls.some((call) => call[0] === '/storage/s3/test');
      expect(called).toBe(true);
      expect(toast.success).toHaveBeenCalled();
    });

    expect(screen.getByText('Local Files')).toBeInTheDocument();
    expect(screen.getByText('S3 Files')).toBeInTheDocument();
  });

  it('starts migration, tracks progress, and allows cancel', async () => {
    const user = userEvent.setup();
    renderWithQuery(<StorageSettings />);

    await screen.findByText('Storage Migration');

    const deleteLocalSwitch = screen.getByRole('switch', {
      name: /delete local files after upload/i,
    });
    await user.click(deleteLocalSwitch);

    expect(screen.getByText(/local files will be permanently deleted/i)).toBeInTheDocument();

    const startButton = screen.getByRole('button', { name: /start migration/i });
    await user.click(startButton);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Migration started');
    });

    const eventSource = MockEventSource.instances[0];
    eventSource.emit('progress', {
      status: 'running',
      totalFiles: 10,
      processedFiles: 3,
      successCount: 3,
      failureCount: 0,
      errors: [],
    });

    await waitFor(() => {
      expect(screen.getByText(/migrating files/i)).toBeInTheDocument();
    });

    const cancelButton = screen.getByRole('button', { name: /cancel migration/i });
    await user.click(cancelButton);

    await waitFor(() => {
      expect(toast.info).toHaveBeenCalledWith('Migration cancelled');
    });
  });
});
