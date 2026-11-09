import type { LocaleCode, TeamTemplateDefaults } from '@shared/types';
import { emailStyles } from '../styles.js';

const copy: Record<LocaleCode, { title: string; intro: string; action: string }> = {
  en: {
    title: 'New reporter activity',
    intro: 'A reporter replied or submitted feedback in {{project.name}}.',
    action: 'View in the Admin Console',
  },
  de: {
    title: 'Neue Reporter-Aktivität',
    intro: 'Ein Reporter hat in {{project.name}} geantwortet oder Feedback eingereicht.',
    action: 'In der Admin Console ansehen',
  },
  es: {
    title: 'Nueva actividad del informante',
    intro: 'Un informante respondió o envió comentarios en {{project.name}}.',
    action: 'Ver en la Admin Console',
  },
  fr: {
    title: 'Nouvelle activité du rapporteur',
    intro: 'Un rapporteur a répondu ou envoyé un retour dans {{project.name}}.',
    action: 'Voir dans la Admin Console',
  },
  it: {
    title: 'Nuova attività del segnalatore',
    intro: 'Un segnalatore ha risposto o inviato un feedback in {{project.name}}.',
    action: 'Apri nella Admin Console',
  },
  ja: {
    title: '報告者の新しいアクティビティ',
    intro: '報告者が {{project.name}} で返信またはフィードバックを送信しました。',
    action: 'Admin Consoleで表示',
  },
  nl: {
    title: 'Nieuwe activiteit van de melder',
    intro: 'Een melder heeft geantwoord of feedback ingediend in {{project.name}}.',
    action: 'Bekijken in de Admin Console',
  },
  zh: {
    title: '报告者的新动态',
    intro: '报告者在 {{project.name}} 中回复或提交了反馈。',
    action: '在Admin Console中查看',
  },
};

function template(locale: LocaleCode) {
  const text = copy[locale];
  return {
    subject: `${text.title}: {{report.title}}`,
    html: `<!DOCTYPE html><html lang="${locale}"><head><meta charset="utf-8"><style>${emailStyles}</style></head><body><div class="container"><div class="header"><h1>${text.title}</h1><p>{{app.name}}</p></div><div class="content"><p>${text.intro}</p><h2>{{report.title}}</h2><a class="button" href="{{report.url}}">${text.action}</a></div></div></body></html>`,
  };
}

export const reporterActivity: TeamTemplateDefaults = {
  en: template('en'),
  de: template('de'),
  es: template('es'),
  fr: template('fr'),
  it: template('it'),
  ja: template('ja'),
  nl: template('nl'),
  zh: template('zh'),
};
