import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Hono } from '../../../src/server/node_modules/hono/dist/index.js';
import { githubWebhookRoutes } from '../../../src/server/routes/api/github-webhook';
import { integrationsRepo } from '../../../src/server/database/repositories/integrations.repo';
import { githubSyncService } from '../../../src/server/services/integrations/github-sync.service';
import { Result } from '../../../src/server/utils/result';
import { logger } from '../../../src/server/utils/logger';
import type { Integration, GitHubIntegrationConfig } from '../../../src/shared/types';

const baseIntegration: Integration = {
  id: 'int_1',
  projectId: 'prj_1',
  type: 'github',
  config: {
    owner: 'test-owner',
    repo: 'test-repo',
    accessToken: 'ghp_test',
    webhookSecret: 'webhook_secret_123',
    syncEnabled: true,
  } as GitHubIntegrationConfig,
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const originalIntegrationsRepo = { ...integrationsRepo };
const originalGithubSyncService = { ...githubSyncService };
const originalLogger = { ...logger };

let integrationResult: Integration | null = baseIntegration;

beforeEach(() => {
  integrationResult = baseIntegration;

  integrationsRepo.findById = async () => integrationResult;

  githubSyncService.handleWebhook = async () => Result.ok(undefined);

  logger.info = () => undefined;
  logger.warn = () => undefined;
  logger.error = () => undefined;
  logger.debug = () => undefined;
});

afterEach(() => {
  Object.assign(integrationsRepo, originalIntegrationsRepo);
  Object.assign(githubSyncService, originalGithubSyncService);
  Object.assign(logger, originalLogger);
});

function createApp() {
  const app = new Hono();
  app.route('/github-webhook', githubWebhookRoutes);
  return app;
}

async function computeSignature(payload: string, secret: string): Promise<string> {
  const hmac = new Bun.CryptoHasher('sha256', secret);
  hmac.update(payload);
  return `sha256=${hmac.digest('hex')}`;
}

describe('github-webhook routes', () => {
  describe('POST /github-webhook/:integrationId', () => {
    it('returns 404 when integration not found', async () => {
      integrationResult = null;

      const app = createApp();
      const res = await app.request('http://localhost/github-webhook/int_missing', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-github-event': 'issues',
          'x-github-delivery': 'delivery_1',
        },
        body: JSON.stringify({ action: 'opened', issue: { number: 1, state: 'open' } }),
      });

      expect(res.status).toBe(404);
    });

    it('returns 400 when integration is not github type', async () => {
      integrationResult = {
        ...baseIntegration,
        type: 'linear' as const,
      };

      const app = createApp();
      const res = await app.request('http://localhost/github-webhook/int_1', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-github-event': 'issues',
          'x-github-delivery': 'delivery_1',
        },
        body: JSON.stringify({ action: 'opened', issue: { number: 1, state: 'open' } }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Invalid integration type');
    });

    it('returns 401 when signature is missing but secret is configured', async () => {
      const app = createApp();
      const res = await app.request('http://localhost/github-webhook/int_1', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-github-event': 'issues',
          'x-github-delivery': 'delivery_1',
        },
        body: JSON.stringify({ action: 'opened', issue: { number: 1, state: 'open' } }),
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('Missing signature');
    });

    it('returns 401 when signature is invalid', async () => {
      const app = createApp();
      const res = await app.request('http://localhost/github-webhook/int_1', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-github-event': 'issues',
          'x-github-delivery': 'delivery_1',
          'x-hub-signature-256': 'sha256=invalid',
        },
        body: JSON.stringify({ action: 'opened', issue: { number: 1, state: 'open' } }),
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('Invalid signature');
    });

    it('returns 400 for invalid JSON', async () => {
      const payload = 'not-json';
      const signature = await computeSignature(payload, 'webhook_secret_123');

      const app = createApp();
      const res = await app.request('http://localhost/github-webhook/int_1', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-github-event': 'issues',
          'x-github-delivery': 'delivery_1',
          'x-hub-signature-256': signature,
        },
        body: payload,
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Invalid JSON');
    });

    it('responds to ping event', async () => {
      const payload = JSON.stringify({ zen: 'test' });
      const signature = await computeSignature(payload, 'webhook_secret_123');

      const app = createApp();
      const res = await app.request('http://localhost/github-webhook/int_1', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-github-event': 'ping',
          'x-github-delivery': 'delivery_1',
          'x-hub-signature-256': signature,
        },
        body: payload,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.message).toBe('pong');
    });

    it('ignores unsupported issue actions', async () => {
      const payload = JSON.stringify({
        action: 'labeled',
        issue: { number: 1, state: 'open', title: 'Test' },
      });
      const signature = await computeSignature(payload, 'webhook_secret_123');

      const app = createApp();
      const res = await app.request('http://localhost/github-webhook/int_1', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-github-event': 'issues',
          'x-github-delivery': 'delivery_1',
          'x-hub-signature-256': signature,
        },
        body: payload,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.message).toBe('Action ignored');
    });

    it('processes issues opened event', async () => {
      let handledAction: string | undefined;
      githubSyncService.handleWebhook = async (_id, action) => {
        handledAction = action;
        return Result.ok(undefined);
      };

      const payload = JSON.stringify({
        action: 'opened',
        issue: { number: 1, state: 'open', title: 'Test' },
      });
      const signature = await computeSignature(payload, 'webhook_secret_123');

      const app = createApp();
      const res = await app.request('http://localhost/github-webhook/int_1', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-github-event': 'issues',
          'x-github-delivery': 'delivery_1',
          'x-hub-signature-256': signature,
        },
        body: payload,
      });

      expect(res.status).toBe(200);
      expect(handledAction).toBe('opened');
    });

    it('processes issues closed event', async () => {
      let handledAction: string | undefined;
      githubSyncService.handleWebhook = async (_id, action) => {
        handledAction = action;
        return Result.ok(undefined);
      };

      const payload = JSON.stringify({
        action: 'closed',
        issue: { number: 1, state: 'closed', title: 'Test' },
      });
      const signature = await computeSignature(payload, 'webhook_secret_123');

      const app = createApp();
      const res = await app.request('http://localhost/github-webhook/int_1', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-github-event': 'issues',
          'x-github-delivery': 'delivery_1',
          'x-hub-signature-256': signature,
        },
        body: payload,
      });

      expect(res.status).toBe(200);
      expect(handledAction).toBe('closed');
    });

    it('processes issues reopened event', async () => {
      let handledAction: string | undefined;
      githubSyncService.handleWebhook = async (_id, action) => {
        handledAction = action;
        return Result.ok(undefined);
      };

      const payload = JSON.stringify({
        action: 'reopened',
        issue: { number: 1, state: 'open', title: 'Test' },
      });
      const signature = await computeSignature(payload, 'webhook_secret_123');

      const app = createApp();
      const res = await app.request('http://localhost/github-webhook/int_1', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-github-event': 'issues',
          'x-github-delivery': 'delivery_1',
          'x-hub-signature-256': signature,
        },
        body: payload,
      });

      expect(res.status).toBe(200);
      expect(handledAction).toBe('reopened');
    });

    it('returns 500 when webhook handler fails', async () => {
      githubSyncService.handleWebhook = async () => Result.fail('Sync failed', 'SYNC_ERROR');

      const payload = JSON.stringify({
        action: 'closed',
        issue: { number: 1, state: 'closed', title: 'Test' },
      });
      const signature = await computeSignature(payload, 'webhook_secret_123');

      const app = createApp();
      const res = await app.request('http://localhost/github-webhook/int_1', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-github-event': 'issues',
          'x-github-delivery': 'delivery_1',
          'x-hub-signature-256': signature,
        },
        body: payload,
      });

      expect(res.status).toBe(500);
    });

    it('ignores unknown events', async () => {
      const payload = JSON.stringify({ data: 'test' });
      const signature = await computeSignature(payload, 'webhook_secret_123');

      const app = createApp();
      const res = await app.request('http://localhost/github-webhook/int_1', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-github-event': 'push',
          'x-github-delivery': 'delivery_1',
          'x-hub-signature-256': signature,
        },
        body: payload,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.message).toBe('Event ignored');
    });

    it('works without webhook secret configured', async () => {
      integrationResult = {
        ...baseIntegration,
        config: {
          ...baseIntegration.config,
          webhookSecret: undefined,
        } as GitHubIntegrationConfig,
      };

      const app = createApp();
      const res = await app.request('http://localhost/github-webhook/int_1', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-github-event': 'ping',
          'x-github-delivery': 'delivery_1',
        },
        body: JSON.stringify({ zen: 'test' }),
      });

      expect(res.status).toBe(200);
    });
  });
});
