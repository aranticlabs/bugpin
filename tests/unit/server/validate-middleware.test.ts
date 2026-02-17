import { describe, it, expect } from 'bun:test';
import { schemas, validate } from '../../../src/server/middleware/validate';

type TestContext = {
  req: {
    header: (name: string) => string | undefined;
    json: () => Promise<unknown>;
    text: () => Promise<string>;
    parseBody: () => Promise<unknown>;
    query: () => Record<string, string>;
    param: () => Record<string, string>;
  };
  set: (key: string, value: unknown) => void;
  json: (body: unknown, status: number) => Response;
  _vars: Map<string, unknown>;
};

function createContext({
  contentType = 'application/json',
  body,
  bodyText = '',
  query = {},
  params = {},
  throwOnJson = false,
}: {
  contentType?: string;
  body?: unknown;
  bodyText?: string;
  query?: Record<string, string>;
  params?: Record<string, string>;
  throwOnJson?: boolean;
} = {}): TestContext {
  const vars = new Map<string, unknown>();

  return {
    req: {
      header: (name: string) => (name.toLowerCase() === 'content-type' ? contentType : undefined),
      json: async () => {
        if (throwOnJson) {
          throw new Error('Invalid JSON');
        }
        return body;
      },
      text: async () => bodyText,
      parseBody: async () => body ?? {},
      query: () => query,
      param: () => params,
    },
    set: (key: string, value: unknown) => {
      vars.set(key, value);
    },
    json: (payload: unknown, status: number) => new Response(JSON.stringify(payload), { status }),
    _vars: vars,
  };
}

describe('validate middleware', () => {
  it('stores validated JSON body data', async () => {
    const middleware = validate({
      body: schemas.createProject,
    });

    const ctx = createContext({ body: { name: 'BugPin' } });
    let nextCalled = false;

    const response = await middleware(ctx as unknown as never, async () => {
      nextCalled = true;
    });

    expect(response).toBeUndefined();
    expect(nextCalled).toBe(true);
    expect(ctx._vars.get('validatedBody')).toEqual({ name: 'BugPin' });
  });

  it('returns 400 when JSON body validation fails', async () => {
    const middleware = validate({
      body: schemas.createProject,
    });

    const ctx = createContext({ body: { name: 123 } });
    const response = await middleware(ctx as unknown as never, async () => undefined);

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(400);
    const payload = await (response as Response).json();
    expect(payload.details[0]).toMatchObject({ field: 'name' });
  });

  it('parses multipart form bodies', async () => {
    const middleware = validate({
      body: schemas.createProject,
    });

    const ctx = createContext({
      contentType: 'multipart/form-data',
      body: { name: 'Report' },
    });
    const response = await middleware(ctx as unknown as never, async () => undefined);

    expect(response).toBeUndefined();
    expect(ctx._vars.get('validatedBody')).toEqual({ name: 'Report' });
  });

  it('returns 400 when query validation fails', async () => {
    const middleware = validate({
      query: schemas.pagination,
    });

    const ctx = createContext({ query: { page: '0' } });
    const response = await middleware(ctx as unknown as never, async () => undefined);

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(400);
    const payload = await (response as Response).json();
    expect(payload.details[0]).toMatchObject({ field: 'query.page' });
  });

  it('stores validated params data', async () => {
    const middleware = validate({
      params: schemas.id,
    });

    const ctx = createContext({ params: { id: 'rpt_123' } });
    const response = await middleware(ctx as unknown as never, async () => undefined);

    expect(response).toBeUndefined();
    expect(ctx._vars.get('validatedParams')).toEqual({ id: 'rpt_123' });
  });

  it('returns 400 when body parsing throws', async () => {
    const middleware = validate({
      body: schemas.createProject,
    });

    const ctx = createContext({ throwOnJson: true });
    const response = await middleware(ctx as unknown as never, async () => undefined);

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(400);
    const payload = await (response as Response).json();
    expect(payload.details[0]).toMatchObject({ field: 'body' });
  });
});
