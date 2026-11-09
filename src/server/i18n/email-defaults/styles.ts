export const BRAND_COLOR_PLACEHOLDER = '__BRAND_COLOR__';
export const BRAND_COLOR_HOVER_PLACEHOLDER = '__BRAND_COLOR_HOVER__';

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

export interface ReporterConfirmationCopy {
  headerTitle: string;
  intro: string;
  labelStatus: string;
  labelPriority: string;
  labelSubmitted: string;
  outro: string;
}

export interface ReporterStatusChangeCopy {
  headerTitle: string;
  intro: string;
  teamMessageLabel: string;
  outro: string;
}

export interface ReporterPriorityChangeCopy {
  headerTitle: string;
  intro: string;
  outro: string;
}

export interface ReporterMessageCopy {
  headerTitle: string;
  intro: string;
}

export interface ReporterAssignmentCopy {
  headerTitle: string;
  introWithPrevious: string;
  introWithoutPrevious: string;
  labelProject: string;
  labelReport: string;
  labelStatus: string;
  ctaViewReport: string;
  outro: string;
}

export function reporterConfirmationHtml(copy: ReporterConfirmationCopy): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>${emailStyles}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 24px;">${copy.headerTitle}</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9;">{{app.name}}</p>
    </div>
    <div class="content">
      <p style="font-size: 16px;">${copy.intro}</p>
      <h2 style="margin-top: 15px;">{{report.title}}</h2>
      <p>{{report.description}}</p>

      <div class="meta">
        <div class="meta-row">
          <span class="label">${copy.labelStatus}</span>
          <span class="badge badge-status">{{report.statusFormatted}}</span>
        </div>
        <div class="meta-row">
          <span class="label">${copy.labelPriority}</span>
          <span class="badge badge-priority">{{report.priorityFormatted}}</span>
        </div>
        <div class="meta-row">
          <span class="label">${copy.labelSubmitted}</span>
          <span>{{report.createdAt}}</span>
        </div>
      </div>

      <p style="font-size: 14px; color: #6b7280; margin-top: 20px;">${copy.outro}</p>

      <p style="display: {{reporter.portalDisplay}}; text-align: center;">
        <a class="button" href="{{reporter.loginUrl}}">{{reporter.actionLabel}}</a>
      </p>
      <p style="display: {{reporter.unsubscribeDisplay}}; font-size: 12px;">
        <a href="{{reporter.unsubscribeUrl}}">{{reporter.unsubscribeLabel}}</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}

