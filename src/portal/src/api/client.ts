export class PortalApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string
  ) {
    super(code);
  }
}

export async function portalFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('X-BugPin-Portal', '1');
  if (typeof init.body === 'string' && !headers.has('Content-Type'))
    headers.set('Content-Type', 'application/json');
  const response = await fetch(`/api/portal${path}`, { ...init, credentials: 'include', headers });
  init.signal?.throwIfAborted();
  if (
    response.status === 401 &&
    !(path === '/me' && (init.method ?? 'GET').toUpperCase() === 'GET') &&
    path !== '/auth/logout'
  )
    window.dispatchEvent(new Event('bugpin:portal-session-expired'));
  const body: { success?: boolean; error?: string } = await response.json();
  if (!response.ok || !body.success)
    throw new PortalApiError(response.status, body.error ?? 'REQUEST_FAILED');
  return body as T;
}
