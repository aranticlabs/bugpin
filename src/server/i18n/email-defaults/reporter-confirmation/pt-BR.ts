import type { EmailTemplate } from '@shared/types';
import { reporterConfirmationHtml } from '../styles.js';

const ptBR: EmailTemplate = {
  subject: 'Recebemos o seu relato de problema: {{report.title}}',
  html: reporterConfirmationHtml({
    headerTitle: 'Relato recebido',
    intro:
      'Obrigado por enviar o seu relato de problema. A nossa equipe recebeu o relato e vai analisá-lo em breve.',
    labelStatus: 'Status:',
    labelPriority: 'Prioridade:',
    labelSubmitted: 'Enviado em:',
    outro: 'Você vai receber um e-mail quando o status do seu relato mudar.',
  }),
};

export default ptBR;
