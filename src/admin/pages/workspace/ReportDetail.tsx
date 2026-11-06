import { useEffect, useState, type ReactNode } from 'react';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import { readReportOrigin } from '../../lib/reportOrigin';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ScrollArea } from '../../components/ui/scroll-area';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { useIntegrations, useForwardReport } from '../../hooks/useIntegrations';
import { useReporterMessages } from '../../hooks/useReporterMessages';
import { usePreference } from '../../hooks/useUserPreferences';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import {
  ReportPriorityLabel,
  ReportStatusLabel,
} from '../../components/report/ReportStatusPriority';
import { Label } from '../../components/ui/label';
import { Separator } from '../../components/ui/separator';
import { Textarea } from '../../components/ui/textarea';
import { Checkbox } from '../../components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog';
import {
  ChevronLeft,
  ChevronDown,
  Download,
  ExternalLink,
  Send,
  ZoomIn,
  AlertCircle,
  RefreshCw,
  CheckCircle,
  MessageSquare,
} from 'lucide-react';
import { Github } from '../../components/icons/Github';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '../../components/ui/collapsible';
import { Avatar, AvatarFallback, AvatarImage } from '../../components/ui/avatar';
import { Spinner } from '../../components/ui/spinner';
import { formatDate, formatDateTime } from '../../lib/format';
import { cn } from '../../lib/utils';
import { ImageLightbox } from '../../components/report/ImageLightbox';
import {
  activityTypeTone,
  consoleEntryTone,
  networkErrorTone,
} from '../../components/report/logTone';
import {
  buildPermalink,
  defaultExportOptions,
  toPlain,
  type ExportSectionToggles,
} from '../../lib/reportExport';
import { CopySectionButton } from '../../components/report/CopySectionButton';
import { ExportDiagnosticsMenu } from '../../components/report/ExportDiagnosticsMenu';
import { ActivityDialog } from '../../components/report/ActivityDialog';
import { useReportHistory } from '../../hooks/useReportHistory';
import {
  REPORT_STATUSES,
  type AppSettings,
  type Project,
  type Report,
  type ReportPriority,
  type ReportSource,
  type User,
} from '@shared/types';

const UNASSIGNED_VALUE = '__unassigned__';
const PRIORITY_ORDER: ReportPriority[] = ['lowest', 'low', 'medium', 'high', 'highest'];

function SectionTrigger({
  title,
  count,
  standalone = false,
}: {
  title: string;
  /** Shown in parentheses after the title */
  count?: ReactNode;
  /** True when the trigger spans the whole header, with no action button beside it */
  standalone?: boolean;
}) {
  return (
    <CollapsibleTrigger
      className={cn(
        'flex cursor-pointer items-center justify-between p-6 text-left outline-none transition-colors hover:bg-primary-tint focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        standalone ? 'w-full rounded-t-xl' : 'flex-1 rounded-tl-xl'
      )}
    >
      <CardTitle>
        {title}
        {count !== undefined && (
          <span className="ml-2 text-sm font-normal text-muted-foreground">({count})</span>
        )}
      </CardTitle>
      <ChevronDown className="ml-2 h-4 w-4 text-muted-foreground transition-transform duration-200 [[data-state=open]_&]:rotate-180" />
    </CollapsibleTrigger>
  );
}

