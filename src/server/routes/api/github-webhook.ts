import { Hono } from 'hono';
import { githubSyncService } from '../../services/integrations/github-sync.service.js';
import { errorStatus } from '../../utils/http-status.js';
import { logger } from '../../utils/logger.js';

const githubWebhook = new Hono();

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

  const verified = await githubSyncService.verifyWebhook(integrationId, rawBody, signature);
  if (!verified.success) return c.json({ error: verified.error }, errorStatus(verified.code));

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
