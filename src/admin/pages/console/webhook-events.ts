import type { WebhookEvent } from '@shared/types';

export const WEBHOOK_EVENTS: { value: WebhookEvent; label: string }[] = [
  { value: 'report.created', label: 'New report' },
  { value: 'report.updated', label: 'Report updated' },
  { value: 'report.status_changed', label: 'Status changed' },
  { value: 'report.assigned', label: 'Report assigned' },
  { value: 'report.resolved', label: 'Report resolved' },
  { value: 'report.closed', label: 'Report closed' },
  { value: 'report.deleted', label: 'Report deleted' },
  { value: 'report.message_created', label: 'Conversation message created' },
  { value: 'report.owner_changed', label: 'Reporter owner changed' },
];

export function webhookEventLabel(value: WebhookEvent): string {
  return WEBHOOK_EVENTS.find((event) => event.value === value)?.label ?? value;
}
