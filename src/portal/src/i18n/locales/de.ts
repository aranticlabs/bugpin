import type { Catalog } from '../catalog';

const catalog = {
  portalTitle: 'Reporter-Portal',
  loginTitle: 'Verfolge dein Feedback',
  email: 'E-Mail-Adresse',
  sendLink: 'Anmeldelink senden',
  linkSent:
    'Falls diese Adresse das Portal nutzen kann, haben wir einen Link gesendet. Er ist 15 Minuten gültig.',
  signInAs: 'Als {email} anmelden?',
  switchAccount: 'Du bist als {email} angemeldet. Fahre fort, um das Konto zu wechseln.',
  requestedLinkExpired: 'Dieser Link ist abgelaufen. Fordere einen neuen Anmeldelink an.',
  linkExpired: 'Dieser Link ist abgelaufen. Neuen Link an {email} senden?',
  linkInvalid: 'Dieser Link ist ungültig.',
  resend: 'Neuen Link senden',
  continue: 'Fortfahren',
  requestNewLink: 'Neuen Link anfordern',
  loading: 'Wird geladen…',
  requestFailed: 'Etwas ist schiefgelaufen. Bitte versuche es erneut.',
  sessionExpired: 'Deine Sitzung ist abgelaufen. Fordere einen neuen Anmeldelink an.',
  signOut: 'Abmelden',
  language: 'Sprache',
  myFeedback: 'Mein Feedback',
  notFound: 'Seite nicht gefunden',
  backHome: 'Zur Startseite',
  poweredBy: 'Bereitgestellt von BugPin',
  skipContent: 'Zum Inhalt springen',
  retry: 'Erneut versuchen',
  previousReporter: 'Vorheriger Melder',
} satisfies Catalog;

export default catalog;
