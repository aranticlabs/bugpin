# CODING-PRINCIPLES.md

Mandatory architecture principles and coding standards for BugPin.

## Quick Reference

```
✅ ALWAYS:
- Follow SOLID principles (SRP, OCP, LSP, ISP, DIP)
- Maintain strict separation of concerns
- Keep services and repositories as module singletons with a single concern
- Write testable code with >80% coverage
- Use Result pattern for error handling
- Write production-ready TypeScript (must pass strict tsc compilation)
- Keep business logic separate from infrastructure
- Repository pattern for all data access

❌ NEVER:
- Mix business logic with HTTP handlers
- Create "god classes" that do everything
- Bypass the repository layer with ad-hoc queries
- Skip unit tests
- Put database queries in controllers/routes
- Violate module boundaries
- Modify existing handlers for new features (extend instead)
- Use `any` type or ignore TypeScript errors
```

## TypeScript Strict Compilation

**All code must compile with `tsc --noEmit` before deployment.**

Required compiler options: `strict`, `noImplicitAny`, `strictNullChecks`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`.

### Result Pattern

Located in `src/server/utils/result.ts`:

```typescript
import { Result } from '../utils/result';

// Creating results
return Result.ok(report); // Success
return Result.fail('Report not found'); // Failure with message
return Result.fail('Not found', 'NOT_FOUND'); // Failure with error code

// Checking results
if (Result.isOk(result)) {
  /* use result.value */
}
if (Result.isFail(result)) {
  /* use result.error */
}

// Utilities
const value = Result.unwrap(result); // Throws if failed
const value = Result.unwrapOr(result, defaultValue);
const mapped = Result.map(result, fn); // Transform value
const chained = Result.flatMap(result, fn); // Chain operations
const chainedAsync = await Result.flatMapAsync(result, asyncFn);
const wrapped = Result.try(fn); // Wrap sync, catch errors
const wrappedAsync = await Result.tryAsync(fn); // Wrap async, catch errors
const combined = Result.all([a, b]); // Fail on the first failure
```

Routes turn a failed result into `{ success: false, error: result.code, message: result.error }` with the appropriate status code.

### Type Guards

```typescript
function isValidReport(data: unknown): data is Report {
  return typeof data === 'object' && data !== null && 'id' in data && 'title' in data;
}

// Exhaustive switch pattern
function handleStatus(status: ReportStatus): void {
  switch (status) {
    case 'open':
      break;
    case 'in_progress':
      break;
    case 'resolved':
      break;
    case 'closed':
      break;
    default:
      const _exhaustive: never = status;
  }
}
```

## Layer Responsibilities

### Routes (`routes/`)

- Parse request parameters
- Call service methods
- Transform service results to HTTP responses
- Apply middleware (auth, validation, rate limiting)
- **NEVER**: Business logic, database queries, file system operations

```typescript
reports.patch('/:id', authorize(['admin', 'editor']), async (c) => {
  const result = await reportsService.update(c.req.param('id'), await c.req.json());
  if (!result.success) {
    return c.json({ success: false, error: result.code, message: result.error }, 400);
  }
  return c.json({ success: true, report: result.value });
});
```

### Services (`services/`)

- Validation rules and business workflows
- Orchestrate repository calls
- Return Result types
- **NEVER**: Direct database queries, HTTP concerns (status codes, headers)

```typescript
import { Result } from '../utils/result.js';
import { reportsRepo } from '../database/repositories/reports.repo.js';

export const reportsService = {
  async update(id: string, updates: Partial<Report>): Promise<Result<Report>> {
    if (updates.title && updates.title.length < 4) {
      return Result.fail('Title must be at least 4 characters');
    }
    const report = await reportsRepo.findById(id);
    if (!report) return Result.fail('Report not found', 'NOT_FOUND');

    const updated = { ...report, ...updates, updatedAt: new Date().toISOString() };
    await reportsRepo.update(id, updated);
    return Result.ok(updated);
  },
};
```

### Repositories (`database/repositories/`)

- SQLite queries with parameterized statements
- Type-safe data mapping
- Return domain types
- **NEVER**: Business logic, validation rules

Interfaces in `database/repositories/interfaces.ts` document each repository's contract. Implementations are exported objects in `*.repo.ts`:

```typescript
// Interface example (from interfaces.ts)
export interface IReportsRepository {
  create(data: CreateReportData): Promise<Report>;
  findById(id: string): Promise<Report | null>;
  find(filter: ReportFilter): Promise<{ data: Report[]; total: number }>;
  update(id: string, updates: Partial<Report>): Promise<Report | null>;
  delete(id: string): Promise<boolean>;
}

