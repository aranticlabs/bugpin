# Reporter Portal

The Reporter Portal lets people follow their own feedback at `/reporter-portal`. It is included in Community Edition and enabled separately for each project. The Admin Console remains at `/admin`.

## Enable a project

1. Configure the public **Application URL** and SMTP in the Admin Console settings. Public URLs must use HTTPS. Loopback HTTP is supported for local development; `.local` and `.test` HTTP are allowed only in development mode.
2. For production, first configure a valid **Application URL**, then a different HTTPS **Portal Base URL**, such as `https://feedback.example.com`, alongside `https://bugs.example.com` for the Application URL. A Portal Base URL requires an Application URL; clear the Portal Base URL before clearing the Application URL. Use origins without paths, queries or fragments. Route both hosts to the same BugPin instance and persistent data volume.
3. In the project's **Reporter Portal** tab, enable the portal and send a test login link. Enable **Allow new feedback from the portal** if reporters should be able to create more reports after they own one in the project.
4. Check reporter notification preferences and messaging settings. Confirmation delivery depends on the project's reporter-email settings. A saved report stays saved if mail delivery fails.

Reports submitted with an email while the portal is enabled become claimable by that verified mailbox. Earlier reports and reports submitted while the portal was disabled are not automatically claimable. An editor or administrator can explicitly assign an owner or make a report claimable. Contact-email edits do not change ownership. Removing an owner also removes claimability.

Reporters see the original submitted description, visible conversation messages, assignee display name, status and authorized files. They cannot see diagnostics, priority, captured URLs, staff email addresses, hidden messages or other reporters' details. Resolved reports accept replies; closed reports do not. Turning messaging off leaves the conversation readable.

## Separate origins and proxy trust

Set `TRUST_PROXY=auto` when the proxy connects from loopback or a private network. `true` trusts any connecting peer and requires the upstream port to be reachable only through the trusted proxy. With direct public access, use `false`. The proxy must replace client-supplied forwarded host and scheme headers with the actual public values and maintain a trustworthy forwarded-address chain.

This setting governs forwarded host, scheme and address handling. An existing Compose deployment with `TRUST_PROXY=false` must change it when moved behind a reverse proxy. Recreate the container after changing environment variables. Preserve the public Host, or supply it through trusted `X-Forwarded-Host`; forward `X-Forwarded-Proto: https` after TLS termination.

In separate-origin mode, unknown effective hosts receive 421. Portal routes are unavailable on the Admin Console host, and staff APIs are unavailable on the portal host. A loopback Host alone does not bypass isolation. The local `/health` exception also requires a loopback socket peer. Reporter and staff session cookies are host-only; do not add a shared cookie domain at the proxy.

If requests fail after an upgrade, check both configured URLs, the proxy's outgoing headers, and its socket address before changing trust. Redirect loops commonly indicate an untrusted or incorrect forwarded scheme. Incorrect hosts can produce 421, and mismatched browser origins can produce 403. `DISABLE_HTTPS_ENFORCEMENT=true` temporarily bypasses HTTPS enforcement so an administrator can correct that setting; it does not disable host isolation or mutation-origin checks. Remove it after recovery.

If a restored or previously saved Portal Base URL blocks access to the Admin Console, clear that origin out of band. With the standard Compose service and its existing data volume:

```sh
docker compose stop bugpin
docker compose run --rm --no-deps bugpin bun run reset-portal-origin
docker compose up -d bugpin
```

For a source installation, stop BugPin, run `DATA_DIR=/path/to/existing/data bun run reset-portal-origin` as the instance's operating-system user, then restart it with the same configuration. The command requires an explicit absolute DATA_DIR and an existing database; missing or relative paths are rejected. It clears only the Portal Base URL without loading application configuration, generating secrets, initializing storage, or running migrations. After restart, open the Admin Console at the Application URL or the same-origin host, correct the Application URL, and configure the separate portal origin again. This command restores same-origin routing; it does not bypass authentication. If HTTPS enforcement is also misconfigured, use its temporary recovery variable separately.

## Live updates and uploads

The authenticated `/api/portal/events` endpoint uses server-sent events with 25-second heartbeats. Disable response buffering and caching, and allow idle periods longer than the heartbeat. Avoid compression middleware that buffers event responses. The default is three streams per reporter session; closing unused tabs releases slots. Refused streams reconnect with backoff, while an expired or revoked session returns to sign-in.

Set proxy upload limits and request timeouts to cover the configured project file limits. At maximum settings, five 100 MB video attachments require slightly over 500 MiB including multipart overhead. A `512m` nginx body limit accommodates that request; the application still enforces per-file and per-reporter limits. Defaults allow up to five images/videos per message and 200 MB of reporter uploads per rolling day. These limits are configurable in the Admin Console's security settings.

The following examples assume existing valid TLS certificates, a private upstream named `bugpin:7300`, and `TRUST_PROXY=auto`. Restrict the upstream port to the proxy network. Apply equivalent settings to both public hosts.

### nginx

Inside the existing TLS server block for `bugs.example.com` and `feedback.example.com`:

```nginx
client_max_body_size 512m;
location / {
    proxy_pass http://bugpin:7300;
    proxy_http_version 1.1;
    proxy_set_header Host $http_host;
    proxy_set_header X-Forwarded-Host $http_host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 75s;
    proxy_send_timeout 300s;
}
```

