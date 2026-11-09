import type { EmailTemplate } from '@shared/types';
import { reporterCopy } from '../../reporter-copy.js';
import { reporterLoginHtml } from '../styles.js';

const fr: EmailTemplate = {
  subject: reporterCopy.fr.login,
  html: reporterLoginHtml(reporterCopy.fr),
};

export default fr;
