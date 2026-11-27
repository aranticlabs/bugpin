import type { EmailTemplate } from '@shared/types';
import { reporterCopy } from '../../reporter-copy.js';
import { reporterLoginHtml } from '../styles.js';

const it: EmailTemplate = {
  subject: reporterCopy.it.login,
  html: reporterLoginHtml(reporterCopy.it),
};

export default it;
