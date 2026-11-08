import { Hono } from 'hono';
import { notificationsService } from '../../services/notifications.service.js';
import { authMiddleware, authorize } from '../../middleware/auth.js';
import { validate, schemas } from '../../middleware/validate.js';
import type { User } from '@shared/types';

const notificationPreferences = new Hono();

// All routes require authentication
notificationPreferences.use('*', authMiddleware);

// User Notification Preferences

/**
 * Get all notification preferences for current user
 */
notificationPreferences.get('/me', async (c) => {
  const user = c.get('user') as User;

  const result = await notificationsService.getAllUserPreferences(user.id);

  if (!result.success) {
    return c.json({ success: false, error: result.code, message: result.error }, 400);
  }

  const defaults = await notificationsService.getGlobalDefaults();
  if (!defaults.success) {
    return c.json({ success: false, error: defaults.code, message: defaults.error }, 500);
  }

  return c.json({
    success: true,
    preferences: result.value,
    defaults: defaults.value,
  });
});

/**
 * Get user's notification preferences for a specific project
 */
notificationPreferences.get(
  '/me/projects/:projectId',
  validate({ params: schemas.projectId }),
  async (c) => {
    const user = c.get('user') as User;
    const projectId = c.req.param('projectId');

    const result = await notificationsService.getUserPreferences(user.id, projectId);

    if (!result.success) {
      const status = result.code === 'PROJECT_NOT_FOUND' ? 404 : 400;
      return c.json({ success: false, error: result.code, message: result.error }, status);
    }

    return c.json({
      success: true,
      preferences: result.value,
    });
  }
);

/**
 * Update notification preferences for all projects
 */
notificationPreferences.patch(
  '/me/all-projects',
  validate({ body: schemas.updateNotificationPreferences }),
  async (c) => {
    const user = c.get('user') as User;
    const body = await c.req.json();

    const result = await notificationsService.updateAllUserPreferences(user.id, body);

    if (!result.success) {
      return c.json({ success: false, error: result.code, message: result.error }, 400);
    }

    return c.json({
      success: true,
      preferences: result.value,
    });
  }
);

/**
 * Update user's notification preferences for a project
 */
notificationPreferences.patch(
  '/me/projects/:projectId',
  validate({ params: schemas.projectId, body: schemas.updateNotificationPreferences }),
  async (c) => {
    const user = c.get('user') as User;
    const projectId = c.req.param('projectId');
    const body = await c.req.json();

    const result = await notificationsService.updateUserPreferences(user.id, projectId, body);

    if (!result.success) {
      const status = result.code === 'PROJECT_NOT_FOUND' ? 404 : 400;
      return c.json({ success: false, error: result.code, message: result.error }, status);
    }

    return c.json({
      success: true,
      preferences: result.value,
    });
  }
);

// Project Notification Defaults (Admin Only)

/**
 * Get project notification defaults
 */
notificationPreferences.get(
  '/projects/:projectId/defaults',
  authorize(['admin']),
  validate({ params: schemas.projectId }),
  async (c) => {
    const projectId = c.req.param('projectId');

    const result = await notificationsService.getProjectDefaults(projectId);

    if (!result.success) {
      const status = result.code === 'PROJECT_NOT_FOUND' ? 404 : 400;
      return c.json({ success: false, error: result.code, message: result.error }, status);
    }

    // Returns null if project uses global defaults, or the custom defaults object
    return c.json({
      success: true,
      defaults: result.value,
    });
  }
);

/**
 * Update project notification defaults
 */
notificationPreferences.patch(
  '/projects/:projectId/defaults',
  authorize(['admin']),
  validate({ params: schemas.projectId, body: schemas.updateProjectNotificationDefaults }),
  async (c) => {
    const projectId = c.req.param('projectId');
    const body = await c.req.json();

    const result = await notificationsService.updateProjectDefaults(projectId, body);

    if (!result.success) {
      const status = result.code === 'PROJECT_NOT_FOUND' ? 404 : 400;
      return c.json({ success: false, error: result.code, message: result.error }, status);
    }

    return c.json({
      success: true,
      defaults: result.value,
    });
  }
);

/**
 * Delete project notification defaults (reset to global defaults)
 */
notificationPreferences.delete(
  '/projects/:projectId/defaults',
  authorize(['admin']),
  validate({ params: schemas.projectId }),
  async (c) => {
    const projectId = c.req.param('projectId');

    const result = await notificationsService.deleteProjectDefaults(projectId);

    if (!result.success) {
      const status = result.code === 'PROJECT_NOT_FOUND' ? 404 : 400;
      return c.json({ success: false, error: result.code, message: result.error }, status);
    }

    return c.json({
      success: true,
      message: 'Project notification defaults reset to global settings',
    });
  }
);

export { notificationPreferences };
