# Architecture Overview

Quick reference for new developers to understand the BugPin codebase structure.

## Directory Structure

```
src/
├── server/                 # Bun + Hono backend
│   ├── routes/             # HTTP handlers only
│   ├── services/           # Business logic, validation
│   ├── database/
│   │   ├── database.ts     # SQLite connection
│   │   ├── migrations/     # SQL migration files
│   │   └── repositories/   # Data access layer
│   │       └── interfaces.ts
│   ├── storage/
│   │   └── files.ts        # File system operations
│   ├── middleware/         # Auth, validation, rate limiting
│   └── utils/
│       └── result.ts       # Result type and helpers
├── admin/                  # React admin portal
│   ├── pages/
│   ├── components/
│   ├── hooks/
│   └── api/
├── widget/                 # Preact embeddable widget
│   ├── components/
│   ├── utils/
│   └── storage/            # IndexedDB offline cache
└── shared/                 # Shared types between packages
    └── types/
```

## Tech Stack

| Component | Technology |
|-----------|------------|
| Server | Bun runtime, Hono framework |
| Database | SQLite (single file) |
| Admin Console | React 18, Vite, TanStack Query |
| Widget | Preact, Shadow DOM |
| Auth | Session-based, bcrypt |

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

| Directory | Purpose |
|-----------|---------|
| `routes/` | HTTP request handlers. Thin layer that delegates to services. |
| `services/` | Business logic. Returns `Result<T>` types. |
| `database/repositories/` | Data access. SQLite queries only. |
| `database/migrations/` | SQL schema migrations. |
| `storage/` | File system operations (uploads). |
| `middleware/` | Request processing (auth, validation). |
| `utils/` | Shared utilities (Result, ID generation). |

### Admin (`src/admin/`)

| Directory | Purpose |
|-----------|---------|
| `pages/` | Route-level page components. |
| `components/` | Reusable UI components. |
| `hooks/` | Custom React hooks (useAuth, useReports). |
| `api/` | API client functions. |

### Widget (`src/widget/`)

| Directory | Purpose |
|-----------|---------|
| `components/` | Widget UI (button, modal, form). |
| `utils/` | Screenshot capture, annotations. |
| `storage/` | IndexedDB for offline queue. |

## Widget Constraints

- Bundle size: <50KB gzipped
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
    └── branding/
```

This directory is git-ignored and created at runtime.
