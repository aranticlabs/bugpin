import { useId, useRef, useEffect, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import axios from 'axios';
import { api } from '../../api/client';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Spinner } from '../../components/ui/spinner';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '../../components/ui/select';
import { WEBHOOK_EVENTS } from './webhook-events';
import type { Project, WebhookResponse as Webhook, WebhookEvent } from '@shared/types';

interface WebhookEditorProps {
  projects: Project[];
  webhook: Webhook | null;
  initialProjectId: string;
  onSaved: (webhook: Webhook) => void;
  onCancel: () => void;
}

export function WebhookEditor({
  projects,
  webhook,
  initialProjectId,
  onSaved,
  onCancel,
}: WebhookEditorProps) {
  const formId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const [fields, setFields] = useState({
    projectId: webhook?.projectId ?? initialProjectId,
    name: webhook?.name ?? '',
    url: webhook?.url ?? '',
    secret: '',
    removeSecret: false,
    events: webhook?.events ?? (['report.created'] as WebhookEvent[]),
  });
  const hasSavedSecret = Boolean(webhook?.secretSet);
  const [validationError, setValidationError] = useState('');
  useEffect(() => {
    nameRef.current?.focus();
  }, []);
  const save = useMutation({
    mutationFn: async () => {
      const body = {
        name: fields.name.trim(),
        url: fields.url.trim(),
        events: fields.events,
        secret: fields.secret || (fields.removeSecret ? '' : undefined),
      };
      const response = webhook
        ? await api.patch(`/webhooks/${webhook.id}`, body)
        : await api.post(`/webhooks?projectId=${encodeURIComponent(fields.projectId)}`, body);
      return response.data.webhook as Webhook;
    },
    onSuccess: onSaved,
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (save.isPending) return;
    if (!fields.events.length) {
      setValidationError('Select at least one event.');
      return;
    }
    if (fields.name.trim().length < 2) {
      setValidationError('Enter a webhook name with at least two characters.');
      return;
    }
    try {
      const url = new URL(fields.url.trim());
      if (!['http:', 'https:'].includes(url.protocol)) {
        setValidationError('Use an http:// or https:// receiver URL.');
        return;
      }
    } catch {
      setValidationError('Enter a valid receiver URL.');
      return;
    }
    if (!fields.projectId) {
      setValidationError('Select a project.');
      return;
    }
    setValidationError('');
    save.mutate();
  };
  const message =
    validationError ||
    (save.error &&
      (axios.isAxiosError(save.error)
        ? save.error.response?.data?.message || save.error.message
        : save.error.message));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{webhook ? 'Edit webhook' : 'New webhook'}</CardTitle>
        <CardDescription>
          {webhook
            ? 'Update this endpoint and the events it receives.'
            : 'Send report events from a project to an external service.'}
        </CardDescription>
      </CardHeader>
      <form onSubmit={submit}>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`${formId}-name`}>Webhook name</Label>
              <Input
                ref={nameRef}
                id={`${formId}-name`}
                required
                minLength={2}
                maxLength={100}
                placeholder="e.g. Issue tracker"
                value={fields.name}
                disabled={save.isPending}
                onChange={(event) => setFields({ ...fields, name: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${formId}-project`}>Project</Label>
              {webhook ? (
                <Input
                  id={`${formId}-project`}
                  value={
                    projects.find((project) => project.id === webhook.projectId)?.name ??
                    webhook.projectId
                  }
                  readOnly
                />
              ) : (
                <Select
                  value={fields.projectId}
                  disabled={save.isPending}
                  onValueChange={(value) => {
                    if (value) setFields({ ...fields, projectId: value });
                  }}
                >
                  <SelectTrigger id={`${formId}-project`}>
                    <SelectValue placeholder="Select a project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${formId}-url`}>Receiver URL</Label>
            <Input
              id={`${formId}-url`}
              type="url"
              required
              placeholder="https://example.com/webhooks/bugpin"
              value={fields.url}
              disabled={save.isPending}
              onChange={(event) => setFields({ ...fields, url: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={`${formId}-secret`}>
                Signing secret <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              {hasSavedSecret && !fields.removeSecret && (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0"
                  disabled={save.isPending}
                  onClick={() => setFields({ ...fields, secret: '', removeSecret: true })}
                >
                  Remove secret
                </Button>
              )}
            </div>
            <Input
              id={`${formId}-secret`}
              type="password"
              autoComplete="new-password"
              aria-describedby={`${formId}-secret-help`}
              placeholder={
                fields.removeSecret
                  ? 'Removed when you save'
                  : hasSavedSecret
                    ? 'Saved (leave empty to keep)'
                    : undefined
              }
              value={fields.secret}
              disabled={save.isPending}
              onChange={(event) =>
                setFields({ ...fields, secret: event.target.value, removeSecret: false })
              }
            />
            <p id={`${formId}-secret-help`} className="text-xs text-muted-foreground">
              {fields.removeSecret
                ? 'The signing secret will be removed when you save.'
                : hasSavedSecret
                  ? 'Leave empty to keep the saved secret, or enter a new secret to replace it.'
                  : 'Use the same secret in your receiver to verify deliveries. Leave blank for unsigned requests.'}
            </p>
          </div>
          <fieldset className="space-y-3" disabled={save.isPending}>
            <legend className="text-sm font-medium">Events</legend>
            <p className="text-xs text-muted-foreground">
              Choose which report events this endpoint receives.
            </p>
            <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {WEBHOOK_EVENTS.map((event) => (
                <div key={event.value} className="flex items-center justify-between gap-4">
                  <Label htmlFor={`${formId}-${event.value}`} className="leading-normal">
                    {event.label}
                    <span className="block text-xs font-normal text-muted-foreground">
                      {event.value}
                    </span>
                  </Label>
                  <Switch
                    id={`${formId}-${event.value}`}
                    checked={fields.events.includes(event.value)}
                    disabled={save.isPending}
                    onCheckedChange={(checked) => {
                      setFields({
                        ...fields,
                        events: checked
                          ? [...fields.events, event.value]
                          : fields.events.filter((value) => value !== event.value),
                      });
                      setValidationError('');
                    }}
                  />
                </div>
              ))}
            </div>
          </fieldset>
          {message && (
            <p role="alert" className="text-sm text-destructive">
              {message}
            </p>
          )}
          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Spinner size="sm" className="mr-2" />}
              {save.isPending ? 'Saving...' : webhook ? 'Save changes' : 'Create webhook'}
            </Button>
            <Button type="button" variant="outline" disabled={save.isPending} onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </form>
    </Card>
  );
}
