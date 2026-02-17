# CODING-PRINCIPLES.md

Mandatory architecture principles and coding standards for BugPin.

## Quick Reference

```
✅ ALWAYS:
- Follow SOLID principles (SRP, OCP, LSP, ISP, DIP)
- Maintain strict separation of concerns
- Use dependency injection via constructor parameters
- Write testable code with >80% coverage
- Use Result pattern for error handling
- Write production-ready TypeScript (must pass strict tsc compilation)
- Keep business logic separate from infrastructure
- Repository pattern for all data access

❌ NEVER:
- Mix business logic with HTTP handlers
- Create "god classes" that do everything
- Use concrete implementations instead of interfaces
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
return Result.ok(report);                    // Success
return Result.fail('Report not found');      // Failure with message
return Result.fail('Not found', 'NOT_FOUND'); // Failure with error code

// Checking results
if (Result.isOk(result)) { /* use result.value */ }
if (Result.isFail(result)) { /* use result.error */ }

// Utilities
const value = Result.unwrap(result);         // Throws if failed
const value = Result.unwrapOr(result, defaultValue);
const mapped = Result.map(result, fn);       // Transform value
const chained = Result.flatMap(result, fn);  // Chain operations
const wrapped = await Result.tryAsync(fn);   // Wrap async, catch errors
```

### Type Guards

```typescript
function isValidReport(data: unknown): data is Report {
  return typeof data === 'object' && data !== null && 'id' in data && 'title' in data;
}

// Exhaustive switch pattern
function handleStatus(status: ReportStatus): void {
  switch (status) {
    case 'open': break;
    case 'in_progress': break;
    case 'resolved': break;
    case 'closed': break;
    default: const _exhaustive: never = status;
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
reportsRoutes.patch('/:id', authorize(['admin']), async (c) => {
  const result = await reportsService.update(c.req.param('id'), await c.req.json());
  return result.success ? c.json(result.value) : c.json({ error: result.error }, 400);
});
```

### Services (`services/`)

- Validation rules and business workflows
- Orchestrate repository calls
- Return Result types
- **NEVER**: Direct database queries, HTTP concerns (status codes, headers)

```typescript
import { Result } from '../utils/result';

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

Interfaces defined in `database/repositories/interfaces.ts`:

```typescript
// Interface example (from interfaces.ts)
export interface IReportsRepository {
  create(data: CreateReportData): Promise<Report>;
  findById(id: string): Promise<Report | null>;
  find(filter: ReportFilter): Promise<{ data: Report[]; total: number }>;
  update(id: string, updates: Partial<Report>): Promise<Report | null>;
  delete(id: string): Promise<boolean>;
}

// Implementation example
export const reportsRepo: IReportsRepository = {
  async findById(id: string): Promise<Report | null> {
    const row = getDb().query('SELECT * FROM reports WHERE id = ?').get(id) as Report | undefined;
    return row ?? null;
  },
  async update(id: string, updates: Partial<Report>): Promise<Report | null> {
    getDb().run('UPDATE reports SET title = ?, status = ?, updated_at = ? WHERE id = ?',
      [updates.title, updates.status, updates.updatedAt, id]);
    return this.findById(id);
  },
};
```

## SOLID Principles

### Single Responsibility (SRP)

Each class/module has ONE responsibility:
- `ReportService` - report business logic only
- `ReportsRepository` - report persistence only
- `WebhookService` - webhook dispatch only

### Open/Closed (OCP)

Extend through new handlers, don't modify existing:
- `CreateReportHandler` for single reports
- `BulkCreateReportsHandler` for batch creation
- `ForwardReportHandler` for forwarding

### Dependency Inversion (DIP)

Depend on abstractions, not concretions:

```typescript
// ✅ Depend on interface
class ReportService {
  constructor(private readonly reportsRepo: IReportsRepository) {}
}

// ❌ Depend on concrete class
class ReportService {
  constructor(private readonly reportsRepo: SQLiteReportsRepository) {}
}
```

## Naming Conventions

| Context | Convention | Example |
|---------|------------|---------|
| Files (backend) | kebab-case | `reports.service.ts`, `auth.middleware.ts` |
| Files (components) | PascalCase | `ReportList.tsx`, `Dashboard.tsx` |
| Files (hooks) | camelCase | `useReports.ts`, `useAuth.ts` |
| Classes/Interfaces | PascalCase | `ReportService`, `IReportsRepository` |
| Functions/Variables | camelCase | `getReports()`, `isLoading` |
| Constants | UPPER_SNAKE_CASE | `MAX_FILE_SIZE`, `SESSION_MAX_AGE` |
| Database tables/columns | snake_case | `reports`, `project_id`, `created_at` |
| API routes | kebab-case, plural | `/api/reports`, `/api/projects` |
| JSON fields | snake_case | `{ "project_id": "...", "created_at": "..." }` |
| CSS classes | kebab-case | `report-list`, `login-form` |

## Import Order

1. External packages (`import { Hono } from 'hono'`)
2. Internal modules (`import { reportsService } from '../services'`)
3. Types (`import type { Report } from '@shared/types'`)

## Code Style

**File structure**: Start directly with imports (no file-level JSDoc headers)

```typescript
// ✅ Correct
import { useState } from 'react';

export function MyComponent() { }
```

**Comments**: Minimal, no decorative separators (`// ======`). Method JSDoc allowed for complex functions only.

## Widget Constraints

- Bundle size: <50KB gzipped
- No external runtime dependencies (Preact is bundled)
- Must work in Shadow DOM (no global CSS leakage)
- Offline-first with IndexedDB queue
- ES2020 target for browser compatibility

## Testing

| Type | Target | Approach |
|------|--------|----------|
| Unit | Services | Mock all dependencies |
| Unit | Utils | 100% coverage for Result, ID generation |
| Integration | Repositories | Real SQLite database |
| Integration | API | Full request/response with test DB |
| E2E | Widget/Admin | User flow tests |

### Mocking with Bun

```typescript
import { describe, it, expect, mock } from 'bun:test';
import type { IReportsRepository } from '../database/repositories/interfaces';

const mockRepo: IReportsRepository = {
  findById: mock(() => Promise.resolve(null)),
  update: mock(() => Promise.resolve(null)),
  // ... other methods
};

describe('ReportService', () => {
  it('returns error when report not found', async () => {
    const service = createReportsService(mockRepo);
    const result = await service.update('invalid-id', { title: 'New' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Report not found');
  });
});
```

## Development Workflow

### Adding a New Feature

1. **Define types** in `@shared/types` or repository interfaces
2. **Create repository method** in `database/repositories/`
3. **Add service logic** with Result pattern in `services/`
4. **Add route handler** that delegates to service in `routes/`

## Pre-Commit Checklist

1. `bun tsc --noEmit` passes (all packages)
2. `bun test` passes
3. Routes are thin (no business logic)
4. Services return `Result<T>`
5. No `any` types
6. New code has tests
