# Architecture Overview

Quick reference for new developers to understand the BugPin codebase structure.

## Directory Structure

```
src/
├── server/                 # Bun + Hono backend
│   ├── app.ts              # Hono app setup
│   ├── config.ts           # Environment configuration
│   ├── routes/
│   │   ├── api/            # Admin Console API handlers
│   │   └── widget/         # Widget submission endpoint
│   ├── services/           # Business logic, validation
│   │   └── integrations/   # GitHub sync and other integrations
│   ├── database/
│   │   ├── database.ts     # SQLite connection
│   │   ├── migrations/     # SQL migration files
│   │   └── repositories/   # Data access layer (*.repo.ts)
│   │       └── interfaces.ts
│   ├── storage/
│   │   └── files.ts        # File system operations
│   ├── middleware/         # Auth, validation, rate limiting, CORS
│   ├── i18n/               # Server-side labels and email defaults
│   ├── types/              # EE plugin contract
│   └── utils/
│       ├── result.ts       # Result type and helpers
│       └── ee-hooks.ts     # Extension points for Enterprise Edition
├── admin/                  # React Admin Console
│   ├── pages/
│   ├── components/
│   │   └── ui/             # shadcn/ui components
│   ├── contexts/           # Auth, branding, theme providers
│   ├── hooks/
│   ├── lib/
│   └── api/
├── widget/                 # Preact embeddable widget
│   ├── components/
│   ├── capture/            # Screenshot and screen recording
│   ├── annotate/           # Annotation canvas
│   ├── api/                # Report submission
│   ├── hooks/
│   ├── i18n/
│   └── storage/            # IndexedDB offline queue and drafts
└── shared/                 # Types and helpers shared between packages (@shared/*)

tests/                      # Server and shared tests
ee/                         # Enterprise Edition (git submodule)
```

## Tech Stack

| Component     | Technology                                |
| ------------- | ----------------------------------------- |
| Server        | Bun runtime, Hono framework, Zod          |
| Database      | SQLite (single file)                      |
| Admin Console | React 19, Vite, TanStack Query, shadcn/ui |
| Widget        | Preact, Shadow DOM, idb                   |
| Auth          | Session-based, bcrypt, passkeys, TOTP 2FA |

## Data Flow

```
Client Request
     ↓
[Middleware] → Auth, rate limiting, validation
     ↓
[Route] → Parse request, call service
     ↓
[Service] → Business logic, validation, Result<T>
     ↓
[Repository] → SQLite queries
     ↓
[Database] → data/bugpin.db
```

## Key Directories

### Server (`src/server/`)

| Directory                | Purpose                                                       |
| ------------------------ | ------------------------------------------------------------- |
| `routes/`                | HTTP request handlers. Thin layer that delegates to services. |
| `services/`              | Business logic. Returns `Result<T>` types.                    |
| `database/repositories/` | Data access. SQLite queries only.                             |
| `database/migrations/`   | SQL schema migrations.                                        |
| `storage/`               | File system operations (uploads).                             |
| `middleware/`            | Request processing (auth, validation, rate limiting).         |
| `utils/`                 | Shared utilities (Result, ID generation, logger, EE hooks).   |

### Admin Console (`src/admin/`)

| Directory     | Purpose                                                   |
| ------------- | --------------------------------------------------------- |
| `pages/`      | Route-level page components.                              |
| `components/` | Reusable UI components, built on shadcn/ui in `ui/`.      |
| `contexts/`   | React context providers (`useAuth`, branding, theme).     |
| `hooks/`      | Custom React hooks (`useSettings`, `useDashboard`).       |
| `lib/`        | Framework-free helpers (formatting, exports, API errors). |
| `api/`        | API client functions.                                     |

### Widget (`src/widget/`)

| Directory     | Purpose                                      |
| ------------- | -------------------------------------------- |
| `components/` | Widget UI (launcher button, dialog, panels). |
| `capture/`    | Screenshot capture and screen recording.     |
| `annotate/`   | Annotation canvas.                           |
| `api/`        | Report submission.                           |
| `storage/`    | IndexedDB for offline queue and drafts.      |
| `i18n/`       | Widget locales and language detection.       |

## Widget Constraints

- Bundle size: ≤190KB gzipped (IIFE bundle, the one customers embed), enforced by `make check-widget-size`
- No external runtime dependencies
- Shadow DOM for CSS isolation
- Offline-first with IndexedDB queue
- ES2020 browser target

## Runtime Data

```
data/
├── bugpin.db              # SQLite database
└── uploads/               # User files
    ├── screenshots/
    ├── attachments/
    ├── avatars/
    └── branding/
```

This directory is git-ignored and created at runtime.
