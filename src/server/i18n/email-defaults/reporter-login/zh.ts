import type { EmailTemplate } from '@shared/types';
import { reporterCopy } from '../../reporter-copy.js';
import { reporterLoginHtml } from '../styles.js';

const zh: EmailTemplate = {
  subject: reporterCopy.zh.login,
  html: reporterLoginHtml(reporterCopy.zh),
};

export default zh;
