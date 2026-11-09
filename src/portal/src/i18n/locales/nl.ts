import type { Catalog } from '../catalog';

const catalog = {
  portalTitle: 'Meldersportaal',
  loginTitle: 'Volg je feedback',
  email: 'E-mailadres',
  sendLink: 'Stuur mij een inloglink',
  linkSent:
    'Als dit adres het portaal kan gebruiken, hebben we een link verstuurd. Deze verloopt over 15 minuten.',
  signInAs: 'Inloggen als {email}?',
  switchAccount: 'Je bent ingelogd als {email}. Ga verder om van account te wisselen.',
  requestedLinkExpired: 'Deze link is verlopen. Vraag een nieuwe inloglink aan.',
  linkExpired: 'Deze link is verlopen. Een nieuwe link naar {email} sturen?',
  linkInvalid: 'Deze link is ongeldig.',
  resend: 'Nieuwe link sturen',
  continue: 'Doorgaan',
  requestNewLink: 'Nieuwe link aanvragen',
  loading: 'Laden…',
  requestFailed: 'Er is iets misgegaan. Probeer het opnieuw.',
  sessionExpired: 'Je sessie is verlopen. Vraag een nieuwe inloglink aan.',
  signOut: 'Uitloggen',
  language: 'Taal',
  myFeedback: 'Mijn feedback',
  notFound: 'Pagina niet gevonden',
  backHome: 'Terug naar de startpagina',
  poweredBy: 'Mogelijk gemaakt door BugPin',
  skipContent: 'Naar inhoud',
  retry: 'Opnieuw proberen',
  previousReporter: 'Vorige melder',
} satisfies Catalog;

export default catalog;
