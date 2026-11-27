import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import { useAddressCheck } from '../hooks/useAddressCheck';
import { NoticeControls } from './NoticeControls';

const REVERSE_PROXY_GUIDE_URL = 'https://docs.bugpin.io/installation/reverse-proxy';
const TRUST_PROXY_GUIDE_URL = `${REVERSE_PROXY_GUIDE_URL}#client-ip-addresses-and-trust_proxy`;

const linkClass = 'inline-flex items-center gap-1 text-primary hover:underline';

function Notice({
  title,
  dismissLabel,
  onSnooze,
  onDismiss,
  children,
}: {
  title: ReactNode;
  dismissLabel: string;
  onSnooze: () => void;
  onDismiss: () => void;
  children: ReactNode;
}) {
  return (
    <div
      role="status"
      className="flex items-start gap-3 border-b bg-amber-500/10 px-4 py-2 text-sm text-foreground"
    >
      <AlertTriangle
        className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1 break-words">
        <p className="font-medium">{title}</p>
        <p className="text-muted-foreground">{children}</p>
      </div>
      <NoticeControls onSnooze={onSnooze} onDismiss={onDismiss} dismissLabel={dismissLabel} />
    </div>
  );
}

function GuideLink({ href }: { href: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={linkClass}>
      Reverse proxy guide
      <ExternalLink className="h-3 w-3" aria-hidden="true" />
    </a>
  );
}

export function AddressNotice() {
  const {
    appUrlMismatch,
    proxyMismatch,
    dismissAppUrlMismatch,
    dismissProxyMismatch,
    snoozeAppUrlMismatch,
    snoozeProxyMismatch,
  } = useAddressCheck();

  return (
    <>
      {appUrlMismatch && (
        <Notice
          title={
            <>
              The Application URL ({appUrlMismatch.configuredOrigin}) does not match the address you
              are using ({appUrlMismatch.browserOrigin}).
            </>
          }
          dismissLabel="Dismiss Application URL warning"
          onSnooze={snoozeAppUrlMismatch}
          onDismiss={dismissAppUrlMismatch}
        >
          Links in emails and GitHub issues use the Application URL, and future BugPin versions only
          accept changes made from it.{' '}
          <Link to="/settings" className={linkClass}>
            Open Settings
          </Link>
        </Notice>
      )}

      {proxyMismatch && proxyMismatch.requiredTrustProxy === 'auto' && (
        <Notice
          title="BugPin is behind a reverse proxy but ignores its forwarded headers."
          dismissLabel="Dismiss reverse proxy warning"
          onSnooze={snoozeProxyMismatch}
          onDismiss={dismissProxyMismatch}
        >
          TRUST_PROXY does not trust the proxy, so all visitors share one rate limit, and future
          BugPin versions rely on the forwarded host and protocol. Set TRUST_PROXY=auto and recreate
          the container. <GuideLink href={TRUST_PROXY_GUIDE_URL} />
        </Notice>
      )}

      {proxyMismatch && proxyMismatch.requiredTrustProxy === 'true' && (
        <Notice
          title="BugPin is behind a reverse proxy but ignores its forwarded headers."
          dismissLabel="Dismiss reverse proxy warning"
          onSnooze={snoozeProxyMismatch}
          onDismiss={dismissProxyMismatch}
        >
          The proxy connects from a public address, which TRUST_PROXY does not trust, so all
          visitors share one rate limit, and future BugPin versions rely on the forwarded host and
          protocol. Set TRUST_PROXY=true and recreate the container, but only if BugPin can be
          reached through the proxy alone: this setting trusts every connecting client.{' '}
          <GuideLink href={TRUST_PROXY_GUIDE_URL} />
        </Notice>
      )}

      {proxyMismatch && proxyMismatch.requiredTrustProxy === null && (
        <Notice
          title={
            proxyMismatch.requestOrigin ? (
              <>
                BugPin receives your requests as {proxyMismatch.requestOrigin}, but your browser
                uses {proxyMismatch.browserOrigin}.
              </>
            ) : (
              'BugPin cannot determine the address of your requests.'
            )
          }
          dismissLabel="Dismiss reverse proxy warning"
          onSnooze={snoozeProxyMismatch}
          onDismiss={dismissProxyMismatch}
        >
          Configure your reverse proxy to pass the original Host and X-Forwarded-Proto headers.
          Future BugPin versions rely on them for HTTPS redirects and request checks.{' '}
          <GuideLink href={REVERSE_PROXY_GUIDE_URL} />
        </Notice>
      )}
    </>
  );
}
