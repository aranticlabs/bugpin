import type { EmailTemplate } from '@shared/types';
import { reporterAssignmentHtml } from '../styles.js';

const it: EmailTemplate = {
  subject: 'Aggiornamento di assegnazione sulla tua segnalazione di bug: {{report.title}}',
  html: reporterAssignmentHtml({
    headerTitle: 'Assegnazione aggiornata',
    introWithPrevious:
      'La tua segnalazione è stata riassegnata da <strong>{{previousAssigneeName}}</strong> a <strong>{{assignee.name}}</strong>.',
    introWithoutPrevious:
      'La tua segnalazione è stata assegnata a <strong>{{assignee.name}}</strong>.',
    labelProject: 'Progetto:',
    labelReport: 'Segnalazione:',
    labelStatus: 'Stato:',
    ctaViewReport: 'Visualizza la segnalazione',
    outro:
      'Grazie per la tua segnalazione. Continueremo a tenerti aggiornato su eventuali cambiamenti.',
  }),
};

export default it;
