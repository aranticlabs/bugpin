import { Hono } from 'hono';
import { usersService } from '../../services/users.service.js';
import { invitationsService } from '../../services/invitations.service.js';
import { authMiddleware, authorize } from '../../middleware/auth.js';
import { validate, schemas } from '../../middleware/validate.js';
import { saveAvatar, deleteAllAvatars } from '../../storage/files.js';
import { config } from '../../config.js';
import { settingsCacheService } from '../../services/settings-cache.service.js';
import type { User } from '@shared/types';
import * as path from 'path';

const users = new Hono();

// All user routes require authentication
users.use('*', authMiddleware);

// List Users (Admin only)

users.get('/', authorize(['admin']), async (c) => {
  const result = await usersService.list();

  if (!result.success) {
    return c.json({ success: false, error: result.code, message: result.error }, 400);
  }

  return c.json({
    success: true,
    users: result.value,
  });
});

// Get User by ID (Admin only)

users.get('/:id', authorize(['admin']), validate({ params: schemas.id }), async (c) => {
  const id = c.req.param('id');

  const result = await usersService.getById(id);

  if (!result.success) {
    const status = result.code === 'NOT_FOUND' ? 404 : 400;
    return c.json({ success: false, error: result.code, message: result.error }, status);
  }

  return c.json({
    success: true,
    user: result.value,
  });
});

// Create User (Admin only)

users.post('/', authorize(['admin']), validate({ body: schemas.createUser }), async (c) => {
  const body = await c.req.json();

  const result = await usersService.create(body);

  if (!result.success) {
    const status = result.code === 'EMAIL_EXISTS' ? 409 : 400;
    return c.json({ success: false, error: result.code, message: result.error }, status);
  }

  return c.json(
    {
      success: true,
      user: result.value,
    },
    201,
  );
});

// Invite User (Admin only)

users.post('/invite', authorize(['admin']), validate({ body: schemas.inviteUser }), async (c) => {
  const body = await c.req.json();
  const currentUser = c.get('user') as User;

  const result = await invitationsService.inviteUser(body, currentUser.name);

  if (!result.success) {
    const status = result.code === 'EMAIL_EXISTS' ? 409 : 400;
    return c.json({ success: false, error: result.code, message: result.error }, status);
  }

  // Check if App URL is configured - invitation links won't work without it
  const settings = await settingsCacheService.getAll();
  const warning = !settings.appUrl
    ? 'Application URL is not configured. Invitation links will not work. Please set the Application URL in the settings.'
    : undefined;

  return c.json(
    {
      success: true,
      user: result.value,
      message: 'Invitation sent successfully',
      warning,
    },
    201,
  );
});

// Resend Invitation (Admin only)

users.post(
  '/:id/resend-invitation',
  authorize(['admin']),
  validate({ params: schemas.id }),
  async (c) => {
    const id = c.req.param('id');
    const currentUser = c.get('user') as User;

    const result = await invitationsService.resendInvitation(id, currentUser.name);

    if (!result.success) {
      const status = result.code === 'NOT_FOUND' ? 404 : 400;
      return c.json({ success: false, error: result.code, message: result.error }, status);
    }

    const settings = await settingsCacheService.getAll();
    const warning = !settings.appUrl
      ? 'App URL is not configured. Invitation links will not work. Please set the App URL in Settings.'
      : undefined;

    return c.json({
      success: true,
      user: result.value,
      message: 'Invitation resent successfully',
      warning,
    });
  },
);

// Update User (Admin only)

users.patch(
  '/:id',
  authorize(['admin']),
  validate({ params: schemas.id, body: schemas.updateUser }),
  async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json();

    const result = await usersService.update(id, body);

    if (!result.success) {
      const status = result.code === 'NOT_FOUND' ? 404 : 400;
      return c.json({ success: false, error: result.code, message: result.error }, status);
    }

    return c.json({
      success: true,
      user: result.value,
    });
  },
);

// Delete User (Admin only)

