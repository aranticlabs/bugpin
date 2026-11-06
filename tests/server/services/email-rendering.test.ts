import { describe, it, expect } from 'bun:test';
import { resolveTemplate } from '../../../src/server/services/email.service';
import { templateService } from '../../../src/server/services/template.service';
import { applyBrandColor, appendFooterToHtml } from '../../../src/server/constants/email-templates';
import {
  getStatusLabel,
  getPriorityLabel,
  formatReportDate,
} from '../../../src/server/i18n/labels';
import type { ReportPriority, ReportStatus, Report, LocaleCode } from '../../../src/shared/types';

const BRAND_COLOR = '#02658D';

const baseReport: Report = {
  id: 'rpt_render_1',
  projectId: 'prj_render_1',
  source: 'widget',
  title: 'Login button does not respond on mobile',
  description: 'Tapping the login button on iOS Safari does nothing.',
  status: 'in_progress',
  priority: 'high',
  reporterLocale: 'en',
  metadata: {
    url: 'https://example.com/login',
    browser: { name: 'Safari', version: '17', userAgent: 'UA' },
    device: { type: 'mobile', os: 'iOS' },
    viewport: { width: 390, height: 844, devicePixelRatio: 3 },
    timestamp: '2026-05-03T12:34:00.000Z',
  },
  createdAt: '2026-05-03T12:34:00.000Z',
  updatedAt: '2026-05-03T12:34:00.000Z',
};

function renderReporterConfirmation(locale: LocaleCode): { subject: string; html: string } {
  const template = resolveTemplate('reporterConfirmation', locale);
  const data = {
    app: { name: 'BugPin', url: 'https://example.com' },
    project: { name: 'Acme Web' },
    report: {
      title: baseReport.title,
      description: baseReport.description ?? '',
      status: baseReport.status,
      statusFormatted: getStatusLabel(baseReport.status as ReportStatus, locale),
      priority: baseReport.priority,
      priorityFormatted: getPriorityLabel(baseReport.priority as ReportPriority, locale),
      createdAt: formatReportDate(baseReport.createdAt, locale),
    },
  };
  const subject = templateService.compileTemplate(template.subject, data);
  const compiled = templateService.compileTemplate(template.html, data);
  const withFooter = appendFooterToHtml(compiled, 'reporterConfirmation');
  const html = applyBrandColor(withFooter, BRAND_COLOR);
  return { subject, html };
}

function renderReporterStatusChange(
  locale: LocaleCode,
  oldStatus: ReportStatus,
  newStatus: ReportStatus
): { subject: string; html: string } {
  const template = resolveTemplate('reporterStatusChange', locale);
  const data = {
    app: { name: 'BugPin', url: 'https://example.com' },
    project: { name: 'Acme Web' },
    report: {
      title: baseReport.title,
      description: baseReport.description ?? '',
      status: newStatus,
      statusFormatted: getStatusLabel(newStatus, locale),
    },
    oldStatus,
    oldStatusFormatted: getStatusLabel(oldStatus, locale),
    newStatus,
    newStatusFormatted: getStatusLabel(newStatus, locale),
    reporterMessage: '',
    reporterMessageDisplay: 'none',
  };
  const subject = templateService.compileTemplate(template.subject, data);
  const compiled = templateService.compileTemplate(template.html, data);
  const withFooter = appendFooterToHtml(compiled, 'reporterStatusChange');
  const html = applyBrandColor(withFooter, BRAND_COLOR);
  return { subject, html };
}

describe('translated email rendering', () => {
  describe('German reporter confirmation', () => {
    const { subject, html } = renderReporterConfirmation('de');

    it('uses the German subject line', () => {
      expect(subject).toContain('Dein Fehlerbericht ist eingegangen');
      expect(subject).toContain(baseReport.title);
    });

    it('uses the German header and intro copy', () => {
      expect(html).toContain('Bericht eingegangen');
      expect(html).toContain('Vielen Dank für deinen Fehlerbericht');
    });

    it('uses German status and priority labels', () => {
      expect(html).toContain('In Bearbeitung');
      expect(html).toContain('Hoch');
    });

    it('does not leak English status or priority labels', () => {
      expect(html).not.toContain('In Progress');
      expect(html).not.toContain('>High<');
    });

    it('does not contain the English header copy', () => {
      expect(html).not.toContain('Report Received');
      expect(html).not.toContain('Thank you for submitting your bug report');
    });

    it('substitutes all template placeholders', () => {
      expect(html).not.toMatch(/\{\{[^}]+\}\}/);
      expect(html).toContain(baseReport.title);
    });

    it('replaces the brand color placeholder', () => {
      expect(html).not.toContain('__BRAND_COLOR__');
      expect(html).not.toContain('__BRAND_COLOR_HOVER__');
      expect(html).toContain(BRAND_COLOR);
    });
  });

  describe('French reporter status change', () => {
    const { subject, html } = renderReporterStatusChange('fr', 'open', 'in_progress');

    it('uses the French subject line', () => {
      expect(subject).toContain('Mise à jour de ton rapport de bug');
      expect(subject).toContain(baseReport.title);
    });

    it('uses the French header and intro copy', () => {
      expect(html).toContain('Statut du rapport mis à jour');
      expect(html).toContain('Le statut de ton rapport de bug a été mis à jour');
    });

    it('uses French status labels for both old and new status', () => {
      expect(html).toContain('Ouvert');
      expect(html).toContain('En cours');
    });

    it('does not leak English status labels', () => {
      expect(html).not.toContain('In Progress');
      expect(html).not.toContain('>Open<');
    });

    it('does not contain the English header copy', () => {
      expect(html).not.toContain('Report Status Updated');
      expect(html).not.toContain('The status of your bug report has been updated');
    });

    it('substitutes all template placeholders', () => {
      expect(html).not.toMatch(/\{\{[^}]+\}\}/);
      expect(html).toContain(baseReport.title);
    });

    it('replaces the brand color placeholder', () => {
      expect(html).not.toContain('__BRAND_COLOR__');
      expect(html).not.toContain('__BRAND_COLOR_HOVER__');
      expect(html).toContain(BRAND_COLOR);
    });
  });

  describe('Japanese reporter confirmation', () => {
    const { subject, html } = renderReporterConfirmation('ja');

    it('uses Japanese status and priority labels', () => {
      expect(html).toContain('対応中');
      expect(html).toContain('高');
    });

    it('does not leak English labels', () => {
      expect(html).not.toContain('In Progress');
      expect(html).not.toContain('>High<');
    });
  });

  describe('Simplified Chinese reporter status change', () => {
    const { subject, html } = renderReporterStatusChange('zh', 'in_progress', 'resolved');

    it('uses Chinese status labels for both old and new status', () => {
      expect(html).toContain('处理中');
      expect(html).toContain('已解决');
    });

    it('does not leak English status labels', () => {
      expect(html).not.toContain('In Progress');
      expect(html).not.toContain('Resolved');
    });
  });
});
