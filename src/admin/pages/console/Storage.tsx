import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../../api/client';
import { licenseApi } from '../../api/license';
import { Card, CardContent } from '../../components/ui/card';
import { SettingsCard } from '../../components/ui/settings-card';
import { UpgradePrompt } from '../../components/UpgradePrompt';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Progress } from '../../components/ui/progress';
import { Upload, HardDrive, Cloud, CloudOff } from 'lucide-react';
import { Spinner } from '../../components/ui/spinner';
import { Badge } from '../../components/ui/badge';
import { cn } from '../../lib/utils';
import type { AppSettings } from '@shared/types';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';
import {
  useDraft,
  useSettings,
  useUpdateSettings,
  type SettingsUpdate,
} from '../../hooks/useSettings';
import { apiErrorMessage } from '../../lib/apiError';

interface StorageStats {
  totalFiles: number;
  localFiles: number;
  s3Files: number;
  totalSizeBytes: number;
}

interface MigrationProgress {
  status: 'idle' | 'running' | 'paused' | 'completed' | 'failed';
  totalFiles: number;
  processedFiles: number;
  successCount: number;
  failureCount: number;
  currentFile?: string;
  errors: Array<{ fileId: string; filename: string; error: string; timestamp: string }>;
  startedAt?: string;
  completedAt?: string;
}

export function Storage() {
  const { data: featureStatus, isLoading } = useQuery({
    queryKey: ['license-features'],
    queryFn: licenseApi.getFeatures,
  });

  const isLicensed = featureStatus?.features?.['s3-storage'] ?? false;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12">
          <Spinner className="mx-auto text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (!isLicensed) {
    return (
      <UpgradePrompt
        feature="s3-storage"
        title="S3 Storage"
        description="Store screenshots and attachments in S3-compatible object storage. Supports AWS S3, MinIO, DigitalOcean Spaces, and more."
      />
    );
  }

  return (
    <div className="space-y-6">
      <StorageSettingsSection />
      <MigrationSection />
    </div>
  );
}

type ConnectionStatus = 'online' | 'offline' | 'unknown';

const CONNECTION_STATUS_KEY = 's3ConnectionStatus';

function readConnectionStatus(): ConnectionStatus {
  try {
    const stored = localStorage.getItem(CONNECTION_STATUS_KEY);
    return stored === 'online' || stored === 'offline' ? stored : 'unknown';
  } catch {
    return 'unknown';
  }
}

function storeConnectionStatus(status: ConnectionStatus) {
  try {
    localStorage.setItem(CONNECTION_STATUS_KEY, status);
  } catch {
    // The status is only a hint to avoid flicker, so it is fine when storage is unavailable.
  }
}

interface StorageForm {
  s3Enabled: boolean;
  bucket: string;
  region: string;
  accessKeyId: string;
  /** Empty unless the admin types a new key. The stored key is never loaded. */
  secretAccessKey: string;
  endpoint: string;
}

function toStorageForm(settings: AppSettings): StorageForm {
  return {
    s3Enabled: settings.s3Enabled || false,
    bucket: settings.s3Config?.bucket || '',
    region: settings.s3Config?.region || '',
    accessKeyId: settings.s3Config?.accessKeyId || '',
    secretAccessKey: '',
    endpoint: settings.s3Config?.endpoint || '',
  };
}

function toUpdate({ s3Enabled, ...s3Config }: Partial<StorageForm>): SettingsUpdate {
  return {
    ...(s3Enabled !== undefined && { s3Enabled }),
    ...(Object.keys(s3Config).length > 0 && { s3Config }),
  };
}

const CONFIG_FIELDS: {
  key: Exclude<keyof StorageForm, 's3Enabled'>;
  id: string;
  label: string;
  placeholder: string;
  help: string;
  required: boolean;
}[] = [
  {
    key: 'bucket',
    id: 's3-bucket',
    label: 'Bucket Name',
    placeholder: 'my-bugpin-bucket',
    help: 'The name of your S3 bucket',
    required: true,
  },
  {
    key: 'region',
    id: 's3-region',
    label: 'Region',
    placeholder: 'us-east-1',
    help: 'AWS region or S3-compatible service region',
    required: true,
  },
  {
    key: 'accessKeyId',
    id: 's3-access-key',
    label: 'Access Key ID',
    placeholder: 'AKIAIOSFODNN7EXAMPLE',
    help: 'Your AWS access key ID or equivalent',
    required: true,
  },
];