users.delete('/:id', authorize(['admin']), validate({ params: schemas.id }), async (c) => {
  const id = c.req.param('id');
  const currentUser = c.get('user');

  // Prevent self-deletion
  if (id === currentUser.id) {
    return c.json(
      { success: false, error: 'INVALID_OPERATION', message: 'Cannot delete your own account' },
      400,
    );
  }

  const result = await usersService.delete(id);

  if (!result.success) {
    const status = result.code === 'NOT_FOUND' ? 404 : 400;
    return c.json({ success: false, error: result.code, message: result.error }, status);
  }

  return c.json({
    success: true,
    message: 'User deleted successfully',
  });
});

// Upload Avatar (for current user)

users.post('/me/avatar', authMiddleware, async (c) => {
  const currentUser = c.get('user') as User;
  const body = await c.req.parseBody();
  const file = body['file'];

  if (!file || !(file instanceof File)) {
    return c.json({ success: false, error: 'INVALID_INPUT', message: 'No file provided' }, 400);
  }

  // Validate file type
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
  if (!allowedTypes.includes(file.type)) {
    return c.json(
      {
        success: false,
        error: 'INVALID_FILE_TYPE',
        message: 'Only JPEG, PNG, WebP, and GIF images are allowed',
      },
      400,
    );
  }

  // Validate file size (max 5MB)
  const maxSize = 5 * 1024 * 1024;
  if (file.size > maxSize) {
    return c.json(
      { success: false, error: 'FILE_TOO_LARGE', message: 'File size must be less than 5MB' },
      400,
    );
  }

  try {
    // Delete old avatars
    deleteAllAvatars(currentUser.id);

    // Save new avatar
    const buffer = await file.arrayBuffer();
    const savedFile = await saveAvatar({
      userId: currentUser.id,
      filename: file.name,
      mimeType: file.type,
      data: new Uint8Array(buffer),
    });

    // Build URL path
    const avatarUrl = `/api/users/me/avatar/${savedFile.filename}`;

    // Update user record
    const result = await usersService.updateAvatar(currentUser.id, avatarUrl);

    if (!result.success) {
      return c.json({ success: false, error: result.code, message: result.error }, 400);
    }

    return c.json({
      success: true,
      user: result.value,
      avatarUrl,
    });
  } catch (error) {
    return c.json(
      { success: false, error: 'UPLOAD_FAILED', message: 'Failed to upload avatar' },
      500,
    );
  }
});

// Get Avatar (for current user)

users.get('/me/avatar/:filename', authMiddleware, async (c) => {
  const currentUser = c.get('user') as User;
  const filename = c.req.param('filename');

  const filePath = path.join(config.avatarsDir, currentUser.id, filename);

  try {
    const file = Bun.file(filePath);
    const exists = await file.exists();

    if (!exists) {
      return c.json({ success: false, error: 'NOT_FOUND', message: 'Avatar not found' }, 404);
    }

    return new Response(file);
  } catch (error) {
    return c.json({ success: false, error: 'READ_FAILED', message: 'Failed to read avatar' }, 500);
  }
});

// Delete Avatar (for current user)

users.delete('/me/avatar', authMiddleware, async (c) => {
  const currentUser = c.get('user') as User;

  // Delete all avatars
  deleteAllAvatars(currentUser.id);

  // Update user record
  const result = await usersService.deleteAvatar(currentUser.id);

  if (!result.success) {
    return c.json({ success: false, error: result.code, message: result.error }, 400);
  }

  return c.json({
    success: true,
    user: result.value,
    message: 'Avatar deleted successfully',
  });
});

// Update Profile (for current user)

users.patch('/me/profile', authMiddleware, validate({ body: schemas.updateProfile }), async (c) => {
  const currentUser = c.get('user') as User;
  const body = await c.req.json();

  const result = await usersService.updateProfile(currentUser.id, body);

  if (!result.success) {
    const status = result.code === 'EMAIL_EXISTS' ? 409 : 400;
    return c.json({ success: false, error: result.code, message: result.error }, status);
  }

  return c.json({
    success: true,
    user: result.value,
    message: 'Profile updated successfully',
  });
});

export { users as usersRoutes };
