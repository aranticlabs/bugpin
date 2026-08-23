<div align="center">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="src/admin/public/branding/dark/logo-dark.svg" />
        <img src="src/admin/public/branding/light/logo-light.svg" width="400" alt="BugPin" />
    </picture><br /><br />
    <p><big><strong>The self-hosted, open-source visual bug reporting tool.</strong></big><br />
    Capture screenshots, annotate issues, and track bugs from your web applications.</p>
    <!-- <a target="_blank" href="https://github.com/aranticlabs/bugpin"><img src="https://img.shields.io/github/stars/aranticlabs/bugpin?style=flat" /></a> -->
    <a target="_blank" href="https://github.com/aranticlabs/bugpin"><img src="https://img.shields.io/github/last-commit/aranticlabs/bugpin" /></a>
    <a target="_blank" href="https://github.com/aranticlabs/bugpin/blob/main/LICENSE"><img src="https://img.shields.io/badge/Admin%20Console%20license-AGPL--3.0-blue.svg" alt="Admin Console license: AGPL-3.0" /></a>
    <a target="_blank" href="https://github.com/aranticlabs/bugpin/blob/main/src/widget/LICENSE"><img src="https://img.shields.io/badge/Widget%20license-MIT-yellow.svg" alt="Widget license: MIT" /></a>
</div>
<br />

### Admin Console

Manage projects and triage reports. Light and dark mode out of the box.

**Light Mode**

<img src="./src/admin/public/images/bugpin-dashboard.png" width="800" alt="BugPin Admin Console: Light Mode" />

**Dark Mode**

<img src="./src/admin/public/images/bugpin-dashboard-dark.png" width="800" alt="BugPin Admin Console: Dark Mode" />

### Widget

Capture screenshots and annotate issues from any page on your site.

<img src="./src/admin/public/images/bugpin-widget-dialog.png" width="800" alt="BugPin Widget" />

- Embeds with a single script tag. Works with React, Vue, Angular, Svelte, or vanilla JS
- Shadow DOM isolation: widget styles never leak into your site, and your CSS never bleeds into the widget
- Offline-safe: reports are cached locally and synced when the connection returns
- Annotation tools: pen, shapes, arrows, text, privacy blur
- Translated into 8 languages (English, German, French, Dutch, Spanish, Italian, Japanese, Simplified Chinese) with automatic detection

# Features

- **Visual Bug Reporting** - Capture screenshots with one click
- **Annotation Tools** - Draw, highlight, and annotate screenshots
- **Automated Metadata Collection** - Failed network requests (4xx, 5xx), console errors, and OS/browser/device info captured automatically
- **Offline Support** - Reports are buffered and sent when back online
- **Self-Hosted** - Your data stays on your servers
- **Multi-Project** - Manage multiple projects with separate API keys
- **Multilingual Widget** - Widget and reporter emails translated into 8 languages, with per-project language settings
- **Export Diagnostics** - Export a report's full context as Markdown, plain text, an AI prompt, or JSON, with section toggles and redactions
- **Enhanced Security Features** - Domain whitelists, configurable rate limiting, HSTS, and secure headers
- **GitHub Integration** - Forward reports to GitHub Issues
- **Dark Mode** - Admin Console supports light and dark themes

# Quick Start

Get BugPin up and running in under 5 minutes. This guide will walk you through the basic setup to start capturing and managing bug reports.

## Install

### Docker Compose

Create a `docker-compose.yml` file:

```yaml
services:
  bugpin:
    image: registry.arantic.cloud/bugpin/bugpin:latest
    container_name: bugpin
    restart: unless-stopped
    ports:
      - '7300:7300'
    volumes:
      - ./data:/data
```

Then run:

```bash
# Start BugPin
docker compose up -d
```

### Docker Run

```bash
# Run BugPin container
docker run -d \
  --name bugpin \
  --restart unless-stopped \
  -p 7300:7300 \
  -v bugpin-data:/data \
  registry.arantic.cloud/bugpin/bugpin:latest
```

BugPin will be available at `http://localhost:7300`

## Login

Log in with the default credentials:

- **Email**: `admin@example.com`
- **Password**: `changeme123`

> [!IMPORTANT]
> Change the default password immediately after first login:
>
> 1. Click your profile icon
> 2. Select "Profile"
> 3. Update your password

## Create a Project

Projects organize bug reports and provide the API key used by the widget.

1. Open the Admin Console and go to **Projects**
2. Click **Create Project** and enter a name
3. Copy the **API Key** shown after creation. You'll need it in the next step.

## Widget Integration

Pick whichever method fits your stack. Replace `YOUR_API_KEY` with the key from the previous step.

### Option 1: Script Tag

Add this before the closing `</body>` tag:

```html
<!-- Start of BugPin Widget -->
<script src="http://localhost:7300/widget.js" data-api-key="YOUR_API_KEY"></script>
<!-- End of BugPin Widget -->
```

No `serverUrl` needed: the widget reads it from the script tag automatically.

### Option 2: npm Package

Install via your bundler (Vite, webpack, etc.):

```bash
npm install @arantic/bugpin-widget
```

Then initialize in your app:

```javascript
import BugPin from '@arantic/bugpin-widget';

await BugPin.init({
  apiKey: 'YOUR_API_KEY',
  serverUrl: 'http://localhost:7300',
});
```

When using the npm package, `serverUrl` is required since the widget no longer loads from a `<script>` tag.

## Full Documentation

Full documentation is available at [docs.bugpin.io](https://docs.bugpin.io):

- [Docker Installation](https://docs.bugpin.io/installation/docker)
- [Bun Installation](https://docs.bugpin.io/installation/bun)
- [Reverse Proxy](https://docs.bugpin.io/installation/reverse-proxy)
- [Configuration](https://docs.bugpin.io/configuration/server)
- [Widget Installation](https://docs.bugpin.io/widget/installation)
- [GitHub Integration](https://docs.bugpin.io/integrations/github)
- [API Reference](https://docs.bugpin.io/api/overview)
- [Security](https://docs.bugpin.io/security/settings)

## Tech Stack

- **Server**: Bun, Hono, SQLite
- **Admin Console**: React, TanStack Query, Tailwind CSS
- **Widget**: Preact, Fabric.js, Shadow DOM

## Support

- [GitHub Issues](https://github.com/aranticlabs/bugpin/issues) - Bug reports and feature requests
- [Documentation](https://docs.bugpin.io) - Guides and reference

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting pull requests.

## License

BugPin uses a multi-license approach:

- **Server & Admin Console**: [AGPL-3.0](LICENSE)
- **Widget**: [MIT](https://github.com/aranticlabs/bugpin/blob/main/src/widget/LICENSE)

Enterprise Edition features are proprietary and not open-source software. They are covered by the [BugPin Business License](LICENSE-EE).
