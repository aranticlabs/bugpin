import type { Catalog } from '../catalog';

const catalog = {
  portalTitle: 'Portale segnalazioni',
  loginTitle: 'Segui i tuoi feedback',
  email: 'Indirizzo e-mail',
  sendLink: 'Inviami un link di accesso',
  linkSent:
    'Se questo indirizzo può usare il portale, abbiamo inviato un link. Scade tra 15 minuti.',
  signInAs: 'Accedere come {email}?',
  switchAccount: 'Hai effettuato l’accesso come {email}. Continua per cambiare account.',
  requestedLinkExpired: 'Questo link è scaduto. Richiedi un nuovo link di accesso.',
  linkExpired: 'Questo link è scaduto. Inviare un nuovo link a {email}?',
  linkInvalid: 'Questo link non è valido.',
  resend: 'Invia un nuovo link',
  continue: 'Continua',
  requestNewLink: 'Richiedi un nuovo link',
  loading: 'Caricamento…',
  requestFailed: 'Si è verificato un errore. Riprova.',
  sessionExpired: 'La sessione è scaduta. Richiedi un nuovo link di accesso.',
  signOut: 'Esci',
  language: 'Lingua',
  myFeedback: 'I miei feedback',
  notFound: 'Pagina non trovata',
  backHome: 'Torna alla pagina iniziale',
  poweredBy: 'Realizzato con BugPin',
  skipContent: 'Vai al contenuto',
  retry: 'Riprova',
  previousReporter: 'Autore precedente',
} satisfies Catalog;

export default catalog;