// Implementation example (reports.repo.ts)
export const reportsRepo = {
  async findById(id: string): Promise<Report | null> {
    const row = getDb().query('SELECT * FROM reports WHERE id = ?').get(id) as Report | undefined;
    return row ?? null;
  },
  async update(id: string, updates: Partial<Report>): Promise<Report | null> {
    getDb().run('UPDATE reports SET title = ?, status = ?, updated_at = ? WHERE id = ?', [
      updates.title,
      updates.status,
      updates.updatedAt,
      id,
    ]);
    return this.findById(id);
  },
};
```

## SOLID Principles

### Single Responsibility (SRP)

Each class/module has ONE responsibility:

- `reportsService` - report business logic only
- `reportsRepo` - report persistence only
- `notificationsService` - notification dispatch only

### Open/Closed (OCP)

Extend through new route handlers and service methods instead of growing existing ones with unrelated branches. Enterprise Edition features plug in through `utils/ee-hooks.ts` rather than by editing core services.

### Dependencies

Services and repositories are module singletons imported directly (`import { reportsRepo } from '../database/repositories/reports.repo.js'`). Keep the dependency direction one way: routes → services → repositories. Tests replace collaborators with `spyOn` instead of constructor injection.

## Naming Conventions

| Context                 | Convention         | Example                                      |
| ----------------------- | ------------------ | -------------------------------------------- |
| Files (backend)         | kebab-case         | `reports.service.ts`, `reports.repo.ts`      |
| Files (components)      | PascalCase         | `ReportList.tsx`, `Dashboard.tsx`            |
| Files (Admin hooks)     | camelCase          | `useSettings.ts`, `useDashboard.ts`          |
| Files (widget hooks)    | kebab-case         | `use-locale.ts`, `use-screen-recording.ts`   |
| Classes/Interfaces      | PascalCase         | `ReportService`, `IReportsRepository`        |
| Functions/Variables     | camelCase          | `getReports()`, `isLoading`                  |
| Constants               | UPPER_SNAKE_CASE   | `MAX_FILE_SIZE`, `SESSION_MAX_AGE`           |
| Database tables/columns | snake_case         | `reports`, `project_id`, `created_at`        |
| API routes              | kebab-case, plural | `/api/reports`, `/api/projects`              |
| JSON fields             | camelCase          | `{ "projectId": "...", "createdAt": "..." }` |
| CSS classes             | kebab-case         | `report-list`, `login-form`                  |

## Import Order

1. External packages (`import { Hono } from 'hono'`)
2. Internal modules (`import { reportsService } from '../services/reports.service.js'`)
3. Types (`import type { Report } from '@shared/types'`)

Server imports of local files use the `.js` extension.

## Code Style

**File structure**: Start directly with imports (no file-level JSDoc headers)

```typescript
// ✅ Correct
import { useState } from 'react';

export function MyComponent() {}
```

**Comments**: Minimal, no decorative separators (`// ======`). Method JSDoc allowed for complex functions only.

## Widget Constraints

- Bundle size: ≤190KB gzipped (IIFE; ESM build may be larger)
- No external runtime dependencies (Preact is bundled)
- Must work in Shadow DOM (no global CSS leakage)
- Offline-first with IndexedDB queue
- ES2020 target for browser compatibility

## Testing

| Type        | Target       | Approach                                |
| ----------- | ------------ | --------------------------------------- |
| Unit        | Services     | Stub collaborators with `spyOn`         |
| Unit        | Utils        | 100% coverage for Result, ID generation |
| Integration | Repositories | Real SQLite database                    |
| Integration | API          | Full request/response with test DB      |
| Component   | Widget/Admin | Rendered components and hooks           |

Test locations: `tests/server/` and `tests/shared/` for the server, `src/admin/tests/` and `src/widget/tests/` for the frontends, `ee/tests/` for Enterprise Edition.

### Mocking with Bun

```typescript
import { describe, it, expect, spyOn, afterEach } from 'bun:test';
import { reportsService } from '../../src/server/services/reports.service';
import { reportsRepo } from '../../src/server/database/repositories/reports.repo';

describe('reportsService.update', () => {
  afterEach(() => {
    spyOn(reportsRepo, 'findById').mockRestore();
  });

  it('returns error when report not found', async () => {
    spyOn(reportsRepo, 'findById').mockResolvedValue(null);
    const result = await reportsService.update('invalid-id', { title: 'New' });
    expect(result.success).toBe(false);
  });
});
```

## Development Workflow

### Adding a New Feature

1. **Define types** in `src/shared/types.ts` (`@shared/types`) or repository interfaces
2. **Create repository method** in `database/repositories/`
3. **Add service logic** with Result pattern in `services/`
4. **Add route handler** that delegates to service in `routes/`

## Pre-Commit Checklist

1. `make typecheck` and `make typecheck-tests` pass
2. `make test` passes
3. `make knip` reports no unused code
4. Routes are thin (no business logic)
5. Services return `Result<T>`
6. No `any` types
7. New code has tests
