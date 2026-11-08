export function maskEmail(email: string): string {
  const separator = email.lastIndexOf('@');
  return `${email.slice(0, 1)}***${email.slice(separator)}`;
}
