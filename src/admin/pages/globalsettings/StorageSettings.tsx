import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../../api/client';
import { licenseApi } from '../../api/license';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { UpgradePrompt } from '../../components/UpgradePrompt';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Progress } from '../../components/ui/progress';
import { Upload, HardDrive, Cloud, CloudOff } from 'lucide-react';
import { Spinner } from '../../components/ui/spinner';
import { Badge } from '../../components/ui/badge';
import type { AppSettings } from '@shared/types';

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

export function StorageSettings() {
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

function StorageSettingsSection() {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    s3Enabled: false,
    s3Config: {
      bucket: '',
      region: '',
      accessKeyId: '',
      secretAccessKey: '',
      endpoint: '',
    },
  });
  const [testing, setTesting] = useState(false);

  // Initialize connection status from localStorage to prevent flicker
  const [connectionStatus, setConnectionStatus] = useState<'online' | 'offline' | 'unknown'>(() => {
    const stored = localStorage.getItem('s3ConnectionStatus');
    return (stored as 'online' | 'offline' | 'unknown') || 'unknown';
  });

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const response = await api.get('/settings');
      return response.data.settings as AppSettings;
    },
  });

  useEffect(() => {
    if (settings) {
      setFormData({
        s3Enabled: settings.s3Enabled || false,
        s3Config: {
          bucket: settings.s3Config?.bucket || '',
          region: settings.s3Config?.region || '',
          accessKeyId: settings.s3Config?.accessKeyId || '',
          secretAccessKey: settings.s3Config?.secretAccessKey || '',
          endpoint: settings.s3Config?.endpoint || '',
        },
      });
    }
  }, [settings]);

  const mutation = useMutation({
    mutationFn: async (data: Partial<AppSettings>) => {
      const response = await api.put('/settings', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['storage-stats'] });
      toast.success('Storage settings saved successfully');
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Failed to save settings');
    },
  });

  const testConnection = async (silent = false) => {
    if (!silent) setTesting(true);
    try {
      const response = await api.post('/storage/s3/test');
      if (response.data.success) {
        if (!silent) toast.success('S3 connection successful!');
        setConnectionStatus('online');
        localStorage.setItem('s3ConnectionStatus', 'online');
      }
    } catch (err: unknown) {
      const error = err as Error & { response?: { data?: { message?: string } } };
      if (!silent) toast.error(error.response?.data?.message || 'Failed to connect to S3');
      setConnectionStatus('offline');
      localStorage.setItem('s3ConnectionStatus', 'offline');
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(formData);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12">
          <Spinner className="mx-auto text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <CardTitle>Storage Settings</CardTitle>
            <CardDescription>
              Configure S3-compatible storage for screenshots and attachments
            </CardDescription>
          </div>
          {settings?.s3Enabled &&
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
            ))}
        </div>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-4">
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
              checked={formData.s3Enabled}
              onCheckedChange={(checked) => setFormData({ ...formData, s3Enabled: checked })}
            />
          </div>

          {formData.s3Enabled && (
            <>
              <div className="space-y-2">
                <Label htmlFor="s3-bucket">Bucket Name</Label>
                <Input
                  id="s3-bucket"
                  value={formData.s3Config.bucket}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      s3Config: { ...formData.s3Config, bucket: e.target.value },
                    })
                  }
                  placeholder="my-bugpin-bucket"
                  required={formData.s3Enabled}
                />
                <p className="text-sm text-muted-foreground">The name of your S3 bucket</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="s3-region">Region</Label>
                <Input
                  id="s3-region"
                  value={formData.s3Config.region}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      s3Config: { ...formData.s3Config, region: e.target.value },
                    })
                  }
                  placeholder="us-east-1"
                  required={formData.s3Enabled}
                />
                <p className="text-sm text-muted-foreground">
                  AWS region or S3-compatible service region
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="s3-access-key">Access Key ID</Label>
                <Input
                  id="s3-access-key"
                  value={formData.s3Config.accessKeyId}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      s3Config: { ...formData.s3Config, accessKeyId: e.target.value },
                    })
                  }
                  placeholder="AKIAIOSFODNN7EXAMPLE"
                  required={formData.s3Enabled}
                />
                <p className="text-sm text-muted-foreground">
                  Your AWS access key ID or equivalent
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="s3-secret-key">Secret Access Key</Label>
                <Input
                  id="s3-secret-key"
                  type="password"
                  value={formData.s3Config.secretAccessKey}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      s3Config: { ...formData.s3Config, secretAccessKey: e.target.value },
                    })
                  }
                  placeholder="Enter secret access key"
                  required={formData.s3Enabled}
                />
                <p className="text-sm text-muted-foreground">
                  Your AWS secret access key or equivalent
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="s3-endpoint">Custom Endpoint (Optional)</Label>
                <Input
                  id="s3-endpoint"
                  value={formData.s3Config.endpoint}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      s3Config: { ...formData.s3Config, endpoint: e.target.value },
                    })
                  }
                  placeholder="https://s3.example.com"
                />
                <p className="text-sm text-muted-foreground">
                  For S3-compatible services (MinIO, DigitalOcean Spaces, etc.). Leave blank for AWS
                  S3.
                </p>
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={mutation.isPending}>
                  {mutation.isPending ? (
                    <>
                      <Spinner size="sm" className="mr-2" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => testConnection()}
                  disabled={testing}
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
              </div>
            </>
          )}

          {!formData.s3Enabled && (
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          )}
        </CardContent>
      </form>
    </Card>
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

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const response = await api.get('/settings');
      return response.data.settings as AppSettings;
    },
  });

  const s3Enabled = settings?.s3Enabled || false;
  const hasLocalFiles = (stats?.localFiles || 0) > 0;

  useEffect(() => {
    // Connect to SSE stream for progress updates
    if (s3Enabled) {
      eventSourceRef.current = new EventSource('/api/storage/migration/stream');

      eventSourceRef.current.addEventListener('progress', (event) => {
        const data = JSON.parse(event.data) as MigrationProgress;
        setProgress(data);
      });

      eventSourceRef.current.onerror = () => {
        // Reconnect will happen automatically
      };

      return () => {
        eventSourceRef.current?.close();
      };
    }

    return undefined;
  }, [s3Enabled]);

  const startMigration = async () => {
    try {
      const response = await api.post('/storage/migrate', { deleteLocalAfterUpload: deleteLocal });
      if (response.data.success) {
        toast.success('Migration started');
        queryClient.invalidateQueries({ queryKey: ['storage-stats'] });
      }
    } catch (err: unknown) {
      const error = err as Error & { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed to start migration');
    }
  };

  const cancelMigration = async () => {
    try {
      const response = await api.post('/storage/migrate/cancel');
      if (response.data.success) {
        toast.info('Migration cancelled');
      }
    } catch (err: unknown) {
      const error = err as Error & { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed to cancel migration');
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
    <Card>
      <CardHeader>
        <CardTitle>Storage Migration</CardTitle>
        <CardDescription>Migrate existing files from local storage to S3</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
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
              <span>✅ {progress.successCount} succeeded</span>
              <span>❌ {progress.failureCount} failed</span>
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
            <div className="flex items-center justify-between rounded-lg border p-4">
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
          <Button onClick={cancelMigration} variant="destructive" className="w-full">
            Cancel Migration
          </Button>
        )}

        {!hasLocalFiles && !isRunning && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-600">
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
      </CardContent>
    </Card>
  );
}
