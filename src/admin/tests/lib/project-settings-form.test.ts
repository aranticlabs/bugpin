import { describe, expect, it } from 'vitest';
import {
  buildProjectSettingsUpdate,
  projectSettingsToForm,
} from '../../components/project/settings/projectSettingsForm';
import type { ProjectSettings } from '@shared/types';

describe('project portal settings updates', () => {
  it.each<ProjectSettings | undefined>([
    undefined,
    {},
    { reporterPortal: { enabled: false, allowNewFeedback: false } },
    { reporterPortal: { enabled: true, allowNewFeedback: false } },
    { reporterPortal: { enabled: true, allowNewFeedback: true } },
  ])('omits an unchanged normalized portal while saving unrelated settings: %j', (saved) => {
    const form = projectSettingsToForm(saved, null);
    const update = buildProjectSettingsUpdate(
      saved,
      { ...form, defaultAssigneeUserId: 'user-2' },
      undefined
    );
    expect(update).not.toHaveProperty('reporterPortal');
    expect(update.defaultAssigneeUserId).toBe('user-2');
  });

  it('includes a changed portal and supports disabling new submissions or the portal', () => {
    const saved = { reporterPortal: { enabled: true, allowNewFeedback: true } };
    const form = projectSettingsToForm(saved, null);
    for (const reporterPortal of [
      { enabled: true, allowNewFeedback: false },
      { enabled: false, allowNewFeedback: false },
    ])
      expect(
        buildProjectSettingsUpdate(saved, { ...form, reporterPortal }, undefined).reporterPortal
      ).toEqual(reporterPortal);
    const off = projectSettingsToForm(undefined, null);
    expect(
      buildProjectSettingsUpdate(
        undefined,
        { ...off, reporterPortal: { enabled: true, allowNewFeedback: false } },
        undefined
      ).reporterPortal
    ).toEqual({ enabled: true, allowNewFeedback: false });
  });
});
