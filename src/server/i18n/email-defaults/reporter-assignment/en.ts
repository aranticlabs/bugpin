import type { EmailTemplate } from '@shared/types';
import { reporterAssignmentHtml } from '../styles.js';

const en: EmailTemplate = {
  subject: 'Assignment update on your bug report: {{report.title}}',
  html: reporterAssignmentHtml({
    headerTitle: 'Assignment Updated',
    introWithPrevious:
      'Your report has been reassigned from <strong>{{previousAssigneeName}}</strong> to <strong>{{assignee.name}}</strong>.',
    introWithoutPrevious: 'Your report has been assigned to <strong>{{assignee.name}}</strong>.',
    labelProject: 'Project:',
    labelReport: 'Report:',
    labelStatus: 'Status:',
    ctaViewReport: 'View report',
    outro: 'Thank you for your report. We will continue to keep you updated on any changes.',
  }),
};

export default en;
