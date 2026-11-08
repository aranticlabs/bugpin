import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Send, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../api/client';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Spinner } from '../../components/ui/spinner';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '../../components/ui/alert-dialog';
import { webhookEventLabel } from './webhook-events';
import type { WebhookResponse as Webhook } from '@shared/types';

interface WebhookCardProps {
  webhook: Webhook;
  projectName: string;
  editorOpen: boolean;
  editingThis: boolean;
  onEdit: () => void;
}

function errorMessage(error: Error): string {
  return axios.isAxiosError(error) ? error.response?.data?.message || error.message : error.message;
}

export function WebhookCard({
  webhook,
  projectName,
  editorOpen,
  editingThis,
  onEdit,
}: WebhookCardProps) {
  const client = useQueryClient();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const change = useMutation({
    mutationFn: async (isActive: boolean) =>
      (await api.patch(`/webhooks/${webhook.id}`, { isActive })).data.webhook as Webhook,
    onSuccess: (updated) => {
      client.setQueryData<Webhook[]>(['webhooks'], (current) =>
        current?.map((item) => (item.id === updated.id ? updated : item))
      );
      void client.invalidateQueries({ queryKey: ['webhooks'] });
    },
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/webhooks/${webhook.id}`),
    onSuccess: () => {
      setDeleteOpen(false);
      client.setQueryData<Webhook[]>(['webhooks'], (current) =>
        current?.filter((item) => item.id !== webhook.id)
      );
      void client.invalidateQueries({ queryKey: ['webhooks'] });
      toast.success('Webhook deleted');
    },
  });
  const sendTest = useMutation({
    mutationFn: async () =>
      (await api.post(`/webhooks/${webhook.id}/test`)).data as { statusCode: number },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ['webhooks'] });
    },
  });
  const busy = editingThis || change.isPending || remove.isPending || sendTest.isPending;
  const code = webhook.lastStatusCode;
  const responseFailed = code !== undefined && (code < 200 || code >= 300);
  const responseLabel =
    code === undefined ? 'No deliveries yet' : code === 0 ? 'Connection failed' : `HTTP ${code}`;

  return (
    <Card role="article" aria-label={webhook.name}>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-4 space-y-0">
        <div className="min-w-0 space-y-1.5">
          <CardTitle className="break-words">{webhook.name}</CardTitle>
          <p className="text-sm text-muted-foreground">{projectName}</p>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor={`webhook-active-${webhook.id}`} className="text-muted-foreground">
            {webhook.isActive ? 'Active' : 'Paused'}
          </Label>
          <Switch
            id={`webhook-active-${webhook.id}`}
            aria-label={`Enable ${webhook.name}`}
            checked={webhook.isActive}
            disabled={busy}
            onCheckedChange={(checked) => change.mutate(checked)}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="break-all text-sm">{webhook.url}</p>
        <div className="flex flex-wrap gap-2">
          {webhook.events.map((event) => (
            <Badge key={event} variant="secondary" className="font-normal">
              {webhookEventLabel(event)}
            </Badge>
          ))}
        </div>
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div className="space-y-1">
            <dt className="text-xs text-muted-foreground">Last delivery</dt>
            <dd>
              {webhook.lastTriggeredAt
                ? new Date(webhook.lastTriggeredAt).toLocaleString('en-US', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })
                : 'Not sent yet'}
            </dd>
          </div>
          <div className="space-y-1">
            <dt className="text-xs text-muted-foreground">Last response</dt>
            <dd>
              <Badge variant={responseFailed ? 'destructive' : 'outline'}>{responseLabel}</Badge>
            </dd>
          </div>
          <div className="space-y-1">
            <dt className="text-xs text-muted-foreground">Consecutive failures</dt>
            <dd className={webhook.failureCount > 0 ? 'text-destructive' : ''}>
              {webhook.failureCount}
            </dd>
          </div>
        </dl>
        <p className="text-xs text-muted-foreground">
          {webhook.secretSet ? 'Payloads are signed.' : 'No signing secret configured.'}
          {!webhook.isActive && ' Automatic deliveries are paused; tests can still be sent.'}
        </p>
        {change.error && (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage(change.error)}
          </p>
        )}
        {sendTest.error && (
          <p role="alert" className="text-sm text-destructive">
            Test delivery failed: {errorMessage(sendTest.error)}
          </p>
        )}
        {sendTest.isSuccess && (
          <p role="status" className="text-sm">
            Test delivered successfully (HTTP {sendTest.data.statusCode}).
          </p>
        )}
        <div className="flex flex-wrap gap-2 border-t pt-4">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => sendTest.mutate()}>
            {sendTest.isPending ? <Spinner size="sm" /> : <Send className="h-4 w-4" />}
            {sendTest.isPending ? 'Sending...' : 'Test delivery'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy || editorOpen}
            onClick={() => {
              sendTest.reset();
              onEdit();
            }}
          >
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
          <Button
            variant="ghost-destructive"
            size="sm"
            disabled={busy}
            onClick={() => {
              remove.reset();
              setDeleteOpen(true);
            }}
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>
      </CardContent>
      <AlertDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!remove.isPending) setDeleteOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete webhook?</AlertDialogTitle>
            <AlertDialogDescription>
              Delete "{webhook.name}"? This endpoint will no longer receive report events.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {remove.error && (
            <p role="alert" className="text-sm text-destructive">
              {errorMessage(remove.error)}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="outline-destructive"
              disabled={remove.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (!remove.isPending) remove.mutate();
              }}
            >
              {remove.isPending ? 'Deleting...' : 'Delete webhook'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
