import * as XLSX from 'xlsx';
import type { Report } from '@shared/types';
import { buildPermalink } from './reportExport';
import { downloadBlob, downloadTextFile } from './reportDownload';

export type ReportShareFormat = 'excel' | 'csv';

export interface ReportShareRow {
  Title: string;
  Description: string;
  URL: string;
}

export function buildReportShareRows(reports: Report[], origin?: string): ReportShareRow[] {
  return reports.map((report) => ({
    Title: report.title,
    Description: report.description ?? '',
    URL: buildPermalink(report.id, origin),
  }));
}

export function reportsShareFilename(format: ReportShareFormat, date = new Date()): string {
  const stamp = date.toISOString().slice(0, 10);
  const extension = format === 'excel' ? 'xlsx' : 'csv';
  return `bugpin-reports-${stamp}.${extension}`;
}

function escapeCsvValue(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildReportsCsv(reports: Report[], origin?: string): string {
  const rows = buildReportShareRows(reports, origin);
  const header = ['Title', 'Description', 'URL'];
  const lines = [
    header.join(','),
    ...rows.map((row) => [row.Title, row.Description, row.URL].map(escapeCsvValue).join(',')),
  ];
  return lines.join('\n');
}

export function downloadReportsAsCsv(reports: Report[]): void {
  const content = buildReportsCsv(reports);
  downloadTextFile(content, reportsShareFilename('csv'), 'text/csv;charset=utf-8');
}

export function downloadReportsAsExcel(reports: Report[]): void {
  const rows = buildReportShareRows(reports);
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Reports');

  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  downloadBlob(blob, reportsShareFilename('excel'));
}

export function downloadReportsShare(reports: Report[], format: ReportShareFormat): void {
  if (format === 'csv') {
    downloadReportsAsCsv(reports);
    return;
  }
  downloadReportsAsExcel(reports);
}
