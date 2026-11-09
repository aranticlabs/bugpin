import type { EmailTemplate } from '@shared/types';
import { reporterCopy } from '../../reporter-copy.js';
import { reporterLoginHtml } from '../styles.js';

const nl: EmailTemplate = {
  subject: reporterCopy.nl.login,
  html: reporterLoginHtml(reporterCopy.nl),
};

export default nl;
