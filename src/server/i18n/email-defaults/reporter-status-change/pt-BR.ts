import type { EmailTemplate } from '@shared/types';
import { reporterStatusChangeHtml } from '../styles.js';

const ptBR: EmailTemplate = {
  subject: 'Novidade no seu relato de problema: {{report.title}}',
  html: reporterStatusChangeHtml({
    headerTitle: 'Status do relato atualizado',
    intro: 'O status do seu relato de problema foi atualizado.',
    teamMessageLabel: 'Mensagem da equipe:',
    outro: 'Obrigado pelo seu relato. Vamos continuar avisando você sobre qualquer mudança.',
  }),
};

export default ptBR;
