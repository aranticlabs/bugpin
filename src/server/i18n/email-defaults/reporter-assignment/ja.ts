import type { EmailTemplate } from '@shared/types';
import { reporterAssignmentHtml } from '../styles.js';

const ja: EmailTemplate = {
  subject: 'バグレポートの担当者が変更されました：{{report.title}}',
  html: reporterAssignmentHtml({
    headerTitle: '担当者が更新されました',
    introWithPrevious:
      'お送りいただいたバグレポートの担当者が<strong>{{previousAssigneeName}}</strong>から<strong>{{assignee.name}}</strong>に変更されました。',
    introWithoutPrevious:
      'お送りいただいたバグレポートの担当者として<strong>{{assignee.name}}</strong>が割り当てられました。',
    labelProject: 'プロジェクト：',
    labelReport: 'レポート：',
    labelStatus: 'ステータス：',
    ctaViewReport: 'レポートを表示',
    outro: 'レポートをお送りいただきありがとうございます。今後も変更があり次第お知らせします。',
  }),
};

export default ja;
