import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Report } from '@shared/types';
import {
  buildReportShareRows,
  buildReportsCsv,
  downloadReportsAsExcel,
  downloadReportsShare,
  reportsShareFilename,
} from '../../lib/reportsShareExport';
import { downloadBlob, downloadTextFile } from '../../lib/reportDownload';

const jsonToSheet = vi.fn<(rows: unknown) => object>(() => ({}));
const write = vi.fn<() => ArrayBuffer>(() => new Uint8Array([1, 2, 3]).buffer);

vi.mock('xlsx', () => ({
  utils: {
    json_to_sheet: (rows: unknown) => jsonToSheet(rows),
    book_new: () => ({}),
    book_append_sheet: vi.fn(),
  },
  write: () => write(),
}));

function makeReport(overrides: Partial<Report> = {}): Report {
  return {
    id: 'rpt_1',
    projectId: 'prj_1',
    source: 'manual',
    title: 'Checkout broken',
    description: 'Button does not respond',
    status: 'open',
    priority: 'medium',
    reporterLocale: 'en',
    createdAt: '2026-07-07T10:00:00.000Z',
    updatedAt: '2026-07-07T10:00:00.000Z',
    metadata: {
      url: 'https://example.com/checkout',
      timestamp: '2026-07-07T10:00:00.000Z',
    },
    ...overrides,
  };
}

function stubDownloadDom() {
  const createObjectURL = vi.fn(() => 'blob:mock');
  const revokeObjectURL = vi.fn();
  const click = vi.fn();
  const appendChild = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
    (node as HTMLAnchorElement).click = click;
    return node;
  });
  const removeChild = vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);

  vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });

  return {
    createObjectURL,
    revokeObjectURL,
    click,
    restore() {
      appendChild.mockRestore();
      removeChild.mockRestore();
      vi.unstubAllGlobals();
    },
  };
}

describe('buildReportShareRows', () => {
  it('maps title, description, and BugPin detail permalink', () => {
    expect(buildReportShareRows([makeReport()], 'http://localhost:7300')).toEqual([
      {
        Title: 'Checkout broken',
        Description: 'Button does not respond',
        URL: 'http://localhost:7300/admin/reports/rpt_1',
      },
    ]);
  });

  it('falls back to empty description and still includes permalink', () => {
    expect(
      buildReportShareRows([makeReport({ description: undefined })], 'http://localhost:7300')
    ).toEqual([
      {
        Title: 'Checkout broken',
        Description: '',
        URL: 'http://localhost:7300/admin/reports/rpt_1',
      },
    ]);
  });
});

describe('buildReportsCsv', () => {
  it('builds a csv with header, escaped values, and detail permalink', () => {
    const csv = buildReportsCsv(
      [
        makeReport({
          title: 'Needs, quotes',
          description: 'Line 1\nLine 2',
        }),
      ],
      'http://localhost:7300'
    );

    expect(csv).toBe(
      [
        'Title,Description,URL',
        '"Needs, quotes","Line 1\nLine 2",http://localhost:7300/admin/reports/rpt_1',
      ].join('\n')
    );
  });
});

describe('reportsShareFilename', () => {
  it('uses the expected extension per format', () => {
    const date = new Date('2026-07-10T12:00:00.000Z');
    expect(reportsShareFilename('excel', date)).toBe('bugpin-reports-2026-07-10.xlsx');
    expect(reportsShareFilename('csv', date)).toBe('bugpin-reports-2026-07-10.csv');
  });
});

describe('downloadReportsShare', () => {
  beforeEach(() => {
    jsonToSheet.mockClear();
    write.mockClear();
  });

  it('exports excel via blob download with only share columns', () => {
    const dom = stubDownloadDom();

    downloadReportsAsExcel([makeReport()]);

    expect(jsonToSheet).toHaveBeenCalledTimes(1);
    const call = jsonToSheet.mock.calls[0];
    expect(call).toBeDefined();
    const rows = call![0] as Record<string, string>[];
    expect(Object.keys(rows[0])).toEqual(['Title', 'Description', 'URL']);
    expect(write).toHaveBeenCalled();
    expect(dom.createObjectURL).toHaveBeenCalled();
    expect(dom.click).toHaveBeenCalled();

    dom.restore();
  });

  it('exports csv via text download', () => {
    const dom = stubDownloadDom();

    downloadReportsShare([makeReport()], 'csv');

    expect(dom.createObjectURL).toHaveBeenCalled();
    expect(dom.click).toHaveBeenCalled();

    dom.restore();
  });
});

describe('downloadBlob cleanup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('revokes the object url after download', () => {
    const createObjectURL = vi.fn(() => 'blob:cleanup');
    const revokeObjectURL = vi.fn();
    const click = vi.fn();
    const appendChild = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
      (node as HTMLAnchorElement).click = click;
      return node;
    });
    const removeChild = vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);

    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });

    downloadBlob(new Blob(['hello']), 'test.txt');
    expect(revokeObjectURL).not.toHaveBeenCalled();

    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:cleanup');
    expect(removeChild).toHaveBeenCalled();

    appendChild.mockRestore();
    removeChild.mockRestore();
  });

  it('downloadTextFile delegates to downloadBlob', () => {
    const createObjectURL = vi.fn(() => 'blob:text');
    const revokeObjectURL = vi.fn();
    const click = vi.fn();
    const appendChild = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
      (node as HTMLAnchorElement).click = click;
      return node;
    });
    const removeChild = vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);

    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });

    downloadTextFile('a,b', 'file.csv', 'text/csv');
    vi.runAllTimers();

    expect(createObjectURL).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:text');

    appendChild.mockRestore();
    removeChild.mockRestore();
  });
});