export function ReportDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const origin = readReportOrigin(useLocation().state);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const mayEdit = user?.role === 'admin' || user?.role === 'editor';

  const [detailsOpen, setDetailsOpen] = usePreference('reportDetailsOpen', true, {
    legacyKey: 'bugpin.report-detail.details-open',
    parseLegacy: (raw) => raw === 'true',
  });
  const [pageInfoOpen, setPageInfoOpen] = usePreference('reportPageInfoOpen', true, {
    legacyKey: 'bugpin.report-detail.page-info-open',
    parseLegacy: (raw) => raw === 'true',
  });
  const [environmentOpen, setEnvironmentOpen] = usePreference('reportEnvironmentOpen', true, {
    legacyKey: 'bugpin.report-detail.environment-open',
    parseLegacy: (raw) => raw === 'true',
  });
  const [reporterMessagesOpen, setReporterMessagesOpen] = usePreference(
    'reportMessagesOpen',
    true,
    {
      legacyKey: 'bugpin.report-detail.reporter-messages-open',
      parseLegacy: (raw) => raw === 'true',
    }
  );

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [viewingImage, setViewingImage] = useState<{ url: string; filename: string } | null>(null);
  const [composeMessage, setComposeMessage] = useState('');
  const [composeCcSender, setComposeCcSender] = useState(false);
  const [resolveMessage, setResolveMessage] = useState('');
  const [resolveCcSender, setResolveCcSender] = useState(false);
  const [showResolveMessage, setShowResolveMessage] = useState(false);
  const [justResolved, setJustResolved] = useState(false);
  const [localStatus, setLocalStatus] = useState<string>('');
  const [localPriority, setLocalPriority] = useState<string>('');
  const [localAssignedTo, setLocalAssignedTo] = useState<string>(UNASSIGNED_VALUE);

  const { data, isLoading, error } = useQuery({
    queryKey: ['report', id],
    queryFn: async () => {
      const response = await api.get(`/reports/${id}`);
      return response.data;
    },
    enabled: !!id,
  });

  const canEdit = mayEdit && !data?.report?.licenseLocked;

  const loadedReportId: string | undefined = data?.report?.id;
  useEffect(() => {
    if (!loadedReportId) return;
    api
      .post(`/reports/${loadedReportId}/views`)
      .then(() => queryClient.invalidateQueries({ queryKey: ['viewed-reports'] }))
      .catch(() => undefined);
  }, [loadedReportId, queryClient]);

  // Load integrations for this report's project
  const { data: integrations } = useIntegrations(data?.report?.projectId);

  const { data: assignableUsers = [] } = useQuery({
    queryKey: ['assignable-users'],
    queryFn: async () => {
      const response = await api.get('/users/assignable');
      return response.data.users as User[];
    },
    enabled: canEdit,
  });

  // Fetch global settings for messaging enabled check
  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const response = await api.get('/settings');
      return response.data.settings as AppSettings;
    },
    enabled: !!data?.report?.projectId,
  });

  // Fetch project for per-project messaging settings
  const { data: projectData } = useQuery({
    queryKey: ['project', data?.report?.projectId],
    queryFn: async () => {
      const response = await api.get(`/projects/${data?.report?.projectId}`);
      return response.data.project as Project;
    },
    enabled: !!data?.report?.projectId,
  });

  // Reporter messages
  const {
    messages: reporterMessages,
    isLoading: messagesLoading,
    sendMessage,
    sendMessageAsync,
    isSending,
  } = useReporterMessages(id ?? '');

  const { data: reportHistory = [], isLoading: historyLoading } = useReportHistory(id);

  const forwardMutation = useForwardReport();

  const retrySyncMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post(`/reports/${id}/retry-sync`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['report', id] });
      toast.success('Sync retry initiated');
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Failed to retry sync');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: {
      status?: string;
      priority?: string;
      assignedTo?: string | null;
    }) => {
      const response = await api.patch(`/reports/${id}`, updates);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['report', id] });
      queryClient.invalidateQueries({ queryKey: ['report-history', id] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['recent-reports'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      toast.success('Report updated successfully');
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Failed to update report');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/reports/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['recent-reports'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      toast.success('Report deleted successfully');
      navigate(origin.path);
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Failed to delete report');
    },
  });

  const serverReport = data?.report as Report | undefined;
  const serverStatus = serverReport?.status;
  const serverPriority = serverReport?.priority;
  const serverAssignedTo = serverReport?.assignedTo;

  useEffect(() => {
    if (serverStatus) setLocalStatus(serverStatus);
  }, [serverStatus]);

  useEffect(() => {
    if (serverPriority) setLocalPriority(serverPriority);
  }, [serverPriority]);

  useEffect(() => {
    setLocalAssignedTo(serverAssignedTo ?? UNASSIGNED_VALUE);
  }, [serverAssignedTo]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" className="text-primary" />
      </div>
    );
  }

  if (error || !data?.report) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Report not found</p>
        <Button variant="outline" onClick={() => navigate(origin.path)} className="mt-4">
          Back to {origin.label}
        </Button>
      </div>
    );
  }

  const { report, files } = data as {
    report: Report;
    files: Array<{ id: string; mimeType: string; filename: string }>;
  };
  const consoleErrors = report.metadata.consoleErrors ?? [];
  const networkErrors = report.metadata.networkErrors ?? [];
  const userActivity = report.metadata.userActivity ?? [];
  const appName = settingsData?.appName || 'BugPin';
  const manualChannel = report.metadata.manualContext?.channel;
  const hasPageInfo = Boolean(
    report.metadata?.url ||
    report.metadata?.title ||
    report.metadata?.referrer ||
    report.metadata?.pageLoadTime ||
    report.metadata?.timezone
  );
  const hasEnvironment = Boolean(
    report.metadata?.browser?.name ||
    report.metadata?.browser?.version ||
    report.metadata?.device?.os ||
    report.metadata?.device?.osVersion ||
    report.metadata?.device?.type ||
    report.metadata?.viewport?.width ||
    report.metadata?.viewport?.height
  );

  const sectionPlain = (section: keyof ExportSectionToggles): string => {
    const base = defaultExportOptions(buildPermalink(report.id));
    const sections: ExportSectionToggles = {
      summary: false,
      environment: false,
      page: false,
      console: false,
      network: false,
      userActivity: false,
      storageKeys: false,
      reporter: false,
    };
    sections[section] = true;
    return toPlain(report, { ...base, sections });
  };

  const messagingEnabled = (() => {
    if (projectData?.settings?.notifyReporter === false) return false;
    const effectiveEmailEnabled =
      projectData?.settings?.reporterNotifications?.emailEnabled ??
      settingsData?.reporterNotifications?.emailEnabled ??
      true;
    if (!effectiveEmailEnabled) return false;
    return (
      projectData?.settings?.reporterNotifications?.messagingEnabled ??
      settingsData?.reporterNotifications?.messagingEnabled ??
      true
    );
  })();

  const handleStatusChange = (value: string) => {
    if (value === report.status) return;
    const previous = localStatus;
    setLocalStatus(value);
    if (
      value === 'resolved' &&
      previous !== 'resolved' &&
      report.reporterEmail &&
      messagingEnabled
    ) {
      setJustResolved(true);
    } else {
      setJustResolved(false);
      setShowResolveMessage(false);
      setResolveMessage('');
      setResolveCcSender(false);
    }
    updateMutation.mutate(
      { status: value },
      {
        onError: () => setLocalStatus(previous),
      }
    );
  };

  const handlePriorityChange = (value: string) => {
    if (value === report.priority) return;
    const previous = localPriority;
    setLocalPriority(value);
    updateMutation.mutate(
      { priority: value },
      {
        onError: () => setLocalPriority(previous),
      }
    );
  };

  const handleAssigneeChange = (value: string) => {
    const nextAssignedTo = value === UNASSIGNED_VALUE ? null : value;
    if ((report.assignedTo ?? null) === nextAssignedTo) return;
    const previous = localAssignedTo;
    setLocalAssignedTo(value);
    updateMutation.mutate(
      { assignedTo: nextAssignedTo },
      {
        onError: () => setLocalAssignedTo(previous),
      }
    );
  };

  const handleSendResolveMessage = async () => {
    if (!resolveMessage.trim()) return;
    try {
      await sendMessageAsync({
        message: resolveMessage.trim(),
        ccSender: resolveCcSender,
      });
      setResolveMessage('');
      setResolveCcSender(false);
      setShowResolveMessage(false);
      setJustResolved(false);
    } catch {
      // Toast error is handled by the hook
    }
  };

  const handleForward = async (integrationId: string, integrationName: string) => {
    if (!id) return;

    try {
      await forwardMutation.mutateAsync({
        reportId: id,
        integrationId,
      });
      toast.success(`Report forwarded to ${integrationName}`);
      queryClient.invalidateQueries({ queryKey: ['report', id] });
    } catch (error) {
      console.error('Failed to forward report:', error);
    }
  };

  const activeIntegrations = integrations?.filter((i) => i.isActive) || [];

  return (
    <div className="space-y-6">
      {report.licenseLocked && (
        <p role="status" className="rounded-md border p-3 text-sm text-muted-foreground">
          This project is read-only because it is not covered by the current license. Its reports
          and files remain available.
        </p>
      )}
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(origin.path)}
            className="mb-2 -ml-2 text-muted-foreground"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back to {origin.label}
          </Button>
          <h1 className="text-2xl font-bold">{report.title}</h1>
        </div>
        <div className="flex gap-2">
          <ActivityDialog entries={reportHistory} isLoading={historyLoading} />
          <ExportDiagnosticsMenu report={report} />
          {canEdit && isAdmin && activeIntegrations.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={forwardMutation.isPending}>
                  {forwardMutation.isPending ? (
                    <>
                      <Spinner size="sm" className="mr-2" />
                      Forwarding...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Forward
                    </>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {activeIntegrations.map((integration) => (
                  <DropdownMenuItem
                    key={integration.id}
                    onClick={() => handleForward(integration.id, integration.name)}
                  >
                    {integration.type === 'github' && 'GitHub: '}
                    {integration.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {canEdit && isAdmin && (
            <Button
              variant="outline-destructive"
              onClick={() => setShowDeleteDialog(true)}
              disabled={deleteMutation.isPending}
            >
              Delete
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Screenshots/Media */}
          {files?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{files.length === 1 ? 'Media' : `Media (${files.length})`}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={cn('grid gap-4', files.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
                  {files.map((file: { id: string; mimeType: string; filename: string }) => {
                    const fileUrl = `/api/reports/${id}/files/${file.id}`;
                    const isVideo = file.mimeType?.startsWith('video/');

                    return (
                      <div key={file.id} className="relative group">
                        {isVideo ? (
                          <video
                            src={fileUrl}
                            controls
                            preload="metadata"
                            className={cn(
                              'w-full rounded-lg border bg-black object-contain',
                              files.length > 1 ? 'max-h-50' : 'max-h-100'
                            )}
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              setViewingImage({
                                url: fileUrl,
                                filename: file.filename || `screenshot-${file.id}.png`,
                              })
                            }
                            className="w-full cursor-zoom-in rounded-lg focus-visible:focus-ring"
                          >
                            <img
                              src={fileUrl}
                              alt={file.filename || 'Screenshot'}
                              className={cn(
                                'w-full rounded-lg border bg-muted object-contain',
                                files.length > 1 ? 'max-h-50' : 'max-h-100'
                              )}
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors rounded-lg flex items-center justify-center">
                              <ZoomIn className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                            </div>
                          </button>
                        )}
                        <a
                          href={fileUrl}
                          download={file.filename || `screenshot-${file.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="absolute top-2 right-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-md bg-black/60 text-white opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:bg-black/80"
                          title="Download"
                          aria-label={`Download ${file.filename || 'screenshot'}`}
                        >
                          <Download className="w-4 h-4" />
                        </a>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Image Lightbox */}
          <ImageLightbox image={viewingImage} onClose={() => setViewingImage(null)} />

          {/* Description */}
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>Description</CardTitle>
              {report.description && (
                <CopySectionButton
                  label="description"
                  getContent={() => report.description ?? ''}
                />
              )}
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-muted-foreground">
                {report.description || 'No description provided'}
              </p>
            </CardContent>
          </Card>

          {/* Console Output */}
          {consoleErrors.length > 0 && (
            <Collapsible>
              <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0 p-0">
                  <SectionTrigger title="Console Output" count={consoleErrors.length} />
                  <div className="pr-3 pl-1">
                    <CopySectionButton
                      label="console output"
                      getContent={() => sectionPlain('console')}
                    />
                  </div>
                </CardHeader>
                <CollapsibleContent>
                  <CardContent className="pt-4">
                    <ScrollArea className="max-h-150" contentClassName="space-y-2 pr-2">
                      {consoleErrors.map(
                        (
                          err: { type: string; message: string; source?: string; line?: number },
                          i: number
                        ) => (
                          <div
                            key={i}
                            className={cn(
                              'rounded-lg px-4 py-2 font-mono text-sm',
                              consoleEntryTone(err.type)
                            )}
                          >
                            <span className="font-semibold uppercase text-xs mr-2">
                              [{err.type}]
                            </span>
                            {err.message}
                            {err.source && (
                              <span className="block text-xs opacity-70 mt-1">
                                {err.source}
                                {err.line && `:${err.line}`}
                              </span>
                            )}
                          </div>
                        )
                      )}
                    </ScrollArea>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          )}

          {/* Network Errors */}
          {networkErrors.length > 0 && (
            <Collapsible>
              <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0 p-0">
                  <SectionTrigger title="Network Errors" count={networkErrors.length} />
                  <div className="pr-3 pl-1">
                    <CopySectionButton
                      label="network errors"
                      getContent={() => sectionPlain('network')}
                    />
                  </div>
                </CardHeader>
                <CollapsibleContent>
                  <CardContent className="space-y-2 pt-4">
                    {networkErrors.map(
                      (
                        err: { url: string; method: string; status: number; statusText: string },
                        i: number
                      ) => (
                        <div
                          key={i}
                          className={cn(
                            'rounded-lg px-4 py-2 font-mono text-sm',
                            networkErrorTone(err.status)
                          )}
                        >
                          <span className="font-semibold">
                            {err.status === 0 ? 'Network Error' : err.status} {err.statusText}
                          </span>
                          <span className="mx-2 opacity-50">|</span>
                          <span className="uppercase text-xs">{err.method}</span>
                          <span className="block text-xs opacity-70 mt-1 break-all">{err.url}</span>
                        </div>
                      )
                    )}
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          )}

          {/* User Activity Trail */}
          {userActivity.length > 0 && (
            <Collapsible>
              <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0 p-0">
                  <SectionTrigger
                    title="User Activity Trail"
                    count={`${userActivity.length} events`}
                  />
                  <div className="pr-3 pl-1">
                    <CopySectionButton
                      label="user activity"
                      getContent={() => sectionPlain('userActivity')}
                    />
                  </div>
                </CardHeader>
                <CollapsibleContent>
                  <CardContent className="pt-4">
                    <ScrollArea className="max-h-120" contentClassName="space-y-2 pr-2">
                      {userActivity.map(
                        (
                          activity: {
                            type: string;
                            text?: string;
                            url?: string;
                            inputType?: string;
                            timestamp: string;
                          },
                          i: number
                        ) => (
                          <div
                            key={i}
                            className="flex items-start gap-3 px-3 py-2 rounded-lg bg-muted/50 text-sm"
                          >
                            <span
                              className={cn(
                                'shrink-0 rounded px-2 py-0.5 text-xs font-medium uppercase',
                                activityTypeTone(activity.type)
                              )}
                            >
                              {activity.type}
                            </span>
                            <div className="flex-1 min-w-0">
                              {activity.type === 'button' && (
                                <span className="font-medium">"{activity.text}"</span>
                              )}
                              {activity.type === 'link' && (
                                <span>
                                  {activity.text && (
                                    <span className="font-medium">"{activity.text}"</span>
                                  )}
                                  {activity.url && (
                                    <span className="ml-1 text-muted-foreground text-xs break-all">
                                      → {activity.url}
                                    </span>
                                  )}
                                </span>
                              )}
                              {activity.type === 'input' && (
                                <span>
                                  <span className="text-muted-foreground">
                                    {activity.inputType}
                                  </span>
                                  {activity.text && (
                                    <span className="ml-1 font-medium">"{activity.text}"</span>
                                  )}
                                </span>
                              )}
                              {activity.type === 'select' && (
                                <span>
                                  {activity.text ? (
                                    <span className="font-medium">"{activity.text}"</span>
                                  ) : (
                                    <span className="text-muted-foreground">dropdown</span>
                                  )}
                                </span>
                              )}
                              {activity.type === 'checkbox' && (
                                <span>
                                  {activity.text ? (
                                    <span className="font-medium">"{activity.text}"</span>
                                  ) : (
                                    <span className="text-muted-foreground">checkbox</span>
                                  )}
                                </span>
                              )}
                              {activity.type === 'other' && activity.text && (
                                <span className="font-medium">"{activity.text}"</span>
                              )}
                            </div>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {formatDateTime(activity.timestamp)}
                            </span>
                          </div>
                        )
                      )}
                    </ScrollArea>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          )}

          {/* Storage Keys */}
          {report.metadata?.storageKeys &&
            (report.metadata.storageKeys.cookies?.length > 0 ||
              report.metadata.storageKeys.localStorage?.length > 0 ||
              report.metadata.storageKeys.sessionStorage?.length > 0) && (
              <Collapsible>
                <Card>
                  <CardHeader className="flex-row items-center justify-between space-y-0 p-0">
                    <SectionTrigger
                      title="Storage Keys"
                      count={
                        (report.metadata.storageKeys.cookies?.length || 0) +
                        (report.metadata.storageKeys.localStorage?.length || 0) +
                        (report.metadata.storageKeys.sessionStorage?.length || 0)
                      }
                    />
                    <div className="pr-3 pl-1">
                      <CopySectionButton
                        label="storage keys"
                        getContent={() => sectionPlain('storageKeys')}
                      />
                    </div>
                  </CardHeader>
                  <CollapsibleContent>
                    <CardContent className="pt-4">
                      <ScrollArea className="max-h-100">
                        <table className="w-full text-sm">
                          <thead className="sticky top-0 bg-background">
                            <tr className="border-b">
                              <th className="text-left py-2 pr-4 font-medium text-muted-foreground">
                                Type
                              </th>
                              <th className="text-left py-2 font-medium text-muted-foreground">
                                Key
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {report.metadata.storageKeys.cookies?.map((key: string, i: number) => (
                              <tr key={`cookie-${i}`} className="border-b border-muted/50">
                                <td className="py-1.5 pr-4">
                                  <Badge variant="outline" className="text-xs">
                                    Cookie
                                  </Badge>
                                </td>
                                <td className="py-1.5 font-mono text-xs break-all">{key}</td>
                              </tr>
                            ))}
                            {report.metadata.storageKeys.localStorage?.map(
                              (key: string, i: number) => (
                                <tr key={`local-${i}`} className="border-b border-muted/50">
                                  <td className="py-1.5 pr-4">
                                    <Badge variant="outline" className="text-xs">
                                      Local
                                    </Badge>
                                  </td>
                                  <td className="py-1.5 font-mono text-xs break-all">{key}</td>
                                </tr>
                              )
                            )}
                            {report.metadata.storageKeys.sessionStorage?.map(
                              (key: string, i: number) => (
                                <tr key={`session-${i}`} className="border-b border-muted/50">
                                  <td className="py-1.5 pr-4">
                                    <Badge variant="outline" className="text-xs">
                                      Session
                                    </Badge>
                                  </td>
                                  <td className="py-1.5 font-mono text-xs break-all">{key}</td>
                                </tr>
                              )
                            )}
                          </tbody>
                        </table>
                      </ScrollArea>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Status & Priority */}
          <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
            <Card>
              <CardHeader className="p-0">
                <SectionTrigger title="Details" standalone />
              </CardHeader>
              <CollapsibleContent>
                <CardContent className="space-y-4 pt-4">
                  <div className="space-y-1">
                    <Label className="text-muted-foreground block">Status</Label>
                    {canEdit ? (
                      <>
                        <Select value={localStatus} onValueChange={handleStatusChange}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {REPORT_STATUSES.map((status) => (
                              <SelectItem key={status} value={status}>
                                <ReportStatusLabel status={status} />
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {justResolved &&
                          localStatus === 'resolved' &&
                          report.reporterEmail &&
                          messagingEnabled && (
                            <div className="mt-2 space-y-2">
                              <Button
                                type="button"
                                variant="link"
                                className="h-auto gap-1 p-0 [&_svg]:size-3"
                                onClick={() => {
                                  setShowResolveMessage(!showResolveMessage);
                                  if (showResolveMessage) setResolveMessage('');
                                }}
                              >
                                <MessageSquare />
                                {showResolveMessage
                                  ? 'Cancel message'
                                  : 'Send a message to the reporter?'}
                              </Button>
                              {showResolveMessage && (
                                <>
                                  <Textarea
                                    placeholder="Optional message to send to the reporter..."
                                    value={resolveMessage}
                                    onChange={(e) => setResolveMessage(e.target.value)}
                                    rows={3}
                                    className="text-sm"
                                  />
                                  <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                                    <Checkbox
                                      checked={resolveCcSender}
                                      onCheckedChange={(checked) =>
                                        setResolveCcSender(checked === true)
                                      }
                                    />
                                    Send me a copy
                                  </label>
                                  <Button
                                    size="sm"
                                    onClick={handleSendResolveMessage}
                                    disabled={!resolveMessage.trim() || isSending}
                                  >
                                    {isSending ? (
                                      <>
                                        <Spinner size="sm" className="mr-2" />
                                        Sending...
                                      </>
                                    ) : (
                                      <>
                                        <Send className="h-4 w-4 mr-2" />
                                        Send Message
                                      </>
                                    )}
                                  </Button>
                                </>
                              )}
                            </div>
                          )}
                      </>
                    ) : (
                      <div>
                        <ReportStatusLabel status={report.status} />
                      </div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground block">Priority</Label>
                    {canEdit ? (
                      <Select value={localPriority} onValueChange={handlePriorityChange}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PRIORITY_ORDER.map((priority) => (
                            <SelectItem key={priority} value={priority}>
                              <ReportPriorityLabel priority={priority} />
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div>
                        <ReportPriorityLabel priority={report.priority} />
                      </div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground block">Assignee</Label>
                    {canEdit ? (
                      <Select value={localAssignedTo} onValueChange={handleAssigneeChange}>
                        <SelectTrigger>
                          <SelectValue>
                            {(() => {
                              if (localAssignedTo === UNASSIGNED_VALUE) {
                                return <span className="text-muted-foreground">Unassigned</span>;
                              }
                              const selected =
                                assignableUsers.find((u) => u.id === localAssignedTo) ??
                                (localAssignedTo === report.assignedTo
                                  ? report.assignee
                                  : undefined);
                              return selected ? (
                                <AssigneeDisplay user={selected} size="sm" />
                              ) : (
                                <span className="text-muted-foreground">Unassigned</span>
                              );
                            })()}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={UNASSIGNED_VALUE}>Unassigned</SelectItem>
                          {assignableUsers.map((assignee) => (
                            <SelectItem
                              key={assignee.id}
                              value={assignee.id}
                              textValue={assignee.name}
                            >
                              <AssigneeDisplay user={assignee} size="sm" />
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <AssigneeDisplay user={report.assignee} showEmail />
                    )}
                  </div>
                  <Separator />
                  <div className="space-y-3 text-sm">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground flex-shrink-0">Source</span>
                      <SourceBadge source={report.source} />
                    </div>
                    {manualChannel && (
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground flex-shrink-0">Channel</span>
                        <span className="capitalize">{manualChannel}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground flex-shrink-0">Created</span>
                      <span>{formatDateTime(report.createdAt)}</span>
                    </div>
                    {(report.reporterEmail || report.reporterName) && (
                      <div className="flex items-start justify-between gap-4">
                        <span className="text-muted-foreground flex-shrink-0">Reporter</span>
                        <div className="text-right min-w-0">
                          {report.reporterName && <p className="truncate">{report.reporterName}</p>}
                          {report.reporterEmail && (
                            <p className="text-muted-foreground truncate">{report.reporterEmail}</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* Page Info */}
          {hasPageInfo && (
            <Collapsible open={pageInfoOpen} onOpenChange={setPageInfoOpen}>
              <Card>
                <CardHeader className="p-0">
                  <SectionTrigger title="Page Info" standalone />
                </CardHeader>
                <CollapsibleContent>
                  <CardContent className="space-y-3 text-sm pt-4">
                    <InfoRow label="URL" value={report.metadata?.url} isLink />
                    <InfoRow label="Page Title" value={report.metadata?.title} />
                    <InfoRow label="Referrer" value={report.metadata?.referrer} isLink />
                    <InfoRow
                      label="Load Time"
                      value={
                        report.metadata?.pageLoadTime
                          ? `${report.metadata.pageLoadTime}ms`
                          : undefined
                      }
                    />
                    <InfoRow label="Timezone" value={report.metadata?.timezone} />
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          )}

          {/* Environment */}
          {hasEnvironment && (
            <Collapsible open={environmentOpen} onOpenChange={setEnvironmentOpen}>
              <Card>
                <CardHeader className="p-0">
                  <SectionTrigger title="Environment" standalone />
                </CardHeader>
                <CollapsibleContent>
                  <CardContent className="space-y-3 text-sm pt-4">
                    <InfoRow
                      label="Browser"
                      value={formatEnvironmentValue(
                        report.metadata?.browser?.name,
                        report.metadata?.browser?.version
                      )}
                    />
                    <InfoRow
                      label="OS"
                      value={formatEnvironmentValue(
                        report.metadata?.device?.os,
                        report.metadata?.device?.osVersion
                      )}
                    />
                    <InfoRow label="Device" value={report.metadata?.device?.type} />
                    <InfoRow
                      label="Viewport"
                      value={
                        report.metadata?.viewport?.width && report.metadata?.viewport?.height
                          ? `${report.metadata.viewport.width}x${report.metadata.viewport.height}`
                          : undefined
                      }
                    />
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          )}

          {report.source === 'manual' && !hasPageInfo && !hasEnvironment && (
            <Card>
              <CardHeader>
                <CardTitle>Manual Report</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-muted-foreground">
                  This report was created manually in {appName} and does not include widget capture
                  data.
                </p>
                {manualChannel && <InfoRow label="Channel" value={manualChannel} />}
              </CardContent>
            </Card>
          )}

          {/* Reporter Messages */}
          {report.reporterEmail && messagingEnabled && (
            <Collapsible open={reporterMessagesOpen} onOpenChange={setReporterMessagesOpen}>
              <Card>
                <CardHeader className="p-0">
                  <CollapsibleTrigger className="flex w-full cursor-pointer items-center justify-between rounded-t-xl p-6 text-left outline-none transition-colors hover:bg-primary-tint focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                    <CardTitle className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      Reporter Messages
                      {reporterMessages.length > 0 && (
                        <Badge variant="secondary" className="ml-1">
                          {reporterMessages.length}
                        </Badge>
                      )}
                    </CardTitle>
                    <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 [[data-state=open]_&]:rotate-180 ml-2" />
                  </CollapsibleTrigger>
                </CardHeader>
                <CollapsibleContent>
                  <CardContent className="space-y-4 pt-4">
                    {/* Compose new message (admin/editor only) */}
                    {canEdit && (
                      <>
                        <div className="space-y-2">
                          <Textarea
                            placeholder="Write a message to the reporter..."
                            value={composeMessage}
                            onChange={(e) => setComposeMessage(e.target.value)}
                            rows={3}
                            disabled={isSending}
                          />
                          <div className="flex items-center justify-between">
                            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                              <Checkbox
                                checked={composeCcSender}
                                onCheckedChange={(checked) => setComposeCcSender(checked === true)}
                                disabled={isSending}
                              />
                              Send me a copy
                            </label>
                            <Button
                              size="sm"
                              onClick={() => {
                                if (composeMessage.trim()) {
                                  sendMessage(
                                    {
                                      message: composeMessage.trim(),
                                      ccSender: composeCcSender,
                                    },
                                    {
                                      onSuccess: () => {
                                        setComposeMessage('');
                                        setComposeCcSender(false);
                                      },
                                    }
                                  );
                                }
                              }}
                              disabled={!composeMessage.trim() || isSending}
                            >
                              {isSending ? (
                                <>
                                  <Spinner size="sm" className="mr-2" />
                                  Sending...
                                </>
                              ) : (
                                <>
                                  <Send className="h-4 w-4 mr-2" />
                                  Send Message
                                </>
                              )}
                            </Button>
                          </div>
                        </div>

                        <Separator />
                      </>
                    )}

                    {/* Message history */}
                    {messagesLoading ? (
                      <div className="flex items-center justify-center py-4">
                        <Spinner size="sm" className="text-muted-foreground" />
                      </div>
                    ) : reporterMessages.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No messages sent yet. Send a message to communicate with the reporter.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {reporterMessages.map((msg) => (
                          <div key={msg.id} className="rounded-lg border bg-muted/30 p-3 space-y-1">
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span className="font-medium">{msg.userName ?? 'System'}</span>
                              <span title={formatDateTime(msg.sentAt)}>
                                {formatRelativeTime(new Date(msg.sentAt))}
                              </span>
                            </div>
                            <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          )}

          {/* Forwarded To */}
          {report.forwardedTo && report.forwardedTo.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Forwarded To</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {report.forwardedTo.map((ref, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-2 bg-muted rounded-lg"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="capitalize">
                        {ref.type}
                      </Badge>
                      <span className="text-sm">#{ref.id}</span>
                    </div>
                    {ref.url && (
                      <a
                        href={ref.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline inline-flex items-center gap-1 text-sm"
                      >
                        View
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* GitHub Sync Status */}
          {(report.githubSyncStatus || report.githubIssueUrl) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Github className="h-4 w-4" />
                  GitHub Sync
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {report.githubSyncStatus === 'synced' && report.githubIssueUrl && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-success" />
                      <span className="text-sm">Issue #{report.githubIssueNumber}</span>
                    </div>
                    <a
                      href={report.githubIssueUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline inline-flex items-center gap-1 text-sm"
                    >
                      View
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
                {report.githubSyncStatus === 'pending' && (
                  <div className="flex items-center gap-2 text-warning">
                    <Spinner size="sm" />
                    <span className="text-sm">Sync pending...</span>
                  </div>
                )}
                {report.githubSyncStatus === 'error' && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-destructive">
                      <AlertCircle className="h-4 w-4" />
                      <span className="text-sm">Sync failed</span>
                    </div>
                    {report.githubSyncError && (
                      <p className="text-xs text-muted-foreground bg-muted p-2 rounded">
                        {report.githubSyncError}
                      </p>
                    )}
                    {canEdit && isAdmin && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => retrySyncMutation.mutate()}
                        disabled={retrySyncMutation.isPending}
                        className="w-full"
                      >
                        {retrySyncMutation.isPending ? (
                          <Spinner size="sm" className="mr-2" />
                        ) : (
                          <RefreshCw className="h-4 w-4 mr-2" />
                        )}
                        Retry Sync
                      </Button>
                    )}
                  </div>
                )}
                {report.githubSyncedAt && report.githubSyncStatus === 'synced' && (
                  <p className="text-xs text-muted-foreground">
                    Last synced: {formatDateTime(report.githubSyncedAt)}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Report</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{report.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="outline-destructive"
              onClick={() => deleteMutation.mutate()}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function InfoRow({ label, value, isLink }: { label: string; value?: string; isLink?: boolean }) {
  if (!value) return null;

  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground flex-shrink-0">{label}</span>
      {isLink ? (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline break-all inline-flex items-center gap-1 text-right"
        >
          {value}
          <ExternalLink className="h-3 w-3 flex-shrink-0" />
        </a>
      ) : (
        <span className="text-right">{value}</span>
      )}
    </div>
  );
}

function SourceBadge({ source }: { source?: ReportSource }) {
  const resolvedSource = source ?? 'widget';

  return (
    <Badge variant="secondary" className="text-2xs uppercase tracking-wide">
      {resolvedSource}
    </Badge>
  );
}

function formatEnvironmentValue(...parts: Array<string | undefined>) {
  const value = parts.filter(Boolean).join(' ').trim();
  return value || undefined;
}

function AssigneeDisplay({
  user,
  showEmail = false,
  size = 'md',
}: {
  user?: Pick<User, 'name' | 'email' | 'avatarUrl'>;
  showEmail?: boolean;
  size?: 'sm' | 'md';
}) {
  if (!user) {
    return <p className="text-sm text-muted-foreground">Unassigned</p>;
  }

  const fallback =
    user.name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || '?';

  const avatarSizeClass = size === 'sm' ? 'h-6 w-6' : 'h-8 w-8';
  const gapClass = size === 'sm' ? 'gap-2' : 'gap-3';

  return (
    <div className={cn('flex items-center', gapClass)}>
      <Avatar className={avatarSizeClass}>
        {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt={user.name} /> : null}
        <AvatarFallback className="bg-brand-subtle text-brand-subtle-foreground text-xs">
          {fallback}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="text-sm">{user.name}</p>
        {showEmail && user.email ? (
          <p className="text-sm text-muted-foreground truncate">{user.email}</p>
        ) : null}
      </div>
    </div>
  );
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(date);
}
