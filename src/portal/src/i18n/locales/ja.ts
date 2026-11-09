import type { Catalog } from '../catalog';

const catalog = {
  portalTitle: '報告者ポータル',
  loginTitle: 'フィードバックの状況を確認',
  email: 'メールアドレス',
  sendLink: 'ログインリンクを送信',
  linkSent: 'このアドレスでポータルを利用できる場合、リンクを送信しました。有効期限は15分です。',
  signInAs: '{email} としてログインしますか？',
  switchAccount: '現在 {email} としてログインしています。続行するとアカウントが切り替わります。',
  requestedLinkExpired: 'このリンクは期限切れです。新しいログインリンクをリクエストしてください。',
  linkExpired: 'このリンクは期限切れです。{email} に新しいリンクを送信しますか？',
  linkInvalid: 'このリンクは無効です。',
  resend: '新しいリンクを送信',
  continue: '続行',
  requestNewLink: '新しいリンクをリクエスト',
  loading: '読み込み中…',
  requestFailed: '問題が発生しました。もう一度お試しください。',
  sessionExpired:
    'セッションの有効期限が切れました。新しいログインリンクをリクエストしてください。',
  signOut: 'ログアウト',
  language: '言語',
  myFeedback: '自分のフィードバック',
  notFound: 'ページが見つかりません',
  backHome: 'ホームに戻る',
  poweredBy: 'Powered by BugPin',
  skipContent: '本文へ移動',
  retry: '再試行',
  previousReporter: '以前の報告者',
} satisfies Catalog;

export default catalog;