function StorageSettingsSection() {
  const { data: settings, isLoading } = useSettings();
  const queryClient = useQueryClient();
  const draft = useDraft(settings && toStorageForm(settings));
  const mutation = useUpdateSettings({ successMessage: 'Storage settings saved successfully' });
  const [testing, setTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(readConnectionStatus);

  const updateConnectionStatus = (status: ConnectionStatus) => {
    setConnectionStatus(status);
    storeConnectionStatus(status);
  };

  const testConnection = async (silent = false) => {
    if (!silent) setTesting(true);
    try {
      const response = await api.post('/storage/s3/test');
      if (response.data.success) {
        if (!silent) toast.success('S3 connection successful!');
        updateConnectionStatus('online');
      }
    } catch (error: unknown) {
      if (!silent) toast.error(apiErrorMessage(error, 'Failed to connect to S3'));
      updateConnectionStatus('offline');
    } finally {
      if (!silent) setTesting(false);
    }
  };

  // Test connection when opening the Storage tab
  useEffect(() => {
    if (!settings?.s3Enabled) return;
    testConnection(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.s3Enabled]);

  if (isLoading || !draft.value) {
    return (
      <Card>
        <CardContent className="py-12">
          <Spinner className="mx-auto text-primary" />
        </CardContent>
      </Card>
    );
  }

  const form = draft.value;
  const secretSet = settings?.s3Config?.secretAccessKeySet ?? false;

  const saveChanges = async (update: SettingsUpdate) => {
    try {
      await mutation.mutateAsync(update);
      void queryClient.invalidateQueries({ queryKey: ['storage-stats'] });
      return true;
    } catch {
      return false;
    }
  };

  const save = async () => {
    const saved = await saveChanges(toUpdate(draft.changes));
    if (saved) draft.reset();
    return saved;
  };

  return (
    <SettingsCard
      title="Storage Settings"
      description="Configure S3-compatible storage for screenshots and attachments"
      action={
        settings?.s3Enabled &&
        (connectionStatus === 'online' ? (
          <Badge variant="outline" className="gap-1 status-online">
            <Cloud className="h-3 w-3" />
            Online
          </Badge>
        ) : connectionStatus === 'offline' ? (
          <Badge variant="outline" className="gap-1 status-offline">
            <CloudOff className="h-3 w-3" />
            Offline
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1 status-unknown">
            <CloudOff className="h-3 w-3" />
            Unknown
          </Badge>
        ))
      }
    >
      <UnsavedChangesGuard
        isDirty={draft.isDirty && form.s3Enabled}
        onSave={save}
        onDiscard={draft.reset}
      />
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label htmlFor="s3-enabled" className="text-base">
              Enable S3 Storage
            </Label>
            <p className="text-sm text-muted-foreground">
              Use S3-compatible storage instead of local filesystem
            </p>
          </div>
          <Switch
            id="s3-enabled"
            checked={form.s3Enabled}
            onCheckedChange={(checked) => {
              draft.set('s3Enabled', checked);
              // Switching off saves by itself: the form is locked while S3 is off.
              if (!checked && settings?.s3Enabled) void saveChanges({ s3Enabled: false });
            }}
          />
        </div>

        <div
          aria-disabled={!form.s3Enabled || undefined}
          inert={!form.s3Enabled}
          className={cn('space-y-4', !form.s3Enabled && 'section-disabled')}
        >
          {CONFIG_FIELDS.map((field) => (
            <div key={field.key} className="space-y-2">
              <Label htmlFor={field.id}>{field.label}</Label>
              <Input
                id={field.id}
                value={form[field.key]}
                onChange={(e) => draft.set(field.key, e.target.value)}
                placeholder={field.placeholder}
                required={field.required && form.s3Enabled}
              />
              <p className="text-sm text-muted-foreground">{field.help}</p>
            </div>
          ))}

          <div className="space-y-2">
            <Label htmlFor="s3-secret-key">Secret Access Key</Label>
            <Input
              id="s3-secret-key"
              type="password"
              autoComplete="new-password"
              value={form.secretAccessKey}
              onChange={(e) => draft.set('secretAccessKey', e.target.value)}
              placeholder={secretSet ? 'Saved (leave empty to keep)' : 'Enter secret access key'}
              required={form.s3Enabled && !secretSet}
            />
            <p className="text-sm text-muted-foreground">
              Your AWS secret access key or equivalent
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="s3-endpoint">Custom Endpoint (Optional)</Label>
            <Input
              id="s3-endpoint"
              value={form.endpoint}
              onChange={(e) => draft.set('endpoint', e.target.value)}
              placeholder="https://s3.example.com"
            />
            <p className="text-sm text-muted-foreground">
              For S3-compatible services (MinIO, DigitalOcean Spaces, etc.). Leave blank for AWS S3.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => testConnection()}
            disabled={testing || !form.s3Enabled || draft.isDirty}
            aria-describedby={draft.isDirty ? 's3-test-hint' : undefined}
          >
            {testing ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Testing...
              </>
            ) : (
              'Test Connection'
            )}
          </Button>
          {draft.isDirty && (
            <p id="s3-test-hint" className="text-sm text-muted-foreground">
              Save your changes to test them.
            </p>
          )}
        </div>
      </div>
    </SettingsCard>
  );
}

