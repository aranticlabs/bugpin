import type { EmailTemplate } from '@shared/types';
import { reporterAssignmentHtml } from '../styles.js';

const zh: EmailTemplate = {
  subject: '您的 bug 报告负责人已更新：{{report.title}}',
  html: reporterAssignmentHtml({
    headerTitle: '负责人已更新',
    introWithPrevious:
      '您的 bug 报告已从 <strong>{{previousAssigneeName}}</strong> 重新分配给 <strong>{{assignee.name}}</strong>。',
    introWithoutPrevious: '您的 bug 报告已分配给 <strong>{{assignee.name}}</strong>。',
    labelProject: '项目：',
    labelReport: '报告：',
    labelStatus: '状态：',
    ctaViewReport: '查看报告',
    outro: '感谢您的反馈。我们会持续向您通报后续进展。',
  }),
};

export default zh;
