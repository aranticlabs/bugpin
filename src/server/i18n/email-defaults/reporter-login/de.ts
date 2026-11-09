import type { EmailTemplate } from '@shared/types';
import { reporterCopy } from '../../reporter-copy.js';
import { reporterLoginHtml } from '../styles.js';

const de: EmailTemplate = {
  subject: reporterCopy.de.login,
  html: reporterLoginHtml(reporterCopy.de),
};

export default de;
