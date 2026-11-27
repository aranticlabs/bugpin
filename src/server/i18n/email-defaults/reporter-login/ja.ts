import type { EmailTemplate } from '@shared/types';
import { reporterCopy } from '../../reporter-copy.js';
import { reporterLoginHtml } from '../styles.js';

const ja: EmailTemplate = {
  subject: reporterCopy.ja.login,
  html: reporterLoginHtml(reporterCopy.ja),
};

export default ja;
