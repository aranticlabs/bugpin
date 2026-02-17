import { describe, it, expect, afterEach } from 'bun:test';
import {
  adminOnly,
  authMiddleware,
  authorize,
  optionalAuth,
} from '../../../src/server/middleware/auth';
import { authService } from '../../../src/server/services/auth.service';
import { Result } from '../../../src/server/utils/result';
import type { Session, User } from '../../../src/shared/types';

type TestContext = {
  req: {
    header: (name: string) => string | undefined;
    raw: { headers: Headers };
    url: string;
  };
  set: (key: string, value: unknown) => void;
  get: (key: string) => unknown;
  json: (body: unknown, status: number) => Response;
  _vars: Map<string, unknown>;
};

const baseUser: User = {
  id: 'usr_123',
  email: 'test@example.com',
  name: 'Test User',
  role: 'admin',
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const baseSession: Session = {
  id: 'sess_123',
  userId: 'usr_123',
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
  lastActivityAt: new Date().toISOString(),
};

const originalValidateSession = authService.validateSession;

function createContext({
  cookie,
  user,
}: {
  cookie?: string;
  user?: User;
} = {}): TestContext {
  const headers = new Headers();
  if (cookie) {
    headers.set('cookie', cookie);
  }
  const vars = new Map<string, unknown>();
  if (user) {
    vars.set('user', user);
  }

  return {
    req: {
      header: (name: string) => headers.get(name),
      raw: { headers },
      url: 'https://example.com/api',
    },
    set: (key: string, value: unknown) => {
      vars.set(key, value);
    },
    get: (key: string) => vars.get(key),
    json: (body: unknown, status: number) => new Response(JSON.stringify(body), { status }),
    _vars: vars,
  };
}

afterEach(() => {
  authService.validateSession = originalValidateSession;
});

describe('authMiddleware', () => {
  it('returns 401 when session cookie is missing', async () => {
    const ctx = createContext();
    let nextCalled = false;

    const response = await authMiddleware(ctx as unknown as never, async () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(401);
    const body = await (response as Response).json();
    expect(body).toMatchObject({ error: 'UNAUTHORIZED' });
  });

  it('returns 401 when session validation fails', async () => {
    authService.validateSession = async () => Result.fail('Invalid session', 'INVALID_SESSION');

    const ctx = createContext({ cookie: 'session=sess_123' });
    const response = await authMiddleware(ctx as unknown as never, async () => undefined);

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(401);
    const body = await (response as Response).json();
    expect(body).toMatchObject({ error: 'INVALID_SESSION' });
  });

  it('sets user and session when validation succeeds', async () => {
    authService.validateSession = async () => Result.ok({ user: baseUser, session: baseSession });

    const ctx = createContext({ cookie: 'session=sess_123' });
    let nextCalled = false;

    const response = await authMiddleware(ctx as unknown as never, async () => {
      nextCalled = true;
    });

    expect(response).toBeUndefined();
    expect(nextCalled).toBe(true);
    expect(ctx._vars.get('user')).toEqual(baseUser);
    expect(ctx._vars.get('session')).toEqual(baseSession);
  });
});

describe('authorize', () => {
  it('returns 401 when user is missing', async () => {
    const middleware = authorize(['admin']);
    const ctx = createContext();
    const response = await middleware(ctx as unknown as never, async () => undefined);

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(401);
  });

  it('returns 403 when user role is not allowed', async () => {
    const middleware = authorize(['admin']);
    const ctx = createContext({
      user: { ...baseUser, role: 'viewer' },
    });
    const response = await middleware(ctx as unknown as never, async () => undefined);

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(403);
  });

  it('calls next when role is allowed', async () => {
    const middleware = authorize(['admin', 'editor']);
    const ctx = createContext({ user: baseUser });
    let nextCalled = false;

    const response = await middleware(ctx as unknown as never, async () => {
      nextCalled = true;
    });

    expect(response).toBeUndefined();
    expect(nextCalled).toBe(true);
  });
});

describe('optionalAuth', () => {
  it('skips validation when no session cookie is present', async () => {
    let validateCalled = false;
    authService.validateSession = async () => {
      validateCalled = true;
      return Result.fail('Invalid session');
    };

    const ctx = createContext();
    let nextCalled = false;
    await optionalAuth(ctx as unknown as never, async () => {
      nextCalled = true;
    });

    expect(validateCalled).toBe(false);
    expect(nextCalled).toBe(true);
  });

  it('sets user when session is valid', async () => {
    authService.validateSession = async () => Result.ok({ user: baseUser, session: baseSession });

    const ctx = createContext({ cookie: 'session=sess_123' });
    await optionalAuth(ctx as unknown as never, async () => undefined);

    expect(ctx._vars.get('user')).toEqual(baseUser);
    expect(ctx._vars.get('session')).toEqual(baseSession);
  });
});

describe('adminOnly', () => {
  it('returns 401 when session cookie is missing', async () => {
    const ctx = createContext();
    const response = await adminOnly(ctx as unknown as never, async () => undefined);

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(401);
  });

  it('returns 403 when user is not admin', async () => {
    authService.validateSession = async () =>
      Result.ok({ user: { ...baseUser, role: 'viewer' }, session: baseSession });

    const ctx = createContext({ cookie: 'session=sess_123' });
    const response = await adminOnly(ctx as unknown as never, async () => undefined);

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(403);
  });

  it('sets user and session when admin', async () => {
    authService.validateSession = async () => Result.ok({ user: baseUser, session: baseSession });

    const ctx = createContext({ cookie: 'session=sess_123' });
    let nextCalled = false;

    const response = await adminOnly(ctx as unknown as never, async () => {
      nextCalled = true;
    });

    expect(response).toBeUndefined();
    expect(nextCalled).toBe(true);
    expect(ctx._vars.get('user')).toEqual(baseUser);
  });
});
