import type { EmailTemplate } from '@shared/types';
import { reporterMessageHtml } from '../styles.js';

const ptBR: EmailTemplate = {
  subject: 'Mensagem sobre o seu relato de problema: {{report.title}}',
  html: reporterMessageHtml({
    headerTitle: 'Mensagem sobre o seu relato',
    intro: '<strong>{{sender.name}}</strong> enviou uma mensagem sobre o seu relato de problema.',
  }),
};

export default ptBR;
