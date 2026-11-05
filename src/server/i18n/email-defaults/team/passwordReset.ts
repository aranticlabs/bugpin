import type { TeamTemplateDefaults } from '@shared/types';
import { emailStyles } from '../styles.js';

export const passwordReset: TeamTemplateDefaults = {
  en: {
    subject: 'Reset your {{app.name}} password',
    html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>${emailStyles}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 24px;">Reset Your Password</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9;">{{app.name}}</p>
    </div>
    <div class="content">
      <p style="font-size: 16px;">Hi {{user.name}},</p>
      <p style="font-size: 16px;">
        An administrator asked {{app.name}} to send you a link to choose a new password.
      </p>
      <div style="text-align: center;">
        <a href="{{reset.url}}" class="button" style="padding: 14px 28px; font-weight: 600; color: white;">Choose a New Password</a>
      </div>
      <p style="font-size: 14px; color: #6b7280;">
        This link expires in {{reset.expiresInHours}} hours and can be used once.
      </p>
      <p style="font-size: 14px; color: #6b7280;">
        If you didn't expect this email, you can ignore it. Your current password keeps working until you choose a new one.
      </p>
    </div>
  </div>
</body>
</html>`,
  },
};
