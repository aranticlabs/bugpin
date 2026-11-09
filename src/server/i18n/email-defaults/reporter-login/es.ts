import type { EmailTemplate } from '@shared/types';
import { reporterCopy } from '../../reporter-copy.js';
import { reporterLoginHtml } from '../styles.js';

const es: EmailTemplate = {
  subject: reporterCopy.es.login,
  html: reporterLoginHtml(reporterCopy.es),
};

export default es;
