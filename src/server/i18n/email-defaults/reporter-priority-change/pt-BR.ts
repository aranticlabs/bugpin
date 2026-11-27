import type { EmailTemplate } from '@shared/types';
import { reporterPriorityChangeHtml } from '../styles.js';

const ptBR: EmailTemplate = {
  subject: 'Prioridade atualizada no seu relato de problema: {{report.title}}',
  html: reporterPriorityChangeHtml({
    headerTitle: 'Prioridade do relato atualizada',
    intro: 'A prioridade do seu relato de problema foi atualizada.',
    outro: 'Obrigado pelo seu relato. Vamos continuar avisando você sobre qualquer mudança.',
  }),
};

export default ptBR;
