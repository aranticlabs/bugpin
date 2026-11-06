const ACTIVITY_TONE: Record<string, string> = {
  button: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  link: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  input: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  select: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  checkbox: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
};

export function consoleEntryTone(type: string): string {
  return type === 'warn' ? 'bg-warning/10 text-warning' : 'bg-destructive/10 text-destructive';
}

export function networkErrorTone(status: number): string {
  if (status === 0 || status >= 500) return 'bg-destructive/10 text-destructive';
  if (status >= 400) return 'bg-warning/10 text-warning';
  return 'bg-info/10 text-info';
}

/** Activity types are categories rather than states, so they use distinct hues instead of status tokens. */
export function activityTypeTone(type: string): string {
  return ACTIVITY_TONE[type] ?? 'bg-muted text-muted-foreground';
}
