import type { EmailTemplate } from '@shared/types';
import { reporterAssignmentHtml } from '../styles.js';

const de: EmailTemplate = {
  subject: 'Zuweisungsänderung deines Fehlerberichts: {{report.title}}',
  html: reporterAssignmentHtml({
    headerTitle: 'Zuweisung aktualisiert',
    introWithPrevious:
      'Dein Bericht wurde von <strong>{{previousAssigneeName}}</strong> an <strong>{{assignee.name}}</strong> neu zugewiesen.',
    introWithoutPrevious: 'Dein Bericht wurde <strong>{{assignee.name}}</strong> zugewiesen.',
    labelProject: 'Projekt:',
    labelReport: 'Bericht:',
    labelStatus: 'Status:',
    ctaViewReport: 'Bericht ansehen',
    outro:
      'Vielen Dank für deinen Bericht. Wir halten dich weiterhin über alle Änderungen auf dem Laufenden.',
  }),
};

export default de;
