import type { EmailTemplate } from '@shared/types';
import { reporterAssignmentHtml } from '../styles.js';

const ptBR: EmailTemplate = {
  subject: '[{{project.name}}] Responsável pelo relato atualizado: {{report.title}}',
  html: reporterAssignmentHtml({
    headerTitle: 'Responsável atualizado',
    introWithPrevious:
      'O seu relato passou de <strong>{{previousAssigneeName}}</strong> para <strong>{{assignee.name}}</strong>.',
    introWithoutPrevious: 'O seu relato foi atribuído a <strong>{{assignee.name}}</strong>.',
    labelProject: 'Projeto:',
    labelReport: 'Relato:',
    labelStatus: 'Status:',
    ctaViewReport: 'Ver relato',
    outro: 'Obrigado pelo seu relato. Vamos continuar avisando você sobre qualquer mudança.',
  }),
};

export default ptBR;
