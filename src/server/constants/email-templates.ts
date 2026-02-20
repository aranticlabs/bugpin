import type { EmailTemplates, EmailTemplateType } from '@shared/types';

// Placeholder for brand color - replaced at runtime with settings.branding.primaryColor
const BRAND_COLOR_PLACEHOLDER = '__BRAND_COLOR__';
const BRAND_COLOR_HOVER_PLACEHOLDER = '__BRAND_COLOR_HOVER__';

// Default brand color (BugPin CI) - used as fallback
export const DEFAULT_BRAND_COLOR = '#02658D';

const CURRENT_YEAR = new Date().getFullYear();

// Helper to darken a hex color for hover state
function darkenColor(hex: string, percent: number = 15): string {
  // Remove # if present
  const color = hex.replace('#', '');
  const num = parseInt(color, 16);
  const r = Math.max(0, (num >> 16) - Math.round(255 * (percent / 100)));
  const g = Math.max(0, ((num >> 8) & 0x00ff) - Math.round(255 * (percent / 100)));
  const b = Math.max(0, (num & 0x0000ff) - Math.round(255 * (percent / 100)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

// Apply brand color to HTML content
export function applyBrandColor(html: string, primaryColor: string): string {
  const hoverColor = darkenColor(primaryColor);
  return html
    .replace(/__BRAND_COLOR__/g, primaryColor)
    .replace(/__BRAND_COLOR_HOVER__/g, hoverColor);
}

// Variable documentation for each template type
export const templateVariables: Record<EmailTemplateType, string[]> = {
  newReport: [
    'app.name',
    'app.url',
    'project.name',
    'report.title',
    'report.description',
    'report.status',
    'report.statusFormatted',
    'report.priority',
    'report.priorityFormatted',
    'report.url',
    'report.pageUrl',
    'report.createdAt',
  ],
  statusChange: [
    'app.name',
    'app.url',
    'project.name',
    'report.title',
    'report.description',
    'report.url',
    'oldStatus',
    'oldStatusFormatted',
    'newStatus',
    'newStatusFormatted',
  ],
  priorityChange: [
    'app.name',
    'app.url',
    'project.name',
    'report.title',
    'report.description',
    'report.url',
    'oldPriority',
    'oldPriorityFormatted',
    'newPriority',
    'newPriorityFormatted',
  ],
  assignment: [
    'app.name',
    'app.url',
    'project.name',
    'report.title',
    'report.description',
    'report.url',
    'assignee.name',
    'assignee.email',
  ],
  invitation: ['app.name', 'inviter.name', 'invite.url', 'invite.expiresInDays'],
  reportDeleted: [
    'app.name',
    'app.url',
    'project.name',
    'report.title',
    'report.description',
    'report.status',
    'report.statusFormatted',
    'report.priority',
    'report.priorityFormatted',
  ],
  testEmail: ['app.name'],
};

// Shared email styles (exported for use in appending footer)
// Uses placeholders that are replaced at runtime with the actual brand color
export const emailStyles = `
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: ${BRAND_COLOR_PLACEHOLDER}; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; }
    .content a { color: ${BRAND_COLOR_PLACEHOLDER}; }
    .content a:hover { text-decoration: underline; }
    .footer { background: #f3f4f6; padding: 15px; text-align: center; font-size: 12px; color: #6b7280; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb; border-top: none; }
    .footer a { color: ${BRAND_COLOR_PLACEHOLDER}; text-decoration: none; }
    .footer a:hover { text-decoration: underline; }
    .button { display: inline-block; background: ${BRAND_COLOR_PLACEHOLDER}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 15px 0; font-weight: 500; }
    .button:hover { background: ${BRAND_COLOR_HOVER_PLACEHOLDER}; }
    .meta { background: white; padding: 15px; border-radius: 6px; margin: 15px 0; }
    .meta-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
    .meta-row:last-child { border-bottom: none; }
    .label { font-weight: 600; color: #6b7280; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: 600; }
    .badge-status { background: #dbeafe; color: #1e40af; }
    .badge-priority { background: #fee2e2; color: #991b1b; }
`;

// Hardcoded footer HTML - appended automatically to all emails, NOT editable
export const emailFooterHtml = `
    <div class="footer">
      <p style="margin: 0;">&copy; ${CURRENT_YEAR} <a href="https://bugpin.io">BugPin</a> | <a href="https://github.com/aranticlabs/bugpin">GitHub</a></p>
    </div>
`;

// Invitation has a special footer with the URL fallback
export const invitationFooterHtml = `
    <div class="footer">
      <p style="margin: 0;">If the button doesn't work, copy and paste this link into your browser:</p>
      <p style="margin: 5px 0 0 0; word-break: break-all;"><a href="{{invite.url}}" style="color: ${BRAND_COLOR_PLACEHOLDER};">{{invite.url}}</a></p>
      <p style="margin: 15px 0 0 0;">&copy; ${CURRENT_YEAR} <a href="https://bugpin.io">BugPin</a> | <a href="https://github.com/aranticlabs/bugpin">GitHub</a></p>
    </div>
`;

export const defaultEmailTemplates: EmailTemplates = {
  newReport: {
    subject: '[{{project.name}}] New Bug Report: {{report.title}}',
    html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>${emailStyles}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 24px;">New {{app.name}} Report</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9;">{{project.name}}</p>
    </div>
    <div class="content">
      <h2 style="margin-top: 0;">{{report.title}}</h2>
      <p>{{report.description}}</p>

      <div class="meta">
        <div class="meta-row">
          <span class="label">Status:</span>
          <span class="badge badge-status">{{report.statusFormatted}}</span>
        </div>
        <div class="meta-row">
          <span class="label">Priority:</span>
          <span class="badge badge-priority">{{report.priorityFormatted}}</span>
        </div>
        <div class="meta-row">
          <span class="label">URL:</span>
          <span style="color: ${BRAND_COLOR_PLACEHOLDER}; word-break: break-all;">{{report.pageUrl}}</span>
        </div>
        <div class="meta-row">
          <span class="label">Reported:</span>
          <span>{{report.createdAt}}</span>
        </div>
      </div>

      <a href="{{report.url}}" class="button" style="color: white;">View Report</a>
    </div>
  </div>
</body>
</html>`,
  },
  statusChange: {
    subject: '[{{project.name}}] Report Status Changed: {{report.title}}',
    html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    ${emailStyles}
    .status-change { background: white; padding: 15px; border-radius: 6px; margin: 15px 0; text-align: center; }
    .arrow { color: #6b7280; margin: 0 10px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 24px;">Report Status Updated</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9;">{{project.name}}</p>
    </div>
    <div class="content">
      <h2 style="margin-top: 0;">{{report.title}}</h2>
      <p style="color: #4b5563;">The status of this report in <strong>{{project.name}}</strong> has been updated.</p>

      <div class="status-change">
        <strong style="color: #6b7280;">{{oldStatusFormatted}}</strong>
        <span class="arrow">&rarr;</span>
        <strong style="color: ${BRAND_COLOR_PLACEHOLDER};">{{newStatusFormatted}}</strong>
      </div>

      <a href="{{report.url}}" class="button" style="color: white;">View Report</a>
    </div>
  </div>
</body>
</html>`,
  },
  priorityChange: {
    subject: '[{{project.name}}] Report Priority Changed: {{report.title}}',
    html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    ${emailStyles}
    .priority-change { background: white; padding: 15px; border-radius: 6px; margin: 15px 0; text-align: center; }
    .arrow { color: #6b7280; margin: 0 10px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 24px;">Report Priority Updated</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9;">{{project.name}}</p>
    </div>
    <div class="content">
      <h2 style="margin-top: 0;">{{report.title}}</h2>
      <p style="color: #4b5563;">The priority of this report in <strong>{{project.name}}</strong> has been changed.</p>

      <div class="priority-change">
        <strong style="color: #6b7280;">{{oldPriorityFormatted}}</strong>
        <span class="arrow">&rarr;</span>
        <strong style="color: ${BRAND_COLOR_PLACEHOLDER};">{{newPriorityFormatted}}</strong>
      </div>

      <a href="{{report.url}}" class="button" style="color: white;">View Report</a>
    </div>
  </div>
</body>
</html>`,
  },
  assignment: {
    subject: '[{{project.name}}] Report Assigned to You: {{report.title}}',
    html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>${emailStyles}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 24px;">Report Assigned to You</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9;">{{project.name}}</p>
    </div>
    <div class="content">
      <h2 style="margin-top: 0;">{{report.title}}</h2>
      <p style="color: #4b5563;">A report in <strong>{{project.name}}</strong> has been assigned to <strong>{{assignee.name}}</strong>. Please review the details below and take any necessary action.</p>
      <p>{{report.description}}</p>

      <a href="{{report.url}}" class="button" style="color: white;">View Report</a>
    </div>
  </div>
</body>
</html>`,
  },
  invitation: {
    subject: "You've been invited to {{app.name}}",
    html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>${emailStyles}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 24px;">You're Invited!</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9;">{{app.name}}</p>
    </div>
    <div class="content">
      <p style="font-size: 16px;">
        <strong>{{inviter.name}}</strong> has invited you to join {{app.name}} as a team member.
      </p>
      <p style="font-size: 16px;">
        Click the button below to accept the invitation and set up your account:
      </p>
      <div style="text-align: center;">
        <a href="{{invite.url}}" class="button" style="padding: 14px 28px; font-weight: 600; color: white;">Accept Invitation</a>
      </div>
      <p style="font-size: 14px; color: #6b7280;">
        This invitation will expire in {{invite.expiresInDays}} days.
      </p>
      <p style="font-size: 14px; color: #6b7280;">
        If you didn't expect this invitation, you can safely ignore this email.
      </p>
    </div>
  </div>
</body>
</html>`,
  },
  reportDeleted: {
    subject: '[{{project.name}}] Report Deleted: {{report.title}}',
    html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>${emailStyles}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 24px;">Report Deleted</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9;">{{project.name}}</p>
    </div>
    <div class="content">
      <h2 style="margin-top: 0;">{{report.title}}</h2>
      <p style="color: #4b5563;">A report in <strong>{{project.name}}</strong> has been permanently deleted. The report and all associated data are no longer available. Below is a summary of the report at the time of deletion.</p>

      <div class="meta">
        <div class="meta-row">
          <span class="label">Status:</span>
          <span class="badge badge-status">{{report.statusFormatted}}</span>
        </div>
        <div class="meta-row">
          <span class="label">Priority:</span>
          <span class="badge badge-priority">{{report.priorityFormatted}}</span>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`,
  },
  testEmail: {
    subject: 'Test Email from {{app.name}}',
    html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    ${emailStyles}
    .success-icon { font-size: 48px; text-align: center; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 24px;">Test Email</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9;">{{app.name}}</p>
    </div>
    <div class="content" style="border-radius: 0;">
      <div class="success-icon">&#x2709;&#xFE0F;</div>
      <h2 style="text-align: center; color: ${BRAND_COLOR_PLACEHOLDER};">SMTP Configuration Successful!</h2>
      <p style="text-align: center; color: #6b7280;">
        Your email server is configured correctly and able to send emails.
        You can now receive notifications for bug reports.
      </p>
      <p style="text-align: center; margin-top: 30px; font-size: 12px; color: #9ca3af;">
        This is a test email sent from {{app.name}} to verify your SMTP settings.
      </p>
    </div>
  </div>
</body>
</html>`,
  },
};

// Helper to append footer to email HTML
export function appendFooterToHtml(html: string, templateType: EmailTemplateType): string {
  const footer = templateType === 'invitation' ? invitationFooterHtml : emailFooterHtml;
  // Insert footer before closing </div></body></html>
  return html.replace(/(\s*<\/div>\s*<\/body>\s*<\/html>\s*)$/i, `${footer}$1`);
}

// Sample data for template previews
export function getSampleDataForTemplate(
  templateType: EmailTemplateType,
  appName: string = 'BugPin',
  appUrl: string = 'https://example.com',
): Record<string, unknown> {
  const baseData = {
    app: {
      name: appName,
      url: appUrl,
    },
  };

  switch (templateType) {
    case 'newReport':
    case 'statusChange':
    case 'priorityChange':
    case 'assignment':
    case 'reportDeleted':
      return {
        ...baseData,
        project: {
          name: 'Sample Project',
        },
        report: {
          title: 'Button not working on checkout page',
          description:
            'When clicking the "Complete Purchase" button, nothing happens. The page stays the same and no error is shown.',
          status: 'open',
          statusFormatted: 'Open',
          priority: 'high',
          priorityFormatted: 'High',
          url: `${appUrl}/admin/reports/sample-123`,
          pageUrl: 'https://example.com/checkout',
          createdAt: new Date().toLocaleString(),
        },
        ...(templateType === 'statusChange' && {
          oldStatus: 'open',
          oldStatusFormatted: 'Open',
          newStatus: 'in_progress',
          newStatusFormatted: 'In Progress',
        }),
        ...(templateType === 'priorityChange' && {
          oldPriority: 'medium',
          oldPriorityFormatted: 'Medium',
          newPriority: 'high',
          newPriorityFormatted: 'High',
        }),
        ...(templateType === 'assignment' && {
          assignee: {
            name: 'John Doe',
            email: 'john@example.com',
          },
        }),
      };

    case 'invitation':
      return {
        ...baseData,
        inviter: {
          name: 'Jane Smith',
        },
        invite: {
          url: `${appUrl}/admin/accept-invitation?token=sample-token-123`,
          expiresInDays: 7,
        },
      };

    case 'testEmail':
      return baseData;

    default:
      return baseData;
  }
}