function MigrationSection() {
  const [progress, setProgress] = useState<MigrationProgress | null>(null);
  const [deleteLocal, setDeleteLocal] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const queryClient = useQueryClient();

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['storage-stats'],
    queryFn: async () => {
      const response = await api.get('/storage/stats');
      return response.data.stats as StorageStats;
    },
  });

  const { data: settings } = useSettings();

  const s3Enabled = settings?.s3Enabled || false;
  const hasLocalFiles = (stats?.localFiles || 0) > 0;

  useEffect(() => {
    // Connect to SSE stream for progress updates
    if (s3Enabled) {
      eventSourceRef.current = new EventSource('/api/storage/migration/stream');

      eventSourceRef.current.addEventListener('progress', (event) => {
        const data = JSON.parse(event.data) as MigrationProgress;
        setProgress(data);
        if (['completed', 'failed', 'paused'].includes(data.status)) {
          void queryClient.invalidateQueries({ queryKey: ['storage-stats'] });
        }
      });

      eventSourceRef.current.onerror = () => {
        // Reconnect will happen automatically
      };

      return () => {
        eventSourceRef.current?.close();
      };
    }

    return undefined;
  }, [s3Enabled, queryClient]);

  const startMigration = async () => {
    try {
      const response = await api.post('/storage/migrate', { deleteLocalAfterUpload: deleteLocal });
      if (response.data.success) {
        toast.success('Migration started');
        queryClient.invalidateQueries({ queryKey: ['storage-stats'] });
      }
    } catch (error: unknown) {
      toast.error(apiErrorMessage(error, 'Failed to start migration'));
    }
  };

  const cancelMigration = async () => {
    try {
      const response = await api.post('/storage/migrate/cancel');
      if (response.data.success) {
        toast.info('Migration cancelled');
      }
    } catch (error: unknown) {
      toast.error(apiErrorMessage(error, 'Failed to cancel migration'));
    }
  };

  if (!s3Enabled) {
    return null;
  }

  if (statsLoading) {
    return (
      <Card>
        <CardContent className="py-12">
          <Spinner className="mx-auto text-primary" />
        </CardContent>
      </Card>
    );
  }

  const migrationProgress =
    progress && progress.totalFiles > 0
      ? Math.round((progress.processedFiles / progress.totalFiles) * 100)
      : 0;

  const isRunning = progress?.status === 'running';

  return (
    <SettingsCard
      title="Storage Migration"
      description="Migrate existing files from local storage to S3"
    >
      <div className="space-y-6">
        {/* Storage Statistics */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg border p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <HardDrive className="h-4 w-4" />
              <span>Local Files</span>
            </div>
            <p className="text-2xl font-bold">{stats?.localFiles || 0}</p>
          </div>
          <div className="rounded-lg border p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Cloud className="h-4 w-4" />
              <span>S3 Files</span>
            </div>
            <p className="text-2xl font-bold">{stats?.s3Files || 0}</p>
          </div>
          <div className="rounded-lg border p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Upload className="h-4 w-4" />
              <span>Total Size</span>
            </div>
            <p className="text-2xl font-bold">
              {((stats?.totalSizeBytes || 0) / 1024 / 1024).toFixed(1)} MB
            </p>
          </div>
        </div>

        {/* Migration Progress */}
        {isRunning && progress && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Migrating files...</span>
              <span>
                {progress.processedFiles} / {progress.totalFiles}
              </span>
            </div>
            <Progress value={migrationProgress} />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{progress.successCount} succeeded</span>
              <span>{progress.failureCount} failed</span>
            </div>
          </div>
        )}

        {/* Errors - shown via toast, but we can still show a summary */}
        {progress && progress.errors.length > 0 && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
            <div className="font-semibold text-destructive">
              Migration errors ({progress.errors.length}):
            </div>
            <ul className="mt-2 space-y-1 text-destructive/80">
              {progress.errors.slice(0, 5).map((error, i) => (
                <li key={i}>
                  • {error.filename}: {error.error}
                </li>
              ))}
              {progress.errors.length > 5 && <li>... and {progress.errors.length - 5} more</li>}
            </ul>
          </div>
        )}

        {/* Migration Controls */}
        {hasLocalFiles && !isRunning && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="delete-local" className="text-base">
                  Delete local files after upload
                </Label>
                <p className="text-sm text-muted-foreground">
                  Removes files from local storage after successful S3 upload
                </p>
              </div>
              <Switch id="delete-local" checked={deleteLocal} onCheckedChange={setDeleteLocal} />
            </div>

            <Button onClick={startMigration} className="w-full">
              <Upload className="h-4 w-4 mr-2" />
              Start Migration ({stats?.localFiles || 0} files)
            </Button>

            {deleteLocal && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
                Warning: Local files will be permanently deleted after upload. Make sure you have
                backups!
              </div>
            )}
          </div>
        )}

        {isRunning && (
          <Button onClick={cancelMigration} variant="outline-destructive" className="w-full">
            Cancel Migration
          </Button>
        )}

        {!hasLocalFiles && !isRunning && (
          <div className="rounded-lg border border-success/30 bg-success/10 p-4 text-sm text-success">
            All files are already stored in S3. No migration needed.
          </div>
        )}

        {/* CLI Alternative */}
        <div className="rounded-lg border bg-muted p-4 text-sm">
          <strong>Alternative:</strong> You can also migrate files using the CLI:
          <pre className="mt-2 p-2 bg-background rounded text-xs">
            cd src/server && bun run scripts/migrate-to-s3.ts
          </pre>
        </div>
      </div>
    </SettingsCard>
  );
}
