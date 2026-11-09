import type { LocaleCode } from '@shared/types';

export interface ReporterCopy {
  login: string;
  loginIntro: string;
  loginExpiry: string;
  track: string;
  reply: string;
  view: string;
  files: string;
  fileOnly: string;
  fileHint: string;
  fileUnavailable: string;
  unsubscribe: string;
  unsubscribeIntro: string;
  unsubscribed: string;
}

export const reporterCopy: Record<LocaleCode, ReporterCopy> = {
  en: {
    fileUnavailable:
      'Contact the team to access the files. Files are private and are not attached to this email.',
    login: 'Sign in to your feedback',
    loginIntro: 'Use this link to follow your feedback and talk to the team.',
    loginExpiry: 'This link expires in 15 minutes and can only be used once.',
    track: 'Track this report',
    reply: 'Reply in the portal',
    view: 'View update',
    files: 'Attachments',
    fileOnly: 'The team shared files with you.',
    fileHint:
      'Sign in to the portal to view the files. Files are private and are not attached to this email.',
    unsubscribe: 'Unsubscribe from update emails',
    unsubscribeIntro:
      'Stop update emails for this email address? Sign-in emails will still be delivered.',
    unsubscribed: 'You have unsubscribed from update emails.',
  },
  de: {
    fileUnavailable:
      'Kontaktiere das Team, um die Dateien zu erhalten. Sie sind privat und nicht an diese E-Mail angehängt.',
    login: 'Zu deinem Feedback anmelden',
    loginIntro: 'Mit diesem Link kannst du dein Feedback verfolgen und mit dem Team sprechen.',
    loginExpiry: 'Dieser Link ist 15 Minuten gültig und kann nur einmal verwendet werden.',
    track: 'Diesen Bericht verfolgen',
    reply: 'Im Portal antworten',
    view: 'Update ansehen',
    files: 'Anhänge',
    fileOnly: 'Das Team hat Dateien mit dir geteilt.',
    fileHint:
      'Melde dich im Portal an, um die Dateien anzusehen. Sie sind privat und nicht an diese E-Mail angehängt.',
    unsubscribe: 'Update-E-Mails abbestellen',
    unsubscribeIntro:
      'Update-E-Mails für diese Adresse abbestellen? Anmelde-E-Mails werden weiterhin zugestellt.',
    unsubscribed: 'Du hast Update-E-Mails abbestellt.',
  },
  es: {
    fileUnavailable:
      'Contacta con el equipo para acceder a los archivos. Son privados y no se adjuntan a este correo.',
    login: 'Inicia sesión para ver tus comentarios',
    loginIntro: 'Usa este enlace para seguir tus comentarios y hablar con el equipo.',
    loginExpiry: 'Este enlace caduca en 15 minutos y solo se puede usar una vez.',
    track: 'Seguir este informe',
    reply: 'Responder en el portal',
    view: 'Ver actualización',
    files: 'Archivos adjuntos',
    fileOnly: 'El equipo ha compartido archivos contigo.',
    fileHint:
      'Inicia sesión en el portal para ver los archivos. Son privados y no se adjuntan a este correo.',
    unsubscribe: 'Cancelar los correos de actualizaciones',
    unsubscribeIntro:
      '¿Dejar de recibir actualizaciones en esta dirección? Seguirás recibiendo correos para iniciar sesión.',
    unsubscribed: 'Has cancelado los correos de actualizaciones.',
  },
  fr: {
    fileUnavailable:
      'Contactez l’équipe pour accéder aux fichiers. Ils sont privés et ne sont pas joints à cet e-mail.',
    login: 'Connectez-vous pour suivre vos retours',
    loginIntro: 'Utilisez ce lien pour suivre vos retours et échanger avec l’équipe.',
    loginExpiry: 'Ce lien expire dans 15 minutes et ne peut être utilisé qu’une fois.',
    track: 'Suivre ce signalement',
    reply: 'Répondre dans le portail',
    view: 'Voir la mise à jour',
    files: 'Pièces jointes',
    fileOnly: 'L’équipe a partagé des fichiers avec vous.',
    fileHint:
      'Connectez-vous au portail pour voir les fichiers. Ils sont privés et ne sont pas joints à cet e-mail.',
    unsubscribe: 'Se désabonner des e-mails de mise à jour',
    unsubscribeIntro:
      'Ne plus recevoir de mises à jour à cette adresse ? Les e-mails de connexion seront toujours envoyés.',
    unsubscribed: 'Vous êtes désabonné des e-mails de mise à jour.',
  },
  it: {
    fileUnavailable:
      'Contatta il team per accedere ai file. Sono privati e non sono allegati a questa email.',
    login: 'Accedi per seguire il tuo feedback',
    loginIntro: 'Usa questo link per seguire il tuo feedback e parlare con il team.',
    loginExpiry: 'Questo link scade tra 15 minuti e può essere usato una sola volta.',
    track: 'Segui questa segnalazione',
    reply: 'Rispondi nel portale',
    view: 'Visualizza aggiornamento',
    files: 'Allegati',
    fileOnly: 'Il team ha condiviso dei file con te.',
    fileHint:
      'Accedi al portale per vedere i file. Sono privati e non sono allegati a questa email.',
    unsubscribe: 'Annulla le email di aggiornamento',
    unsubscribeIntro:
      'Interrompere gli aggiornamenti a questo indirizzo? Le email di accesso continueranno ad arrivare.',
    unsubscribed: 'Hai annullato le email di aggiornamento.',
  },
  ja: {
    fileUnavailable:
      'ファイルを確認するにはチームにお問い合わせください。ファイルは非公開で、このメールには添付されていません。',
    login: 'フィードバックにサインイン',
    loginIntro: 'このリンクからフィードバックを確認し、チームとやり取りできます。',
    loginExpiry: 'このリンクは15分間有効で、一度だけ使用できます。',
    track: 'この報告を確認',
    reply: 'ポータルで返信',
    view: '更新を表示',
    files: '添付ファイル',
    fileOnly: 'チームがファイルを共有しました。',
    fileHint:
      'ファイルを見るにはポータルにサインインしてください。ファイルは非公開で、このメールには添付されていません。',
    unsubscribe: '更新メールの配信を停止',
    unsubscribeIntro:
      'このメールアドレスへの更新メールを停止しますか？サインイン用メールは引き続き届きます。',
    unsubscribed: '更新メールの配信を停止しました。',
  },
  nl: {
    fileUnavailable:
      'Neem contact op met het team om de bestanden te bekijken. Ze zijn privé en niet bij deze e-mail gevoegd.',
    login: 'Log in om je feedback te volgen',
    loginIntro: 'Gebruik deze link om je feedback te volgen en met het team te praten.',
    loginExpiry: 'Deze link verloopt over 15 minuten en kan maar één keer worden gebruikt.',
    track: 'Volg deze melding',
    reply: 'Antwoorden in het portaal',
    view: 'Update bekijken',
    files: 'Bijlagen',
    fileOnly: 'Het team heeft bestanden met je gedeeld.',
    fileHint:
      'Log in op het portaal om de bestanden te bekijken. Ze zijn privé en niet bij deze e-mail gevoegd.',
    unsubscribe: 'Afmelden voor update-e-mails',
    unsubscribeIntro:
      'Geen updates meer ontvangen op dit adres? Inlogmails worden nog steeds bezorgd.',
    unsubscribed: 'Je bent afgemeld voor update-e-mails.',
  },
  zh: {
    fileUnavailable: '请联系团队以访问文件。文件为私密内容，未附加到此邮件中。',
    login: '登录以跟踪你的反馈',
    loginIntro: '使用此链接跟踪你的反馈并与团队交流。',
    loginExpiry: '此链接将在15分钟后过期，并且只能使用一次。',
    track: '跟踪此报告',
    reply: '在门户中回复',
    view: '查看更新',
    files: '附件',
    fileOnly: '团队与你分享了文件。',
    fileHint: '请登录门户查看文件。文件为私密内容，未附加到此邮件中。',
    unsubscribe: '取消订阅更新邮件',
    unsubscribeIntro: '停止向此地址发送更新邮件？登录邮件仍会正常发送。',
    unsubscribed: '你已取消订阅更新邮件。',
  },
};
