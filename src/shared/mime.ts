export function normalizeMimeType(value: string): string {
  return value.split(';', 1)[0].trim().toLowerCase();
}
