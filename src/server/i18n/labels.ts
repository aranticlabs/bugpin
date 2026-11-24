import type { LocaleCode, ReportStatus, ReportPriority } from '@shared/types';

export const statusLabels: Record<LocaleCode, Record<ReportStatus, string>> = {
  en: { open: 'Open', in_progress: 'In Progress', resolved: 'Resolved', closed: 'Closed' },
  de: { open: 'Offen', in_progress: 'In Bearbeitung', resolved: 'Gelöst', closed: 'Geschlossen' },
  fr: { open: 'Ouvert', in_progress: 'En cours', resolved: 'Résolu', closed: 'Fermé' },
  nl: { open: 'Open', in_progress: 'In behandeling', resolved: 'Opgelost', closed: 'Gesloten' },
  es: { open: 'Abierto', in_progress: 'En progreso', resolved: 'Resuelto', closed: 'Cerrado' },
  it: { open: 'Aperto', in_progress: 'In corso', resolved: 'Risolto', closed: 'Chiuso' },
  ja: { open: 'オープン', in_progress: '対応中', resolved: '解決済み', closed: 'クローズ' },
  'pt-BR': {
    open: 'Aberto',
    in_progress: 'Em andamento',
    resolved: 'Resolvido',
    closed: 'Fechado',
  },
  zh: { open: '待处理', in_progress: '处理中', resolved: '已解决', closed: '已关闭' },
};

export const priorityLabels: Record<LocaleCode, Record<ReportPriority, string>> = {
  en: { lowest: 'Lowest', low: 'Low', medium: 'Medium', high: 'High', highest: 'Highest' },
  de: {
    lowest: 'Sehr niedrig',
    low: 'Niedrig',
    medium: 'Mittel',
    high: 'Hoch',
    highest: 'Sehr hoch',
  },
  fr: {
    lowest: 'Très basse',
    low: 'Basse',
    medium: 'Moyenne',
    high: 'Haute',
    highest: 'Très haute',
  },
  nl: { lowest: 'Laagste', low: 'Laag', medium: 'Gemiddeld', high: 'Hoog', highest: 'Hoogste' },
  es: { lowest: 'Mínima', low: 'Baja', medium: 'Media', high: 'Alta', highest: 'Máxima' },
  it: { lowest: 'Minima', low: 'Bassa', medium: 'Media', high: 'Alta', highest: 'Massima' },
  ja: { lowest: '最低', low: '低', medium: '中', high: '高', highest: '最高' },
  'pt-BR': { lowest: 'Mínima', low: 'Baixa', medium: 'Média', high: 'Alta', highest: 'Máxima' },
  zh: { lowest: '最低', low: '低', medium: '中', high: '高', highest: '最高' },
};

export function getStatusLabel(status: ReportStatus, locale: LocaleCode): string {
  return statusLabels[locale]?.[status] ?? statusLabels.en[status];
}

export function getPriorityLabel(priority: ReportPriority, locale: LocaleCode): string {
  return priorityLabels[locale]?.[priority] ?? priorityLabels.en[priority];
}

export function formatReportDate(isoDate: string, locale: LocaleCode): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeStyle: 'short' }).format(date);
  } catch {
    return date.toLocaleString();
  }
}
