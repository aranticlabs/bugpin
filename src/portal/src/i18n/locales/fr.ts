import type { Catalog } from '../catalog';

const catalog = {
  portalTitle: 'Portail des signalements',
  loginTitle: 'Suivez vos retours',
  email: 'Adresse e-mail',
  sendLink: 'Envoyer un lien de connexion',
  linkSent:
    'Si cette adresse peut utiliser le portail, nous avons envoyé un lien. Il expire dans 15 minutes.',
  signInAs: 'Se connecter en tant que {email} ?',
  switchAccount: 'Vous êtes connecté en tant que {email}. Continuez pour changer de compte.',
  requestedLinkExpired: 'Ce lien a expiré. Demandez un nouveau lien de connexion.',
  linkExpired: 'Ce lien a expiré. Envoyer un nouveau lien à {email} ?',
  linkInvalid: 'Ce lien n’est pas valide.',
  resend: 'Envoyer un nouveau lien',
  continue: 'Continuer',
  requestNewLink: 'Demander un nouveau lien',
  loading: 'Chargement…',
  requestFailed: 'Une erreur est survenue. Veuillez réessayer.',
  sessionExpired: 'Votre session a expiré. Demandez un nouveau lien de connexion.',
  signOut: 'Se déconnecter',
  language: 'Langue',
  myFeedback: 'Mes retours',
  notFound: 'Page introuvable',
  backHome: 'Retour à l’accueil',
  poweredBy: 'Propulsé par BugPin',
  skipContent: 'Aller au contenu',
  retry: 'Réessayer',
  previousReporter: 'Auteur précédent',
} satisfies Catalog;

export default catalog;
