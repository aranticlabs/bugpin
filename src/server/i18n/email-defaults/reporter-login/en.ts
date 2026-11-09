import type { EmailTemplate } from '@shared/types';
import { reporterCopy } from '../../reporter-copy.js';
import { reporterLoginHtml } from '../styles.js';

const en: EmailTemplate = {
  subject: reporterCopy.en.login,
  html: reporterLoginHtml(reporterCopy.en),
};

export default en;
