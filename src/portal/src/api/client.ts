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
    !path.startsWith('/auth/')
  )
    window.dispatchEvent(new Event('bugpin:portal-session-expired'));
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    throw new PortalApiError(
      response.status,
      response.status === 413 ? 'PAYLOAD_TOO_LARGE' : 'REQUEST_FAILED'
    );
  }
  const body =
    typeof parsed === 'object' && parsed !== null
      ? (parsed as { success?: boolean; error?: string })
      : null;
  if (!response.ok || !body?.success)
    throw new PortalApiError(
      response.status,
      body?.error ?? (response.status === 413 ? 'PAYLOAD_TOO_LARGE' : 'REQUEST_FAILED')
    );
  return body as T;
}
