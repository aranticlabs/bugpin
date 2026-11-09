import type { DefaultEmailTemplates } from '@shared/types';
import { reporterLogin } from './reporter-login/index.js';
import { reporterConfirmation } from './reporter-confirmation/index.js';
import { reporterStatusChange } from './reporter-status-change/index.js';
import { reporterPriorityChange } from './reporter-priority-change/index.js';
import { reporterMessage } from './reporter-message/index.js';
import { reporterAssignment } from './reporter-assignment/index.js';
import { newReport } from './team/newReport.js';
import { statusChange } from './team/statusChange.js';
import { priorityChange } from './team/priorityChange.js';
import { assignment } from './team/assignment.js';
import { reportDeleted } from './team/reportDeleted.js';
import { invitation } from './team/invitation.js';
import { passwordReset } from './team/passwordReset.js';
import { testEmail } from './team/testEmail.js';

export const defaultEmailTemplates: DefaultEmailTemplates = {
  reporterLogin,
  reporterConfirmation,
  reporterStatusChange,
  reporterPriorityChange,
  reporterMessage,
  reporterAssignment,
  newReport,
  statusChange,
  priorityChange,
  assignment,
  reportDeleted,
  invitation,
  passwordReset,
  testEmail,
};
