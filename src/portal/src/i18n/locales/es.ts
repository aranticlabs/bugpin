import type { Catalog } from '../catalog';

const catalog = {
  portalTitle: 'Portal de informantes',
  loginTitle: 'Sigue tus comentarios',
  email: 'Correo electrónico',
  sendLink: 'Enviarme un enlace de acceso',
  linkSent: 'Si esta dirección puede usar el portal, enviamos un enlace. Caduca en 15 minutos.',
  signInAs: '¿Acceder como {email}?',
  switchAccount: 'Has iniciado sesión como {email}. Continúa para cambiar de cuenta.',
  requestedLinkExpired: 'Este enlace ha caducado. Solicita un enlace de acceso nuevo.',
  linkExpired: 'Este enlace ha caducado. ¿Enviar uno nuevo a {email}?',
  linkInvalid: 'Este enlace no es válido.',
  resend: 'Enviar un enlace nuevo',
  continue: 'Continuar',
  requestNewLink: 'Solicitar un enlace nuevo',
  loading: 'Cargando…',
  requestFailed: 'Algo salió mal. Inténtalo de nuevo.',
  sessionExpired: 'Tu sesión ha caducado. Solicita un enlace de acceso nuevo.',
  signOut: 'Cerrar sesión',
  language: 'Idioma',
  myFeedback: 'Mis comentarios',
  notFound: 'Página no encontrada',
  backHome: 'Volver al inicio',
  poweredBy: 'Desarrollado por BugPin',
  skipContent: 'Saltar al contenido',
  retry: 'Intentar de nuevo',
  previousReporter: 'Informante anterior',
} satisfies Catalog;

export default catalog;
