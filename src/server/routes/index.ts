import { Hono } from 'hono';
import { authRoutes } from './api/auth.js';
import { reportsRoutes } from './api/reports.js';
import { projectsRoutes } from './api/projects.js';
import { usersRoutes } from './api/users.js';
import { webhooksRoutes } from './api/webhooks.js';
import { settingsRoutes } from './api/settings.js';
import { integrationsRoutes } from './api/integrations.js';
import { notificationPreferences } from './api/notification-preferences.js';
import { storageRoutes } from './api/storage.js';
import brandingRoutes from './api/branding.js';
import licenseRoutes from './api/license.js';
import { apiTokensRoutes } from './api/api-tokens.js';
import { customTemplatesRoutes } from './api/custom-templates.js';
import { whiteLabelRoutes } from './api/white-label.js';
import { widgetRoutes } from './widget/submit.js';
import { githubWebhookRoutes } from './api/github-webhook.js';
import { publicFilesRoutes } from './api/public-files.js';
import { invitationsRoutes } from './api/invitations.js';
import { getEERoutes } from '../utils/ee.js';
import { logger } from '../utils/logger.js';

export function createApiRouter(): Hono {
  const api = new Hono();

  // Mount core CE API routes
  api.route('/auth', authRoutes);
  api.route('/reports', reportsRoutes);
  api.route('/projects', projectsRoutes);
  api.route('/users', usersRoutes);
  api.route('/settings', settingsRoutes);
  api.route('/integrations', integrationsRoutes);
  api.route('/notification-preferences', notificationPreferences);
  api.route('/license', licenseRoutes);

  // Mount EE routes first if available (they take priority over CE routes)
  // EE routes handle the actual feature implementation when licensed
  const eeRoutes = getEERoutes();
  const eeRoutePaths = new Set<string>();
  for (const [path, routes] of eeRoutes) {
    logger.debug('Mounting EE routes', { path });
    api.route(path, routes);
    eeRoutePaths.add(path);
  }

  // Mount CE routes for EE features (return 402 when EE is not available)
  // Skip mounting if EE routes are already handling that path
  if (!eeRoutePaths.has('/tokens')) {
    api.route('/tokens', apiTokensRoutes);
  }
  if (!eeRoutePaths.has('/webhooks')) {
    api.route('/webhooks', webhooksRoutes);
  }
  if (!eeRoutePaths.has('/storage')) {
    api.route('/storage', storageRoutes);
  }
  // Branding routes are split - CE has widget colors, EE has admin branding
  // Always mount the CE branding routes since they have different endpoints
  api.route('/branding', brandingRoutes);

  // Custom templates (EE feature - CE stub returns 402)
  if (!eeRoutePaths.has('/templates')) {
    api.route('/templates', customTemplatesRoutes);
  }

  // White-label (EE feature - CE stub returns 402)
  if (!eeRoutePaths.has('/white-label')) {
    api.route('/white-label', whiteLabelRoutes);
  }

  // Mount widget routes (public)
  api.route('/widget', widgetRoutes);

  // Mount GitHub webhook routes (public, no auth)
  api.route('/webhooks/github', githubWebhookRoutes);

  // Mount public files routes (public, no auth)
  api.route('/public/files', publicFilesRoutes);

  // Mount invitations routes (public, no auth)
  api.route('/invitations', invitationsRoutes);

  return api;
}
