import type { WhiteLabelConfig } from '../types/ee-plugin.js';
import { templateService } from '../services/template.service.js';
import type { EmailTemplateType } from '@shared/types';
import { defaultEmailTemplates as defaultsByLocale } from '../i18n/email-defaults/index.js';

export { defaultsByLocale as defaultEmailTemplates };

const BRAND_COLOR_PLACEHOLDER = '__BRAND_COLOR__';

export const DEFAULT_BRAND_COLOR = '#02658D';

function darkenColor(hex: string, percent: number = 15): string {
  const color = hex.replace('#', '');
  const num = parseInt(color, 16);
  const r = Math.max(0, (num >> 16) - Math.round(255 * (percent / 100)));
  const g = Math.max(0, ((num >> 8) & 0x00ff) - Math.round(255 * (percent / 100)));
  const b = Math.max(0, (num & 0x0000ff) - Math.round(255 * (percent / 100)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export function applyBrandColor(html: string, primaryColor: string): string {
  const hoverColor = darkenColor(primaryColor);
  return html
    .replace(/__BRAND_COLOR__/g, primaryColor)
    .replace(/__BRAND_COLOR_HOVER__/g, hoverColor);
}

function getEmailFooterHtml(): string {
  return `
    <div class="footer">
      <p style="margin: 0;">&copy; ${new Date().getFullYear()} <a href="https://bugpin.io">BugPin</a> | <a href="https://github.com/aranticlabs/bugpin">GitHub</a></p>
    </div>
`;
}

function getInvitationFooterHtml(): string {
  return `
    <div class="footer">
      <p style="margin: 0;">If the button doesn't work, copy and paste this link into your browser:</p>
      <p style="margin: 5px 0 0 0; word-break: break-all;"><a href="{{invite.url}}" style="color: ${BRAND_COLOR_PLACEHOLDER};">{{invite.url}}</a></p>
      <p style="margin: 15px 0 0 0;">&copy; ${new Date().getFullYear()} <a href="https://bugpin.io">BugPin</a> | <a href="https://github.com/aranticlabs/bugpin">GitHub</a></p>
    </div>
`;
}

export function appendFooterToHtml(
  html: string,
  templateType: EmailTemplateType,
  whiteLabel?: WhiteLabelConfig
): string {
  let footer = templateType === 'invitation' ? getInvitationFooterHtml() : getEmailFooterHtml();
  if (whiteLabel?.enabled) {
    const copyright = whiteLabel.customCopyright
      ? templateService.compileTemplate('{{copyright}}', { copyright: whiteLabel.customCopyright })
      : '';
    if (whiteLabel.hideEmailBranding)
      footer =
        templateType === 'invitation'
          ? `<div class="footer"><a href="{{invite.url}}">{{invite.url}}</a>${copyright ? `<p style="margin: 15px 0 0 0;">${copyright}</p>` : ''}</div>`
          : copyright
            ? `<div class="footer">${copyright}</div>`
            : '';
    else if (copyright) footer = footer.replace(/&copy;.*?<\/p>/, () => `${copyright}</p>`);
  }
  return html.replace(
    /(\s*<\/div>\s*<\/body>\s*<\/html>\s*)$/i,
    (closingTags) => `${footer}${closingTags}`
  );
}

export function getSampleDataForTemplate(
  templateType: EmailTemplateType,
  appName: string = 'BugPin',
  appUrl: string = 'https://example.com'
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

    case 'passwordReset':
      return {
        ...baseData,
        user: {
          name: 'Jane Smith',
        },
        reset: {
          url: `${appUrl}/admin/reset-password?token=sample-token-123`,
          expiresInHours: 24,
        },
      };

    case 'reporterConfirmation':
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
          createdAt: new Date().toLocaleString(),
        },
      };

    case 'reporterStatusChange':
      return {
        ...baseData,
        project: {
          name: 'Sample Project',
        },
        report: {
          title: 'Button not working on checkout page',
          description:
            'When clicking the "Complete Purchase" button, nothing happens. The page stays the same and no error is shown.',
          status: 'in_progress',
          statusFormatted: 'In Progress',
        },
        oldStatus: 'open',
        oldStatusFormatted: 'Open',
        newStatus: 'in_progress',
        newStatusFormatted: 'In Progress',
        reporterMessage:
          'We have identified the issue and are working on a fix. Expect a resolution within the next 24 hours.',
        reporterMessageDisplay: 'block',
      };

    case 'reporterPriorityChange':
      return {
        ...baseData,
        project: {
          name: 'Sample Project',
        },
        report: {
          title: 'Button not working on checkout page',
          description:
            'When clicking the "Complete Purchase" button, nothing happens. The page stays the same and no error is shown.',
          priority: 'high',
          priorityFormatted: 'High',
        },
        oldPriority: 'medium',
        oldPriorityFormatted: 'Medium',
        newPriority: 'high',
        newPriorityFormatted: 'High',
      };

    case 'reporterAssignment':
      return {
        ...baseData,
        project: {
          name: 'Sample Project',
        },
        report: {
          title: 'Button not working on checkout page',
          description:
            'When clicking the "Complete Purchase" button, nothing happens. The page stays the same and no error is shown.',
          status: 'in_progress',
          statusFormatted: 'In Progress',
          url: `${appUrl}/admin/reports/sample-123`,
        },
        assignee: {
          name: 'John Doe',
        },
        previousAssigneeName: 'Jane Smith',
        previousAssigneeDisplay: 'block',
        noPreviousAssigneeDisplay: 'none',
      };

    case 'reporterMessage':
      return {
        ...baseData,
        project: {
          name: 'Sample Project',
        },
        report: {
          title: 'Button not working on checkout page',
          status: 'in_progress',
          statusFormatted: 'In Progress',
        },
        sender: {
          name: 'John Doe',
        },
        message:
          'Thank you for reporting this issue. Could you please provide more details about which browser you were using?',
      };

    case 'testEmail':
      return baseData;

    default:
      return baseData;
  }
}
