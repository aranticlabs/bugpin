export function maskEmail(email: string): string {
  const separator = email.lastIndexOf('@');
  if (separator <= 0) return '***';
  return `${email.slice(0, 1)}***${email.slice(separator)}`;
}