This example has nginx at the public edge. If another proxy precedes it, configure trusted real-client-address handling before relying on `$remote_addr`. See the [nginx proxy module reference](https://nginx.org/en/docs/http/ngx_http_proxy_module.html).

### Caddy

```caddyfile
bugs.example.com, feedback.example.com {
    reverse_proxy bugpin:7300 {
        flush_interval -1
    }
}
```

Caddy supplies forwarded host and scheme headers. If a CDN precedes Caddy, configure its trusted proxies separately. See [Caddy reverse proxy configuration](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy).

### Traefik

Use this dynamic file-provider configuration with an existing HTTPS `websecure` entry point and certificates:

```yaml
http:
  routers:
    bugpin:
      rule: Host(`bugs.example.com`) || Host(`feedback.example.com`)
      entryPoints: [websecure]
      tls: {}
      service: bugpin
  services:
    bugpin:
      loadBalancer:
        passHostHeader: true
        servers:
          - url: http://bugpin:7300
        responseForwarding:
          flushInterval: '-1ms'
```

Keep event responses streaming and do not add a buffering middleware. See [Traefik HTTP services](https://doc.traefik.io/traefik/reference/routing-configuration/http/load-balancing/service/).

## Email delivery and templates

Configure SMTP with a sender domain you control. Enable DKIM signing in the mail service and verify that a valid signature covers both `List-Unsubscribe` and `List-Unsubscribe-Post`. This is required for authenticated one-click unsubscribe under [RFC 8058](https://www.rfc-editor.org/rfc/rfc8058.html). Configure SPF and DMARC with that provider. BugPin passes the unsubscribe headers to SMTP; DKIM signing and domain authentication belong to the mail service.

Requested sign-in links expire in 15 minutes; confirmation and invitation links expire in 24 hours. Opening or previewing a link does not consume it. The reporter must press **Continue**, which creates a full account session. Any valid expired link can request a replacement 15-minute sign-in link sent to its stored email address. Link secrets use the URL fragment and are removed before application requests.

Custom reporter templates can use these values:

| Variable                      | Meaning                                                       |
| ----------------------------- | ------------------------------------------------------------- |
| `portal.url`                  | Portal entry URL for an enabled project                       |
| `reporter.loginUrl`           | Single-use sign-in URL when that recipient needs first access |
| `reporter.updateUrl`          | Recipient-specific sign-in link or report destination         |
| `reporter.actionLabel`        | Localized action text for the update link                     |
| `reporter.portalDisplay`      | `block` or `none` for conditional link visibility             |
| `reporter.unsubscribeUrl`     | Signed update-email unsubscribe URL                           |
| `reporter.unsubscribeLabel`   | Localized unsubscribe text                                    |
| `reporter.unsubscribeDisplay` | `block` or `none` for conditional unsubscribe visibility      |
| `report.portalUrl`            | Authorized report destination when available                  |

Preserve the template's existing conditional portal-link handling. Staff CC copies do not receive sign-in or unsubscribe credentials. Private files are not attached to notification emails; the recipient signs in to view them. Update-email suppression does not suppress requested sign-in mail.

Email bodies and `List-Unsubscribe` use `/api/portal/unsubscribe?t=...`. Its GET renders the localized confirmation page directly and does not change preferences. Confirmation and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` use a form-encoded POST with the signed token and require no session cookie.

## Access recovery, erasure and retention

Administrators can suspend a reporter or revoke sessions from the Reporters area. Both actions revoke outstanding login links and close live streams. Unsuspending permits new sign-ins; it does not restore revoked credentials. Disabling a project's portal immediately removes its reports from reporter access while leaving unrelated projects available.

Deleting a reporter removes their identity and active credentials, clears ownership and claimability, and anonymizes their message-author snapshots. Optional contact erasure also clears the report's contact name and email. Reports and conversations remain for staff until retention removes them. Deletion does not automatically make old reports claimable at the next login. A subsequent new submission can become claimable again.

For a personal-data erasure request, review uploaded files, original descriptions, conversations, diagnostics, external integrations and backups as well as the reporter/contact controls. Those controls do not inspect attachment contents or delete copies held in external systems. Follow your retention policy for those copies. Update-email suppression records remain independent of reporter accounts.

## Upgrade and release verification

Back up the complete data volume, including uploaded files and `.secret`, before upgrading. Pending migrations automatically create a verified `<database>.pre-upgrade-*.bak` beside the database. Keep the database size plus at least 20% free space. Startup waits for copying and integrity checks, so duration depends on database size and disk performance. Fresh installations do not create empty upgrade snapshots.

If an upgrade fails, stop BugPin and preserve the failed database with its `-wal` and `-shm` files separately. Copy a verified snapshot to the configured database path, remove the failed database's sidecars from that path, restore ownership/permissions, and restart the previous application version. The database snapshot does not restore uploaded files; keep the full-volume backup. Successful upgrades retain the latest two verified snapshots.

Before releasing a deployment, verify:

- A confirmation email opens a preview without consuming the link, and Continue reaches the owned report.
- Two reporters cannot read each other's reports or files, including HEAD and range requests.
- Disabling access or revoking a session updates an already-open portal tab.
- An uploaded video plays and seeks in Safari, Chrome and Firefox; list, board, detail and profile remain usable at mobile widths with keyboard navigation.
- Events arrive promptly through the actual nginx, Caddy or Traefik deployment, including after an idle heartbeat and reconnect.
- A quota rejection leaves the draft intact and stores no partial message or files.
- Unsubscribe GET does not change preferences, and a cookie-free one-click POST works.

For source builds, run `bun install --frozen-lockfile`, install browsers with `bun node_modules/.bin/playwright install --with-deps chromium firefox webkit`, then run `bun run typecheck`, `bun run typecheck:tests`, `bun run test`, `bun run knip`, `bun run test:e2e`, `bun run check:widget-size` and `bun run format:check`. The portal build rejects Admin Console or dnd-kit imports. Automated WebKit coverage supplements a check in physical Safari.
