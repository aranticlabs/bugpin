import type { Context } from 'hono';

/** The site the browser runs WebAuthn for: its origin and the hostname used as RP ID */
export interface RelyingParty {
  name: string;
  origin: string;
  id: string;
}

function hostnameOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value.includes('://') ? value : `http://${value}`).hostname;
  } catch {
    return null;
  }
}

/**
 * The WebAuthn relying party for a request. The browser's Origin header names the site
 * the passkey is bound to; it is accepted only when its hostname matches the host the
 * request was sent to or the configured app URL, so a passkey is never created for or
 * checked against a foreign site.
 */
export function resolveRelyingParty(
  c: Context,
  settings: { appName: string; appUrl: string }
): RelyingParty | null {
  const origin = c.req.header('origin');
  if (!origin) return null;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;

  const allowedHosts = new Set(
    [hostnameOf(c.req.header('host')), hostnameOf(settings.appUrl)].filter(
      (host): host is string => !!host
    )
  );
  if (!allowedHosts.has(parsed.hostname)) return null;

  return { name: settings.appName || 'BugPin', origin: parsed.origin, id: parsed.hostname };
}
