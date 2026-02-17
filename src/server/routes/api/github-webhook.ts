import { Hono } from 'hono';
import { githubSyncService } from '../../services/integrations/github-sync.service.js';
import { integrationsRepo } from '../../database/repositories/integrations.repo.js';
import { logger } from '../../utils/logger.js';
import type { GitHubIntegrationConfig } from '@shared/types';

const githubWebhook = new Hono();

// Verify GitHub webhook signature using Bun's crypto
async function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  if (!signature.startsWith('sha256=')) {
    return false;
  }

  const receivedHash = signature.slice(7);

  try {
    // Use Bun's CryptoHasher for HMAC-SHA256
    const hmac = new Bun.CryptoHasher('sha256', secret);
    hmac.update(payload);
    const expectedHash = hmac.digest('hex');

    // Constant-time comparison
    if (receivedHash.length !== expectedHash.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < receivedHash.length; i++) {
      result |= receivedHash.charCodeAt(i) ^ expectedHash.charCodeAt(i);
    }

    return result === 0;
  } catch {
    return false;
  }
}

// GitHub Webhook Handler
githubWebhook.post('/:integrationId', async (c) => {
  const integrationId = c.req.param('integrationId');

  // Get raw body for signature verification
  const rawBody = await c.req.text();

  // Get GitHub headers
  const signature = c.req.header('X-Hub-Signature-256') || '';
  const event = c.req.header('X-GitHub-Event') || '';
  const deliveryId = c.req.header('X-GitHub-Delivery') || '';

  logger.debug('Received GitHub webhook', {
    integrationId,
    event,
    deliveryId,
    hasSignature: !!signature,
  });

  // Get integration
  const integration = await integrationsRepo.findById(integrationId);
  if (!integration) {
    logger.warn('GitHub webhook for unknown integration', { integrationId });
    return c.json({ error: 'Integration not found' }, 404);
  }

  if (integration.type !== 'github') {
    logger.warn('GitHub webhook for non-GitHub integration', { integrationId });
    return c.json({ error: 'Invalid integration type' }, 400);
  }

  const config = integration.config as GitHubIntegrationConfig;

  // Verify signature if webhook secret is configured
  if (config.webhookSecret) {
    if (!signature) {
      logger.warn('GitHub webhook missing signature', { integrationId });
      return c.json({ error: 'Missing signature' }, 401);
    }

    const isValid = await verifyWebhookSignature(rawBody, signature, config.webhookSecret);
    if (!isValid) {
      logger.warn('GitHub webhook signature mismatch', { integrationId });
      return c.json({ error: 'Invalid signature' }, 401);
    }
  }

  // Parse payload
  let payload: {
    action?: string;
    issue?: {
      number: number;
      state: 'open' | 'closed';
      title: string;
    };
  };

  try {
    payload = JSON.parse(rawBody);
  } catch {
    logger.warn('GitHub webhook invalid JSON', { integrationId });
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  // Handle ping event (sent when webhook is created)
  if (event === 'ping') {
    logger.info('GitHub webhook ping received', { integrationId });
    return c.json({ message: 'pong' });
  }

  // Handle issues event
  if (event === 'issues' && payload.issue) {
    const action = payload.action || '';
    const supportedActions = ['opened', 'closed', 'reopened'];

    if (!supportedActions.includes(action)) {
      // Ignore unsupported actions (edited, labeled, etc.)
      return c.json({ message: 'Action ignored' });
    }

    const result = await githubSyncService.handleWebhook(integrationId, action, {
      number: payload.issue.number,
      state: payload.issue.state,
    });

    if (!result.success) {
      logger.error('Failed to handle GitHub webhook', {
        integrationId,
        error: result.error,
      });
      return c.json({ error: result.error }, 500);
    }

    logger.info('GitHub webhook processed', {
      integrationId,
      event,
      action,
      issueNumber: payload.issue.number,
    });

    return c.json({ message: 'Webhook processed' });
  }

  // Unknown or unhandled event
  return c.json({ message: 'Event ignored' });
});

export { githubWebhook as githubWebhookRoutes };
