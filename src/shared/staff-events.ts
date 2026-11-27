export const STAFF_EVENT_TYPES = [
  'report.updated',
  'message.created',
  'reporter_activity.changed',
] as const;

export type StaffEventType = (typeof STAFF_EVENT_TYPES)[number];
export interface StaffEventData {
  reportId: string;
  projectId: string;
}