export function reporterStatusChangeHtml(copy: ReporterStatusChangeCopy): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    ${emailStyles}
    .status-change { background: white; padding: 15px; border-radius: 6px; margin: 15px 0; text-align: center; }
    .arrow { color: #6b7280; margin: 0 10px; }
    .team-message { background: white; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid ${BRAND_COLOR_PLACEHOLDER}; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 24px;">${copy.headerTitle}</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9;">{{app.name}}</p>
    </div>
    <div class="content">
      <h2 style="margin-top: 0;">{{report.title}}</h2>
      <p style="color: #4b5563;">${copy.intro}</p>

      <div class="status-change">
        <strong style="color: #6b7280;">{{oldStatusFormatted}}</strong>
        <span class="arrow">&rarr;</span>
        <strong style="color: ${BRAND_COLOR_PLACEHOLDER};">{{newStatusFormatted}}</strong>
      </div>

      <div class="team-message" style="display: {{reporterMessageDisplay}};">
        <p style="margin: 0 0 5px 0; font-weight: 600; color: #374151;">${copy.teamMessageLabel}</p>
        <p style="margin: 0; color: #4b5563; ">{{reporterMessage}}</p>
      </div>

      <p style="font-size: 14px; color: #6b7280; margin-top: 20px;">${copy.outro}</p>

      <p style="display: {{reporter.portalDisplay}}; text-align: center;">
        <a class="button" href="{{reporter.updateUrl}}">{{reporter.actionLabel}}</a>
      </p>
      <p style="display: {{reporter.unsubscribeDisplay}}; font-size: 12px;">
        <a href="{{reporter.unsubscribeUrl}}">{{reporter.unsubscribeLabel}}</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}

export function reporterPriorityChangeHtml(copy: ReporterPriorityChangeCopy): string {
  return `<!DOCTYPE html>
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
      <h1 style="margin: 0; font-size: 24px;">${copy.headerTitle}</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9;">{{app.name}}</p>
    </div>
    <div class="content">
      <h2 style="margin-top: 0;">{{report.title}}</h2>
      <p style="color: #4b5563;">${copy.intro}</p>

      <div class="priority-change">
        <strong style="color: #6b7280;">{{oldPriorityFormatted}}</strong>
        <span class="arrow">&rarr;</span>
        <strong style="color: ${BRAND_COLOR_PLACEHOLDER};">{{newPriorityFormatted}}</strong>
      </div>

      <p style="font-size: 14px; color: #6b7280; margin-top: 20px;">${copy.outro}</p>

      <p style="display: {{reporter.portalDisplay}}; text-align: center;">
        <a class="button" href="{{reporter.updateUrl}}">{{reporter.actionLabel}}</a>
      </p>
      <p style="display: {{reporter.unsubscribeDisplay}}; font-size: 12px;">
        <a href="{{reporter.unsubscribeUrl}}">{{reporter.unsubscribeLabel}}</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}

export function reporterAssignmentHtml(copy: ReporterAssignmentCopy): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>${emailStyles}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 24px;">${copy.headerTitle}</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9;">{{app.name}}</p>
    </div>
    <div class="content">
      <h2 style="margin-top: 0;">{{report.title}}</h2>
      <p style="display: {{previousAssigneeDisplay}}; color: #4b5563;">${copy.introWithPrevious}</p>
      <p style="display: {{noPreviousAssigneeDisplay}}; color: #4b5563;">${copy.introWithoutPrevious}</p>

      <div class="meta">
        <div class="meta-row">
          <span class="label">${copy.labelProject}</span>
          <span>{{project.name}}</span>
        </div>
        <div class="meta-row">
          <span class="label">${copy.labelReport}</span>
          <span>{{report.title}}</span>
        </div>
        <div class="meta-row">
          <span class="label">${copy.labelStatus}</span>
          <span class="badge badge-status">{{report.statusFormatted}}</span>
        </div>
      </div>

      <p style="font-size: 14px; color: #6b7280; margin-top: 20px;">${copy.outro}</p>

      <p style="display: {{reporter.portalDisplay}}; text-align: center;">
        <a class="button" href="{{reporter.updateUrl}}">{{reporter.actionLabel}}</a>
      </p>
      <p style="display: {{reporter.unsubscribeDisplay}}; font-size: 12px;">
        <a href="{{reporter.unsubscribeUrl}}">{{reporter.unsubscribeLabel}}</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}

export function reporterMessageHtml(copy: ReporterMessageCopy): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    ${emailStyles}
    .team-message { background: white; padding: 15px; border-radius: 6px; margin: 15px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 24px;">${copy.headerTitle}</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9;">{{app.name}}</p>
    </div>
    <div class="content">
      <h2 style="margin-top: 0;">{{report.title}}</h2>
      <p style="color: #4b5563;">${copy.intro}</p>

      <div class="team-message">
        <p style="margin: 0; color: #4b5563; ">{{message}}</p>
      </div>


      <p style="display: {{reporter.portalDisplay}}; text-align: center;">
        <a class="button" href="{{reporter.updateUrl}}">{{reporter.actionLabel}}</a>
      </p>
      <p style="display: {{reporter.unsubscribeDisplay}}; font-size: 12px;">
        <a href="{{reporter.unsubscribeUrl}}">{{reporter.unsubscribeLabel}}</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}

export function reporterLoginHtml(copy: {
  login: string;
  loginIntro: string;
  loginExpiry: string;
}): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${emailStyles}</style></head>
<body><div class="container"><div class="header"><h1>${copy.login}</h1><p>{{app.name}}</p></div>
<div class="content"><p>${copy.loginIntro}</p><a class="button" href="{{reporter.loginUrl}}">${copy.login}</a><p>${copy.loginExpiry}</p></div>
</div></body></html>`;
}
