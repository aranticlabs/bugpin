import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { useIntegrations, useForwardReport } from '../hooks/useIntegrations';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Label } from '../components/ui/label';
import { Separator } from '../components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import {
  ChevronLeft,
  ChevronDown,
  ExternalLink,
  Send,
  X,
  ZoomIn,
  AlertCircle,
  RefreshCw,
  Github,
  CheckCircle,
} from 'lucide-react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '../components/ui/collapsible';
import { Spinner } from '../components/ui/spinner';

export function ReportDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const canEdit = user?.role === 'admin' || user?.role === 'editor';

  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({ status: '', priority: '' });
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [viewingImage, setViewingImage] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['report', id],
    queryFn: async () => {
      const response = await api.get(`/reports/${id}`);
      return response.data;
    },
    enabled: !!id,
  });

  // Load integrations for this report's project
  const { data: integrations } = useIntegrations(data?.report?.projectId);

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
    mutationFn: async (updates: { status?: string; priority?: string }) => {
      const response = await api.patch(`/reports/${id}`, updates);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['report', id] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['recent-reports'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      setIsEditing(false);
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
      navigate('/reports');
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Failed to delete report');
    },
  });

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
        <Button variant="outline" onClick={() => navigate('/reports')} className="mt-4">
          Back to Reports
        </Button>
      </div>
    );
  }

  const { report, files } = data;

  const handleSave = () => {
    const updates: Record<string, string> = {};
    if (editData.status && editData.status !== report.status) updates.status = editData.status;
    if (editData.priority && editData.priority !== report.priority)
      updates.priority = editData.priority;

    if (Object.keys(updates).length > 0) {
      updateMutation.mutate(updates);
    } else {
      setIsEditing(false);
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
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/reports')}
            className="mb-2 -ml-2 text-muted-foreground"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back to Reports
          </Button>
          <h1 className="text-2xl font-bold">{report.title}</h1>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            {isEditing ? (
              <>
                <Button variant="outline" onClick={() => setIsEditing(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? 'Saving...' : 'Save'}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditData({ status: report.status, priority: report.priority });
                    setIsEditing(true);
                  }}
                >
                  Edit
                </Button>
                {isAdmin && activeIntegrations.length > 0 && (
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
                {isAdmin && (
                  <Button
                    variant="destructive"
                    onClick={() => setShowDeleteDialog(true)}
                    disabled={deleteMutation.isPending}
                  >
                    Delete
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Screenshots/Media */}
          {files?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>
                  {files.length === 1 ? 'Screenshot' : `Screenshots (${files.length})`}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`grid gap-4 ${files.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {files.map((file: { id: string; mimeType: string; filename: string }) => {
                    const fileUrl = `/api/reports/${id}/files/${file.id}`;
                    const isVideo = file.mimeType?.startsWith('video/');

                    return (
                      <div key={file.id} className="relative group">
                        {isVideo ? (
                          <video
                            src={fileUrl}
                            controls
                            className="w-full rounded-lg border bg-black"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => setViewingImage(fileUrl)}
                            className="w-full cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-primary rounded-lg"
                          >
                            <img
                              src={fileUrl}
                              alt={file.filename || 'Screenshot'}
                              className="w-full rounded-lg border object-contain bg-muted"
                              style={{ maxHeight: files.length > 1 ? '200px' : '400px' }}
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors rounded-lg flex items-center justify-center">
                              <ZoomIn className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                            </div>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Image Lightbox */}
          {viewingImage && (
            <div
              className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
              onClick={() => setViewingImage(null)}
            >
              <button
                type="button"
                onClick={() => setViewingImage(null)}
                className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors"
              >
                <X className="w-8 h-8" />
              </button>
              <img
                src={viewingImage}
                alt="Full size screenshot"
                className="max-w-full max-h-full object-contain"
                onClick={(e) => e.stopPropagation()}
              />
              <a
                href={viewingImage}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute bottom-4 right-4 text-white hover:text-gray-300 transition-colors flex items-center gap-2"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="w-5 h-5" />
                Open in new tab
              </a>
            </div>
          )}

          {/* Description */}
          <Card>
            <CardHeader>
              <CardTitle>Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-muted-foreground">
                {report.description || 'No description provided'}
              </p>
            </CardContent>
          </Card>

          {/* Console Output */}
          {report.metadata?.consoleErrors?.length > 0 && (
            <Collapsible>
              <Card>
                <CollapsibleTrigger className="w-full">
                  <CardHeader className="flex-row items-center justify-between space-y-0 cursor-pointer hover:bg-muted/50 transition-colors">
                    <CardTitle>
                      Console Output
                      <span className="ml-2 text-sm font-normal text-muted-foreground">
                        ({report.metadata.consoleErrors.length})
                      </span>
                    </CardTitle>
                    <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 [[data-state=open]_&]:rotate-180" />
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent>
                    <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2">
                      {report.metadata.consoleErrors.map(
                        (
                          err: { type: string; message: string; source?: string; line?: number },
                          i: number,
                        ) => (
                          <div
                            key={i}
                            className={`px-4 py-2 rounded-lg text-sm font-mono ${
                              err.type === 'warn'
                                ? 'bg-yellow-50 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200'
                                : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-200'
                            }`}
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
                        ),
                      )}
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          )}

          {/* Network Errors */}
          {report.metadata?.networkErrors?.length > 0 && (
            <Collapsible>
              <Card>
                <CollapsibleTrigger className="w-full">
                  <CardHeader className="flex-row items-center justify-between space-y-0 cursor-pointer hover:bg-muted/50 transition-colors">
                    <CardTitle>
                      Network Errors
                      <span className="ml-2 text-sm font-normal text-muted-foreground">
                        ({report.metadata.networkErrors.length})
                      </span>
                    </CardTitle>
                    <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 [[data-state=open]_&]:rotate-180" />
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="space-y-2">
                    {report.metadata.networkErrors.map(
                      (
                        err: { url: string; method: string; status: number; statusText: string },
                        i: number,
                      ) => (
                        <div
                          key={i}
                          className={`px-4 py-2 rounded-lg text-sm font-mono ${
                            err.status === 0 || err.status >= 500
                              ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-200'
                              : err.status >= 400
                                ? 'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-200'
                                : 'bg-yellow-50 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200'
                          }`}
                        >
                          <span className="font-semibold">
                            {err.status === 0 ? 'Network Error' : err.status} {err.statusText}
                          </span>
                          <span className="mx-2 opacity-50">|</span>
                          <span className="uppercase text-xs">{err.method}</span>
                          <span className="block text-xs opacity-70 mt-1 break-all">{err.url}</span>
                        </div>
                      ),
                    )}
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          )}

          {/* User Activity Trail */}
          {report.metadata?.userActivity?.length > 0 && (
            <Collapsible>
              <Card>
                <CollapsibleTrigger className="w-full">
                  <CardHeader className="flex-row items-center justify-between space-y-0 cursor-pointer hover:bg-muted/50 transition-colors">
                    <CardTitle>
                      User Activity Trail
                      <span className="ml-2 text-sm font-normal text-muted-foreground">
                        ({report.metadata.userActivity.length} events)
                      </span>
                    </CardTitle>
                    <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 [[data-state=open]_&]:rotate-180" />
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent>
                    <div className="space-y-2 max-h-[480px] overflow-y-auto pr-2">
                      {report.metadata.userActivity.map(
                        (
                          activity: {
                            type: string;
                            text?: string;
                            url?: string;
                            inputType?: string;
                            timestamp: string;
                          },
                          i: number,
                        ) => (
                          <div
                            key={i}
                            className="flex items-start gap-3 px-3 py-2 rounded-lg bg-muted/50 text-sm"
                          >
                            <span
                              className={`shrink-0 px-2 py-0.5 rounded text-xs font-medium uppercase ${
                                activity.type === 'button'
                                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                                  : activity.type === 'link'
                                    ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                                    : activity.type === 'input'
                                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                                      : activity.type === 'select'
                                        ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
                                        : activity.type === 'checkbox'
                                          ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300'
                                          : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                              }`}
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
                              {new Date(activity.timestamp).toLocaleString()}
                            </span>
                          </div>
                        ),
                      )}
                    </div>
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
                  <CollapsibleTrigger className="w-full">
                    <CardHeader className="flex-row items-center justify-between space-y-0 cursor-pointer hover:bg-muted/50 transition-colors">
                      <CardTitle>
                        Storage Keys
                        <span className="ml-2 text-sm font-normal text-muted-foreground">
                          (
                          {(report.metadata.storageKeys.cookies?.length || 0) +
                            (report.metadata.storageKeys.localStorage?.length || 0) +
                            (report.metadata.storageKeys.sessionStorage?.length || 0)}
                          )
                        </span>
                      </CardTitle>
                      <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 [[data-state=open]_&]:rotate-180" />
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent>
                      <div className="max-h-[400px] overflow-y-auto">
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
                              ),
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
                              ),
                            )}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Status & Priority */}
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label className="text-muted-foreground block">Status</Label>
                {isEditing ? (
                  <Select
                    value={editData.status}
                    onValueChange={(value) => setEditData({ ...editData, status: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <div>
                    <StatusBadge status={report.status} />
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-muted-foreground block">Priority</Label>
                {isEditing ? (
                  <Select
                    value={editData.priority}
                    onValueChange={(value) => setEditData({ ...editData, priority: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lowest">Lowest</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="highest">Highest</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <div>
                    <PriorityBadge priority={report.priority} />
                  </div>
                )}
              </div>
              <Separator />
              <div className="space-y-1">
                <Label className="text-muted-foreground">Created</Label>
                <p className="text-sm">{new Date(report.createdAt).toLocaleString()}</p>
              </div>
              {report.reporterEmail && (
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Reporter</Label>
                  <p className="text-sm">{report.reporterName || report.reporterEmail}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Page Info */}
          <Card>
            <CardHeader>
              <CardTitle>Page Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <InfoRow label="URL" value={report.metadata?.url} isLink />
              <InfoRow label="Page Title" value={report.metadata?.title} />
              <InfoRow label="Referrer" value={report.metadata?.referrer} isLink />
              <InfoRow
                label="Load Time"
                value={
                  report.metadata?.pageLoadTime ? `${report.metadata.pageLoadTime}ms` : undefined
                }
              />
              <InfoRow label="Timezone" value={report.metadata?.timezone} />
            </CardContent>
          </Card>

          {/* Environment */}
          <Card>
            <CardHeader>
              <CardTitle>Environment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <InfoRow
                label="Browser"
                value={`${report.metadata?.browser?.name} ${report.metadata?.browser?.version}`}
              />
              <InfoRow
                label="OS"
                value={`${report.metadata?.device?.os} ${report.metadata?.device?.osVersion || ''}`}
              />
              <InfoRow label="Device" value={report.metadata?.device?.type} />
              <InfoRow
                label="Viewport"
                value={`${report.metadata?.viewport?.width}x${report.metadata?.viewport?.height}`}
              />
            </CardContent>
          </Card>

          {/* Forwarded To */}
          {report.forwardedTo && report.forwardedTo.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Forwarded To</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {report.forwardedTo.map(
                  (
                    ref: { type: string; id: string; url?: string; forwardedAt: string },
                    i: number,
                  ) => (
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
                  ),
                )}
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
                      <CheckCircle className="h-4 w-4 text-green-600" />
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
                  <div className="flex items-center gap-2 text-amber-600">
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
                    {isAdmin && (
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
                    Last synced: {new Date(report.githubSyncedAt).toLocaleString()}
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
            <AlertDialogAction variant="destructive" onClick={() => deleteMutation.mutate()}>
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

function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    open: 'Open',
    in_progress: 'In Progress',
    resolved: 'Resolved',
    closed: 'Closed',
  };

  return (
    <Badge variant="outline" className={`status-${status}`}>
      {labels[status] || status}
    </Badge>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  return (
    <Badge variant="outline" className={`priority-${priority} uppercase text-xs`}>
      {priority}
    </Badge>
  );
}
