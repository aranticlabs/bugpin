import { describe, it, expect } from 'bun:test';
import { schemas, validate } from '../../src/server/middleware/validate';

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

  it('validates project video upload limits', () => {
    expect(
      schemas.updateProject.safeParse({
        settings: {
          screenshot: {
            maxVideoUploadSizeMb: 100,
            maxVideoUploadMbPerDay: 0,
            enableScreenRecording: true,
            allowRecordingMicrophone: true,
            maxRecordingDurationSeconds: 600,
          },
        },
      }).success
    ).toBe(true);
    expect(
      schemas.updateProject.safeParse({
        settings: { screenshot: { maxVideoUploadSizeMb: 101 } },
      }).success
    ).toBe(false);
    expect(
      schemas.updateProject.safeParse({
        settings: { screenshot: { maxRecordingDurationSeconds: 601 } },
      }).success
    ).toBe(false);
  });

  it('validates global video upload limits', () => {
    expect(
      schemas.updateSettings.safeParse({
        screenshot: {
          maxVideoUploadSizeMb: 100,
          maxVideoUploadMbPerDay: 1048576,
          enableScreenRecording: false,
          allowRecordingMicrophone: false,
          maxRecordingDurationSeconds: 10,
        },
      }).success
    ).toBe(true);
    expect(
      schemas.updateSettings.safeParse({
        screenshot: { maxVideoUploadMbPerDay: 1048577 },
      }).success
    ).toBe(false);
    expect(
      schemas.updateSettings.safeParse({
        screenshot: { maxRecordingDurationSeconds: 9 },
      }).success
    ).toBe(false);
  });

  it('accepts only boolean public video link settings in integration configs', () => {
    const config = { owner: 'org', repo: 'repo', accessToken: 'token' };
    const create = (publicVideoLinks: unknown) =>
      schemas.createIntegration.safeParse({
        projectId: 'prj_1',
        type: 'github',
        name: 'GitHub',
        config: { ...config, publicVideoLinks },
      }).success;
    const update = (publicVideoLinks: unknown) =>
      schemas.updateIntegration.safeParse({ config: { ...config, publicVideoLinks } }).success;

    for (const valid of [true, false, undefined]) {
      expect(create(valid)).toBe(true);
      expect(update(valid)).toBe(true);
    }
    for (const invalid of ['false', 'true', 1, null]) {
      expect(create(invalid)).toBe(false);
      expect(update(invalid)).toBe(false);
    }
  });
});
