import type { EmailTemplate } from '@shared/types';
import { reporterAssignmentHtml } from '../styles.js';

const fr: EmailTemplate = {
  subject: "Mise à jour de l'attribution de ton rapport de bug : {{report.title}}",
  html: reporterAssignmentHtml({
    headerTitle: 'Attribution mise à jour',
    introWithPrevious:
      'Ton rapport a été réattribué de <strong>{{previousAssigneeName}}</strong> à <strong>{{assignee.name}}</strong>.',
    introWithoutPrevious: 'Ton rapport a été attribué à <strong>{{assignee.name}}</strong>.',
    labelProject: 'Projet :',
    labelReport: 'Rapport :',
    labelStatus: 'Statut :',
    ctaViewReport: 'Voir le rapport',
    outro: 'Merci pour ton rapport. Nous continuerons à te tenir au courant de toute évolution.',
  }),
};

export default fr;
