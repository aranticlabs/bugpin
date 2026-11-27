import type { EmailTemplate } from '@shared/types';
import { reporterAssignmentHtml } from '../styles.js';

const nl: EmailTemplate = {
  subject: 'Toewijzing van uw bugrapport bijgewerkt: {{report.title}}',
  html: reporterAssignmentHtml({
    headerTitle: 'Toewijzing bijgewerkt',
    introWithPrevious:
      'Uw rapport is opnieuw toegewezen van <strong>{{previousAssigneeName}}</strong> aan <strong>{{assignee.name}}</strong>.',
    introWithoutPrevious: 'Uw rapport is toegewezen aan <strong>{{assignee.name}}</strong>.',
    labelProject: 'Project:',
    labelReport: 'Rapport:',
    labelStatus: 'Status:',
    ctaViewReport: 'Rapport bekijken',
    outro: 'Bedankt voor uw rapport. We houden u op de hoogte van eventuele wijzigingen.',
  }),
};

export default nl;
