import type { Catalog } from '../catalog';

const catalog = {
  portalTitle: '报告者门户',
  loginTitle: '跟踪你的反馈',
  email: '电子邮箱',
  sendLink: '发送登录链接',
  linkSent: '如果此邮箱可以使用门户，我们已发送链接。链接将在15分钟后过期。',
  signInAs: '以 {email} 登录？',
  switchAccount: '你当前以 {email} 登录。继续将切换账号。',
  requestedLinkExpired: '此链接已过期，请申请新的登录链接。',
  linkExpired: '此链接已过期。要向 {email} 发送新链接吗？',
  linkInvalid: '此链接无效。',
  resend: '发送新链接',
  continue: '继续',
  requestNewLink: '申请新链接',
  loading: '加载中…',
  requestFailed: '出现问题，请重试。',
  sessionExpired: '会话已过期，请申请新的登录链接。',
  signOut: '退出登录',
  language: '语言',
  myFeedback: '我的反馈',
  notFound: '找不到页面',
  backHome: '返回首页',
  poweredBy: '由 BugPin 提供支持',
  skipContent: '跳转到内容',
  retry: '重试',
  previousReporter: '之前的报告者',
} satisfies Catalog;

export default catalog;
